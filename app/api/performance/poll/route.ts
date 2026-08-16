
import { NextResponse } from "next/server";
import { POLLABLE_PLATFORMS, pollPublicMetrics } from "@/lib/performance-poll";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { decryptSecret } from "@/lib/secret-encryption";
import { completeGrowthMissionFromMetrics } from "@/lib/agent/growth-missions";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import { performanceMetricsSchema } from "@/lib/content-schema";

/**
 * Called by the standalone perf-poller Worker (workers/watch-poller/, same
 * Worker as the update-monitoring poll — see its scheduled() handler) on a
 * cron schedule. Unlike /api/watch-sources/[id]/check, there is nothing per
 * source to loop over on the Worker side: this route does the entire sweep
 * itself since it already holds the Supabase admin client, so the Worker's
 * job is just "call this URL periodically".
 *
 * Auth is a shared secret (CRON_PERF_SECRET), not a Supabase session — same
 * pattern as CRON_WATCH_SECRET, deliberately a separate secret so the two
 * cron jobs can be rotated/disabled independently.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_PERF_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Performance polling is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const { data: candidates, error: candidatesError } = await admin
      .from("kit_outputs")
      .select("id, kit_id, user_id, platform, published_url, publish_status")
      .in("platform", POLLABLE_PLATFORMS)
      .in("publish_status", ["posted", "measured"])
      .not("published_url", "is", null);
    if (candidatesError) throw candidatesError;

    const eligible = (candidates ?? []).filter((row) => row.published_url);
    if (eligible.length === 0) {
      return NextResponse.json({ polled: 0, updated: 0, skipped: 0 });
    }

    const userIds = Array.from(new Set(eligible.map((row) => row.user_id)));
    const kitIds = Array.from(new Set(eligible.map((row) => row.kit_id)));
    const [{ data: profiles }, { data: subscriptions }, { data: integrations }, { data: missionKits }] = await Promise.all([
      admin.from("profiles").select("id, plan").in("id", userIds),
      admin
        .from("subscriptions")
        .select("user_id, status, current_period_end")
        .in("user_id", userIds)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false }),
      admin.from("user_integrations").select("user_id, x_bearer_token").in("user_id", userIds),
      admin.from("content_kits").select("id, growth_mission_id").in("id", kitIds)
    ]);
    const missionIdByKit = new Map(
      (missionKits ?? [])
        .filter((kit) => kit.growth_mission_id)
        .map((kit) => [kit.id, kit.growth_mission_id as string])
    );

    const xTokenByUser = new Map<string, string>();
    for (const row of integrations ?? []) {
      if (!row.x_bearer_token) continue;
      try {
        xTokenByUser.set(row.user_id, await decryptSecret(row.x_bearer_token as string));
      } catch (error) {
        console.error(`[performance/poll] failed to decrypt X credential for user=${row.user_id}:`, error);
      }
    }

    const planByUser = new Map((profiles ?? []).map((row) => [row.id, row.plan]));
    const subscriptionsByUser = new Map<string, Array<{ status: string; currentPeriodEnd?: string | null }>>();
    for (const subscription of subscriptions ?? []) {
      const list = subscriptionsByUser.get(subscription.user_id) ?? [];
      list.push({ status: String(subscription.status ?? ""), currentPeriodEnd: subscription.current_period_end });
      subscriptionsByUser.set(subscription.user_id, list);
    }

    // Auto-polling is gated to the Digital Employee tier (proactiveMonitoring)
    // — the same feature flag that gates update-monitoring, since both are
    // unattended background work done on the user's behalf.
    const eligibleUsers = new Set(
      userIds.filter((userId) => {
        const activeSubscription = getActiveSubscription(subscriptionsByUser.get(userId) ?? []);
        const effectivePlan = resolveEffectivePlan(planByUser.get(userId), activeSubscription);
        return getPlanFeatures(effectivePlan).proactiveMonitoring;
      })
    );

    let updated = 0;
    let skipped = 0;

    // Sequential: this is unattended background work with no user waiting,
    // and it's polite to third-party APIs (Reddit/HN/Product Hunt) that
    // aren't ours to hammer with a burst of concurrent requests.
    for (const row of eligible) {
      if (!eligibleUsers.has(row.user_id) || !row.published_url) {
        skipped += 1;
        continue;
      }

      // "x" is the one pollable platform with a user-supplied credential
      // instead of a public/app-level one — skip it cleanly (not an error)
      // when this user hasn't connected a token yet.
      if (row.platform === "x" && !xTokenByUser.has(row.user_id)) {
        skipped += 1;
        continue;
      }

      const polled = await pollPublicMetrics(
        row.platform as (typeof POLLABLE_PLATFORMS)[number],
        row.published_url,
        { xBearerToken: xTokenByUser.get(row.user_id) }
      );
      if (!polled) {
        skipped += 1;
        continue;
      }

      const { data: existing } = await admin
        .from("performance_metrics")
        .select("impressions, views, clicks, cover_click_rate, average_view_seconds, saves, shares, follower_growth, profile_visits, leads, signups, revenue, source")
        .eq("kit_id", row.kit_id)
        .eq("platform", row.platform)
        .maybeSingle();

      const measuredAt = new Date().toISOString();
      const mergedRow = {
        kit_id: row.kit_id,
        user_id: row.user_id,
        platform: row.platform,
        impressions: existing?.impressions ?? 0,
        views: existing?.views ?? 0,
        clicks: existing?.clicks ?? 0,
        cover_click_rate: existing?.cover_click_rate ?? 0,
        average_view_seconds: existing?.average_view_seconds ?? 0,
        likes: polled.likes,
        comments: polled.comments,
        saves: existing?.saves ?? 0,
        shares: existing?.shares ?? 0,
        follower_growth: existing?.follower_growth ?? 0,
        profile_visits: existing?.profile_visits ?? 0,
        leads: existing?.leads ?? 0,
        signups: existing?.signups ?? 0,
        revenue: existing?.revenue ?? 0,
        published_url: row.published_url,
        measured_at: measuredAt,
        // A manually-entered or AI-imported row keeps its provenance label
        // even though auto-polling refreshed likes/comments — only a brand
        // new row (nothing entered yet) is labeled "auto".
        source: existing?.source ?? "auto"
      };

      const { error: upsertError } = await admin
        .from("performance_metrics")
        .upsert(mergedRow, { onConflict: "kit_id,platform" });
      if (upsertError) {
        console.error(`[performance-poll] upsert failed for output=${row.id}:`, JSON.stringify(upsertError));
        skipped += 1;
        continue;
      }

      // Snapshot is always tagged "auto" regardless of the live row's
      // provenance — it records that THIS write came from the poller.
      await admin.from("performance_snapshots").insert({ ...mergedRow, source: "auto" });

      let nextPublishStatus = "measured";
      const missionId = missionIdByKit.get(row.kit_id);
      if (missionId) {
        try {
          const mission = await completeGrowthMissionFromMetrics(
            admin,
            row.user_id,
            missionId,
            performanceMetricsSchema.parse({
              platform: row.platform,
              impressions: mergedRow.impressions,
              views: mergedRow.views,
              clicks: mergedRow.clicks,
              coverClickRate: mergedRow.cover_click_rate,
              averageViewSeconds: mergedRow.average_view_seconds,
              likes: mergedRow.likes,
              comments: mergedRow.comments,
              saves: mergedRow.saves,
              shares: mergedRow.shares,
              followerGrowth: mergedRow.follower_growth,
              profileVisits: mergedRow.profile_visits,
              leads: mergedRow.leads,
              signups: mergedRow.signups,
              revenue: mergedRow.revenue,
              publishedUrl: mergedRow.published_url,
              measuredAt,
              source: "auto"
            })
          );
          if (mission?.status === "completed") nextPublishStatus = "iterated";
        } catch (error) {
          console.error(`[performance-poll] mission evaluation failed for kit=${row.kit_id}:`, error);
        }
      }

      if (row.publish_status !== nextPublishStatus) {
        await admin.from("kit_outputs").update({ publish_status: nextPublishStatus }).eq("id", row.id);
      }

      try {
        await advancePatrolAfterEvent(admin, row.user_id, {
          type: "metrics_saved",
          kitId: row.kit_id,
          platform: row.platform,
          missionId
        });
      } catch (error) {
        console.error(`[performance-poll] Agent patrol advancement failed for kit=${row.kit_id}:`, error);
      }

      updated += 1;
    }

    return NextResponse.json({ polled: eligible.length, updated, skipped });
  } catch (error) {
    console.error("[performance/poll] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to poll performance metrics." },
      { status: 500 }
    );
  }
}
