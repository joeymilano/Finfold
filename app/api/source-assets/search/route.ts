import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  detectClearEntityQuery,
  discoverSourceImages,
  sha256Hex,
  type UnsignedSourceImageCandidate
} from "@/lib/source-image-discovery";
import { attachSourceImageSelectionTokens } from "@/lib/source-image-token";
import { logInfo } from "@/lib/observability";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { resolveWikidataOfficialSourcePages } from "@/lib/wikidata-source-resolver";

const requestSchema = z.object({ query: z.string().trim().min(2).max(2_000) });

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (process.env.SOURCE_IMAGE_SEARCH_ENABLED !== "true") {
      return NextResponse.json({ enabled: false, status: "disabled", candidates: [] });
    }
    if (!checkRateLimit(`source-image-search:${userId}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Image source search is temporarily rate limited." }, { status: 429 });
    }
    // A single resolution can make up to three sequential Wikidata reads.
    // Keep a conservative per-isolate ceiling below Wikimedia's published
    // identified-client allowance; 429 responses still fail closed upstream.
    if (!checkRateLimit("source-image-search:wikidata:global", 50, 60 * 1000)) {
      return NextResponse.json({ error: "Official entity lookup is temporarily rate limited." }, { status: 429 });
    }
    const input = requestSchema.parse(await request.json());
    const entity = detectClearEntityQuery(input.query);
    if (!entity) {
      return NextResponse.json({ enabled: true, status: "not_applicable", candidates: [] });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Image source search needs Finfold storage." }, { status: 503 });
    const resolution = await resolveWikidataOfficialSourcePages(entity);

    const collected: UnsignedSourceImageCandidate[] = [];
    let selectedSource: Awaited<ReturnType<typeof discoverSourceImages>>["source"] | null = null;
    for (const page of resolution.pages.slice(0, 4)) {
      const discovery = await discoverSourceImages({
        userId,
        url: page.url,
        admin,
        provider: "official_page"
      });
      if (!selectedSource) selectedSource = discovery.source;
      collected.push(...discovery.candidates.map((candidate) => ({
        ...candidate,
        confidence: page.confidence === "high"
          ? candidate.confidence
          : candidate.confidence === "high"
            ? "medium" as const
            : candidate.confidence
      })));
      if (page.confidence === "high" && collected.some((candidate) => candidate.confidence === "high")) break;
    }

    const candidates = dedupeCandidates(collected)
      .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence) || right.score - left.score)
      .slice(0, 8);
    const signed = await attachSourceImageSelectionTokens(userId, candidates);
    const top = signed[0];
    logInfo("source_image_search_completed", { userId }, {
      entity_hash: await sha256Hex(entity.toLowerCase()),
      resolver: "wikidata",
      domain: top?.domain ?? null,
      confidence: top?.confidence ?? null,
      candidate_count: signed.length
    });
    return NextResponse.json({
      enabled: true,
      status: signed.length > 0 ? "matched" : "no_match",
      entity,
      resolver: "wikidata",
      matchedEntity: resolution.matchedEntity,
      source: selectedSource,
      imageCandidates: signed,
      candidates: signed
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to search for an official image." }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Image search request or response was invalid." }, { status: 400 });
    }
    console.error("[source-assets/search] failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Official image search is temporarily unavailable." }, { status: 502 });
  }
}

function dedupeCandidates(candidates: UnsignedSourceImageCandidate[]): UnsignedSourceImageCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.originalUrl)) return false;
    seen.add(candidate.originalUrl);
    return true;
  });
}

function confidenceRank(value: "high" | "medium" | "low"): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}
