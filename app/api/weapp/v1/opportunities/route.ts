import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { authenticateWeappRequest } from "@/lib/weapp/auth";
import { loadOpportunityRadar } from "@/lib/trends/service";
import { trendWindowSchema, type TopicOpportunity } from "@/lib/trends/types";
import { isLocalMockMode } from "@/lib/runtime-mode";

/** WeApp radar feed — the same pipeline as the web radar, trimmed for mobile. */

function toCard(opportunity: TopicOpportunity) {
  const localized = opportunity.localizedContent?.zh;
  return {
    id: opportunity.id,
    title: localized?.title ?? opportunity.title,
    fact: localized?.fact ?? opportunity.fact,
    whyNow: localized?.whyNow ?? opportunity.whyNow,
    whyYou: localized?.whyYou ?? opportunity.whyYou,
    mainAngle: localized?.mainAngle ?? opportunity.mainAngle,
    alternateAngles: localized?.alternateAngles ?? opportunity.alternateAngles,
    recommendedPlatform: opportunity.recommendedPlatform,
    recommendedFormat: localized?.recommendedFormat ?? opportunity.recommendedFormat,
    matchScore: opportunity.matchScore,
    lifecycle: opportunity.lifecycle,
    analysisStatus: opportunity.analysisStatus,
    keywords: opportunity.keywords.slice(0, 6),
    evidenceCount: opportunity.evidence.length,
    evidence: opportunity.evidence.slice(0, 3).map((item) => ({
      title: localized?.evidenceTitles?.[item.id] ?? item.title,
      url: item.url,
      source: item.source
    })),
    lastSeenAt: opportunity.lastSeenAt
  };
}

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    if (isLocalMockMode()) {
      return NextResponse.json({ opportunities: [], window: "24h", generatedAt: new Date().toISOString(), profileReady: false });
    }
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const window = trendWindowSchema.catch("24h").parse(url.searchParams.get("window") ?? "24h");
  const requestedLimit = Number(url.searchParams.get("limit") ?? "8");
  const limit = Math.min(12, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 8));
  try {
    const radar = await loadOpportunityRadar(admin, session.userId, window, limit, { locale: "zh" });
    return NextResponse.json({
      opportunities: radar.opportunities.map(toCard),
      window: radar.window,
      generatedAt: radar.generatedAt,
      profileReady: radar.profileReady,
      latestSignalAt: radar.latestSignalAt,
      collectionStatus: radar.collectionStatus,
      localizationStatus: radar.localizationStatus
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : null;
    if (["42P01", "PGRST202", "PGRST205"].includes(String(code))) {
      return NextResponse.json({ error: "机会雷达需要先应用数据库迁移 097–098。" }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "暂时无法加载机会雷达。" },
      { status: 400 }
    );
  }
}
