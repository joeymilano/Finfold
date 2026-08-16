import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { parseBoundedJson, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { brandBrainSchema } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { platformIdSchema } from "@/lib/content-schema";
import { fetchHighPerformers } from "@/lib/performance-examples";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { assessToneAlignment, buildToneBaseline, type ToneDriftAssessment } from "@/lib/tone-drift";

const MAX_REQUEST_BYTES = 64 * 1024;
const ANALYSIS_MAX_EXAMPLES = 3;
const ANALYSIS_MAX_BODY_CHARS = 1_200;

const requestSchema = z.object({
  kitId: z.string().uuid(),
  outputs: z.array(z.object({
    id: z.string().uuid(),
    // This is validated for client hygiene but replaced with the persisted
    // platform after ownership verification below.
    platform: platformIdSchema,
    title: z.string().trim().max(500),
    body: z.string().trim().min(1).max(12_000),
    cta: z.string().trim().min(1).max(1_000)
  })).min(1).max(13)
});

type ToneDriftInput = z.infer<typeof requestSchema>;

function unavailableAssessments(input: ToneDriftInput): Record<string, ToneDriftAssessment> {
  return Object.fromEntries(
    input.outputs.map((output) => [
      output.id,
      assessToneAlignment({ title: output.title, body: output.body, cta: output.cta }, null)
    ])
  );
}

/**
 * Provides an advisory-only, user-scoped comparison between the draft text in
 * the workbench and that user's own successful reference posts. It never saves
 * the submitted draft text and must not be used to gate publication.
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "tone-drift-check",
    limit: 30,
    windowMs: 60_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const input = requestSchema.parse(await parseBoundedJson(request, MAX_REQUEST_BYTES));
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ assessments: unavailableAssessments(input) });
    }

    const outputIds = input.outputs.map((output) => output.id);
    const { data: ownedOutputs, error: outputsError } = await admin
      .from("kit_outputs")
      .select("id, platform")
      .eq("kit_id", input.kitId)
      .eq("user_id", userId)
      .in("id", outputIds);

    if (outputsError) {
      console.error("[tone-drift] output ownership lookup failed:", JSON.stringify(outputsError));
      return NextResponse.json({ assessments: unavailableAssessments(input) });
    }
    if (!ownedOutputs || ownedOutputs.length !== outputIds.length) {
      return NextResponse.json({ error: "One or more outputs were not found." }, { status: 404 });
    }

    const platformByOutputId = new Map(
      ownedOutputs.map((output) => [String(output.id), String(output.platform)])
    );
    const platforms = [...new Set([...platformByOutputId.values()])];

    const { data: brainRow, error: brainError } = await admin
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (brainError) console.error("[tone-drift] brand memory lookup failed:", JSON.stringify(brainError));
    const brain = brainRow && !brainError ? mapBrandBrainFromRow(brainRow) : brandBrainSchema.parse({});

    let highPerformers: Record<string, Awaited<ReturnType<typeof fetchHighPerformers>>[string]> = {};
    try {
      highPerformers = await fetchHighPerformers(admin, userId, platforms, {
        maxExamplesPerPlatform: ANALYSIS_MAX_EXAMPLES,
        maxBodyChars: ANALYSIS_MAX_BODY_CHARS
      });
    } catch (error) {
      // The brand-memory fallback remains useful when metrics storage has a
      // temporary issue. This is an advisory, so never fail the workbench.
      console.error("[tone-drift] performance lookup failed:", error);
    }

    const brandMemoryExamples = brain.approvedExamples.map((body) => ({ title: "", body, cta: "" }));
    const assessments = Object.fromEntries(input.outputs.map((output) => {
      const platform = platformByOutputId.get(output.id)!;
      const performanceExamples = (highPerformers[platform] ?? []).map((example) => ({
        title: example.title,
        body: example.body,
        cta: ""
      }));
      const baseline = buildToneBaseline({
        performanceExamples,
        // Successful same-platform examples are the primary reference. Brand
        // examples only supplement a sparse baseline because they have no
        // platform metadata.
        brandMemoryExamples: performanceExamples.length >= ANALYSIS_MAX_EXAMPLES ? [] : brandMemoryExamples,
        toneKeywords: brain.toneKeywords
      });
      return [
        output.id,
        assessToneAlignment({ title: output.title, body: output.body, cta: output.cta }, baseline, brain.toneKeywords)
      ];
    }));

    return NextResponse.json({ assessments });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to review voice alignment." }, { status: 401 });
    }
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Draft review payload is too large." }, { status: 413 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid draft review request." }, { status: 400 });
    }
    console.error("[tone-drift] check failed:", error);
    return NextResponse.json({ error: "Voice alignment is temporarily unavailable." }, { status: 503 });
  }
}