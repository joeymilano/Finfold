import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { authenticateWeappRequest } from "@/lib/weapp/auth";
import { loadOpportunityRadar } from "@/lib/trends/service";

const idSchema = z.string().uuid();

/**
 * Detail lookup for a single opportunity. The radar only serves live cards
 * from the current window, so the detail is found within the loaded list —
 * an id outside the window is legitimately "not found" until it re-appears.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const radar = await loadOpportunityRadar(admin, session.userId, "24h", 12, { locale: "zh" });
    const sevenDay = radar.opportunities.length
      ? radar.opportunities
      : (await loadOpportunityRadar(admin, session.userId, "7d", 12, { locale: "zh" })).opportunities;
    const found = sevenDay.find((item) => item.id === parsedId.data);
    if (!found) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });

    const localized = found.localizedContent?.zh;
    return NextResponse.json({
      id: found.id,
      title: localized?.title ?? found.title,
      fact: localized?.fact ?? found.fact,
      whyNow: localized?.whyNow ?? found.whyNow,
      whyYou: localized?.whyYou ?? found.whyYou,
      mainAngle: localized?.mainAngle ?? found.mainAngle,
      alternateAngles: localized?.alternateAngles ?? found.alternateAngles,
      recommendedPlatform: found.recommendedPlatform,
      recommendedFormat: localized?.recommendedFormat ?? found.recommendedFormat,
      matchScore: found.matchScore,
      rankScore: found.rankScore,
      lifecycle: found.lifecycle,
      analysisStatus: found.analysisStatus,
      keywords: found.keywords,
      matchDimensions: found.matchDimensions,
      evidence: found.evidence.map((item) => ({
        title: localized?.evidenceTitles?.[item.id] ?? item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt
      })),
      lastSeenAt: found.lastSeenAt
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "暂时无法加载机会详情。" },
      { status: 400 }
    );
  }
}
