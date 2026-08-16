
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { getOpenPatrolItem } from "@/lib/agent/patrol";

type LearnedRule = { kind: "style" | "avoid" | "performance"; text: string };

function emptySummary() {
  return {
    toReview: 0,
    awaitingMetrics: 0,
    closedLoops: 0,
    publishedThisWeek: 0,
    daysSinceLastPublish: null,
    automatedSignalsThisWeek: 0,
    outcomes: { views: 0, engagement: 0, followerGrowth: 0, profileVisits: 0, leads: 0, signups: 0, revenue: 0 },
    learnedRules: [] as LearnedRule[],
    nextAction: { kind: "create", href: "/workbench" },
    dutyItem: null
  };
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ summary: emptySummary(), persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Growth cycle summary") }, { status: 503 });
    }

    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [outputsResult, metricsResult, brainResult, signalsResult, dutyItem] = await Promise.all([
      admin
        .from("kit_outputs")
        .select("id, kit_id, publish_status, published_at, updated_at")
        .eq("user_id", userId),
      admin
        .from("performance_metrics")
        .select("kit_id, views, clicks, likes, comments, saves, shares, follower_growth, profile_visits, leads, signups, revenue")
        .eq("user_id", userId),
      admin
        .from("brand_brains")
        .select("learned_style, learned_negative, performance_rules")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("drafted_kits")
        .select("id, created_at")
        .eq("user_id", userId)
        .gte("created_at", weekStart),
      getOpenPatrolItem(admin, userId).catch((error) => {
        console.error("[dashboard/summary] duty queue query failed:", error);
        return null;
      })
    ]);

    for (const [name, result] of [
      ["outputs", outputsResult],
      ["metrics", metricsResult],
      ["brain", brainResult],
      ["signals", signalsResult]
    ] as const) {
      if (result.error) console.error(`[dashboard/summary] ${name} query failed:`, JSON.stringify(result.error));
    }

    const outputs = outputsResult.data ?? [];
    const metrics = metricsResult.data ?? [];
    const measuredKitIds = new Set(metrics.map((row) => String(row.kit_id)));
    for (const output of outputs) {
      if (output.publish_status === "measured" || output.publish_status === "iterated") {
        measuredKitIds.add(String(output.kit_id));
      }
    }

    const brain = brainResult.data;
    const learnedRules: LearnedRule[] = [
      ...toRules(brain?.performance_rules, "performance"),
      ...toRules(brain?.learned_style, "style"),
      ...toRules(brain?.learned_negative, "avoid")
    ].slice(0, 6);

    const toReview = outputs.filter((output) => output.publish_status === "draft" || output.publish_status === "planned").length;
    const awaitingMetricsRows = outputs.filter((output) => output.publish_status === "posted");
    const publishedThisWeek = outputs.filter((output) => output.published_at && output.published_at >= weekStart).length;

    const outcomes = metrics.reduce(
      (total, row) => ({
        views: total.views + Number(row.views ?? row.clicks ?? 0),
        engagement: total.engagement + Number(row.likes ?? 0) + Number(row.comments ?? 0) + Number(row.saves ?? 0) + Number(row.shares ?? 0),
        followerGrowth: total.followerGrowth + Number(row.follower_growth ?? 0),
        profileVisits: total.profileVisits + Number(row.profile_visits ?? 0),
        leads: total.leads + Number(row.leads ?? 0),
        signups: total.signups + Number(row.signups ?? 0),
        revenue: total.revenue + Number(row.revenue ?? 0)
      }),
      { views: 0, engagement: 0, followerGrowth: 0, profileVisits: 0, leads: 0, signups: 0, revenue: 0 }
    );

    // 断更提醒（P1-3 值班卡）：距上次发布的天数，null 表示从未发布。
    const publishDates = outputs
      .map((output) => output.published_at)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => (a < b ? 1 : -1));
    const daysSinceLastPublish = publishDates.length
      ? Math.floor((Date.now() - new Date(publishDates[0]).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    const latestDraft = outputs.find((output) => output.publish_status === "draft" || output.publish_status === "planned");
    const latestPosted = awaitingMetricsRows[0];
    const nextAction = latestPosted
      ? { kind: "measure", href: `/kits/${latestPosted.kit_id}` }
      : latestDraft
        ? { kind: "review", href: `/kits/${latestDraft.kit_id}` }
        : { kind: outputs.length > 0 ? "next-cycle" : "create", href: "/workbench" };

    return NextResponse.json({
      summary: {
        toReview,
        awaitingMetrics: awaitingMetricsRows.length,
        closedLoops: measuredKitIds.size,
        publishedThisWeek,
        daysSinceLastPublish,
        automatedSignalsThisWeek: signalsResult.data?.length ?? 0,
        outcomes,
        learnedRules,
        nextAction,
        dutyItem
      },
      persisted: true
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view your growth cycle." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load growth cycle summary." },
      { status: 400 }
    );
  }
}

function toRules(value: unknown, kind: LearnedRule["kind"]): LearnedRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((text) => ({ kind, text }));
}
