export const runtime = "edge";

import { NextResponse } from "next/server";
import { performancePayloadSchema } from "@/lib/content-schema";
import { listMockPerformance, saveMockPerformance } from "@/lib/mock-store";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kitId = searchParams.get("kitId");
  if (!kitId) return NextResponse.json({ error: "kitId is required." }, { status: 400 });

  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ metrics: listMockPerformance(kitId) });

    const { data, error } = await supabase
      .from("performance_metrics")
      .select("platform, impressions, clicks, likes, comments, saves, shares, leads, signups, revenue, published_url, measured_at")
      .eq("kit_id", kitId)
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ metrics: (data ?? []).map((row) => ({
      platform: row.platform,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      likes: row.likes ?? 0,
      comments: row.comments ?? 0,
      saves: row.saves ?? 0,
      shares: row.shares ?? 0,
      leads: row.leads ?? 0,
      signups: row.signups ?? 0,
      revenue: Number(row.revenue ?? 0),
      publishedUrl: row.published_url ?? "",
      measuredAt: row.measured_at
    })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load performance." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const payload = performancePayloadSchema.parse(await request.json());
    const metrics = { ...payload.metrics, measuredAt: new Date().toISOString() };
    const supabase = createSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ metrics: saveMockPerformance(payload.kitId, metrics) });

    const { error } = await supabase.from("performance_metrics").upsert({
      kit_id: payload.kitId,
      user_id: userId,
      platform: metrics.platform,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      likes: metrics.likes,
      comments: metrics.comments,
      saves: metrics.saves,
      shares: metrics.shares,
      leads: metrics.leads,
      signups: metrics.signups,
      revenue: metrics.revenue,
      published_url: metrics.publishedUrl || null,
      measured_at: metrics.measuredAt
    }, { onConflict: "kit_id,platform" });
    if (error) throw error;
    return NextResponse.json({ metrics });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save performance." }, { status: 400 });
  }
}
