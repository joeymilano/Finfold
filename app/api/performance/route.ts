
import { NextResponse } from "next/server";
import { performancePayloadSchema } from "@/lib/content-schema";
import { listMockPerformance, saveMockPerformance } from "@/lib/mock-store";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { completeGrowthMissionFromMetrics, type GrowthMission } from "@/lib/agent/growth-missions";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import { markXhsWorkflowReadyForReview } from "@/lib/agent/xhs-workflow";

/**
 * Extract a human-readable message from a thrown value. Supabase query
 * failures arrive as PostgrestError objects ({ message, code, ... }) which
 * are NOT instances of Error, so a plain `instanceof Error` check collapses
 * every database error into an opaque fallback (e.g. "Failed to load
 * performance."). Read .message off any object that carries one first.
 */
function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kitId = searchParams.get("kitId");
  if (!kitId) return NextResponse.json({ error: "kitId is required." }, { status: 400 });

  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ metrics: listMockPerformance(kitId) });
      return NextResponse.json({ error: persistenceUnavailableMessage("Performance history") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("performance_metrics")
      .select("platform, impressions, views, clicks, cover_click_rate, average_view_seconds, likes, comments, saves, shares, follower_growth, profile_visits, leads, signups, revenue, published_url, measured_at, source")
      .eq("kit_id", kitId)
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ metrics: (data ?? []).map((row) => ({
      platform: row.platform,
      impressions: row.impressions ?? 0,
      views: row.views ?? 0,
      clicks: row.clicks ?? 0,
      coverClickRate: Number(row.cover_click_rate ?? 0),
      averageViewSeconds: Number(row.average_view_seconds ?? 0),
      likes: row.likes ?? 0,
      comments: row.comments ?? 0,
      saves: row.saves ?? 0,
      shares: row.shares ?? 0,
      followerGrowth: row.follower_growth ?? 0,
      profileVisits: row.profile_visits ?? 0,
      leads: row.leads ?? 0,
      signups: row.signups ?? 0,
      revenue: Number(row.revenue ?? 0),
      publishedUrl: row.published_url ?? "",
      measuredAt: row.measured_at,
      source: row.source ?? "manual"
    })) });
  } catch (error) {
    return NextResponse.json({ error: resolveErrorMessage(error, "Failed to load performance.") }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const payload = performancePayloadSchema.parse(await request.json());
    const metrics = { ...payload.metrics, measuredAt: new Date().toISOString() };
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ metrics: saveMockPerformance(payload.kitId, metrics) });
      return NextResponse.json({ error: persistenceUnavailableMessage("Performance tracking") }, { status: 503 });
    }

    // Verify the kit belongs to the caller before writing — otherwise a
    // user who knows/guesses another user's kit UUID could upsert on
    // (kit_id, platform) and reassign that row's user_id to themselves,
    // since this uses the service-role client which bypasses RLS.
    let kitLookup = await supabase
      .from("content_kits")
      .select("id, growth_mission_id, xhs_workflow_id")
      .eq("id", payload.kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (kitLookup.error && /xhs_workflow_id|schema cache/i.test(kitLookup.error.message ?? "")) {
      kitLookup = await supabase
        .from("content_kits")
        .select("id, growth_mission_id")
        .eq("id", payload.kitId)
        .eq("user_id", userId)
        .maybeSingle();
    }
    const { data: kit, error: kitLookupError } = kitLookup;
    if (kitLookupError) throw kitLookupError;
    if (!kit) {
      return NextResponse.json({ error: "Kit not found." }, { status: 404 });
    }

    const row = {
      kit_id: payload.kitId,
      user_id: userId,
      platform: metrics.platform,
      impressions: metrics.impressions,
      views: metrics.views,
      clicks: metrics.clicks,
      cover_click_rate: metrics.coverClickRate,
      average_view_seconds: metrics.averageViewSeconds,
      likes: metrics.likes,
      comments: metrics.comments,
      saves: metrics.saves,
      shares: metrics.shares,
      follower_growth: metrics.followerGrowth,
      profile_visits: metrics.profileVisits,
      leads: metrics.leads,
      signups: metrics.signups,
      revenue: metrics.revenue,
      published_url: metrics.publishedUrl || null,
      measured_at: metrics.measuredAt,
      source: metrics.source
    };

    const { error } = await supabase.from("performance_metrics").upsert(row, { onConflict: "kit_id,platform" });
    if (error) throw error;

    // Append-only history for future trend charts / auto-pollers — see
    // migration 022. Non-critical: a failure here must not block the save
    // the user is actually waiting on.
    const { error: snapshotError } = await supabase.from("performance_snapshots").insert(row);
    if (snapshotError) {
      console.error("[performance] Failed to write snapshot:", JSON.stringify(snapshotError));
    }

    // Saving a metric means the platform was posted and is now measured —
    // reflect that on kit_outputs, and capture the published URL/first-seen
    // timestamp if the user provided one. Non-critical: log-and-continue.
    const outputPatch: Record<string, unknown> = { publish_status: "measured" };
    if (metrics.publishedUrl) {
      outputPatch.published_url = metrics.publishedUrl;
      const { data: existingOutput } = await supabase
        .from("kit_outputs")
        .select("published_at")
        .eq("kit_id", payload.kitId)
        .eq("user_id", userId)
        .eq("platform", metrics.platform)
        .maybeSingle();
      if (!existingOutput?.published_at) {
        outputPatch.published_at = metrics.measuredAt;
      }
    }
    const { error: outputUpdateError } = await supabase
      .from("kit_outputs")
      .update(outputPatch)
      .eq("kit_id", payload.kitId)
      .eq("user_id", userId)
      .eq("platform", metrics.platform);
    if (outputUpdateError) {
      console.error("[performance] Failed to update kit_outputs publish status:", JSON.stringify(outputUpdateError));
    }

    let mission: GrowthMission | null = null;
    if (kit.growth_mission_id) {
      try {
        mission = await completeGrowthMissionFromMetrics(
          supabase,
          userId,
          kit.growth_mission_id,
          metrics
        );
        if (mission?.status === "completed") {
          const { error: iteratedStatusError } = await supabase
            .from("kit_outputs")
            .update({ publish_status: "iterated" })
            .eq("kit_id", payload.kitId)
            .eq("user_id", userId)
            .eq("platform", metrics.platform);
          if (iteratedStatusError) {
            console.error("[performance] Failed to mark evaluated output as iterated:", JSON.stringify(iteratedStatusError));
          }
        }
      } catch (error) {
        // The user's metric is already stored. Keep that write successful
        // and surface the mission transition failure in logs for repair.
        console.error("[performance] Growth Mission evaluation failed:", error);
      }
    }
    if (metrics.platform === "xiaohongshu" && "xhs_workflow_id" in kit && kit.xhs_workflow_id) {
      try {
        await markXhsWorkflowReadyForReview(supabase, userId, String(kit.xhs_workflow_id));
      } catch (error) {
        console.error("[performance] Xiaohongshu workflow transition failed:", error);
      }
    }

    let dutyItem = null;
    try {
      dutyItem = await advancePatrolAfterEvent(supabase, userId, {
        type: "metrics_saved",
        kitId: payload.kitId,
        platform: metrics.platform,
        missionId: kit.growth_mission_id
      });
    } catch (error) {
      console.error("[performance] Agent patrol advancement failed:", error);
    }

    return NextResponse.json({
      metrics,
      mission,
      dutyItem,
      xhsWorkflowId: "xhs_workflow_id" in kit ? kit.xhs_workflow_id ?? null : null
    });
  } catch (error) {
    return NextResponse.json({ error: resolveErrorMessage(error, "Failed to save performance.") }, { status: 400 });
  }
}
