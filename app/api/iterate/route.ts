
import { NextResponse } from "next/server";
import { iterateRequestSchema, type IterationReport } from "@/lib/content-schema";
import { listMockIterationReports, saveMockIterationReport } from "@/lib/mock-store";
import { getPlatform } from "@/lib/platforms";
import { buildLLMIterationReport } from "@/lib/iteration-report";
import { buildGrowthBriefing, type GrowthMetricSample } from "@/lib/agent/growth-briefing";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits, type PlanId } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kitId = searchParams.get("kitId");
  if (!kitId) return NextResponse.json({ error: "kitId is required." }, { status: 400 });

  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ reports: listMockIterationReports(kitId) });
      return NextResponse.json({ error: persistenceUnavailableMessage("Iteration history") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("iteration_reports")
      .select("id, kit_id, summary, wins, problems, next_actions, created_at")
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const reports: IterationReport[] = (data ?? []).map((row) => ({
      id: row.id,
      kitId: row.kit_id,
      summary: row.summary,
      wins: row.wins ?? [],
      problems: row.problems ?? [],
      nextActions: row.next_actions ?? [],
      createdAt: row.created_at
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view iteration history." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load iteration reports." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = iterateRequestSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    if (!supabase && !isLocalMockMode()) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Iteration reports") }, { status: 503 });
    }
    let effectivePlan: PlanId | "free" = "free";
    if (supabase) {
      // Verify the kit belongs to the caller before generating (and
      // persisting) a report tied to it.
      const { data: kit, error: kitLookupError } = await supabase
        .from("content_kits")
        .select("id")
        .eq("id", input.kitId)
        .eq("user_id", userId)
        .maybeSingle();
      if (kitLookupError) throw kitLookupError;
      if (!kit) {
        return NextResponse.json({ error: "Kit not found." }, { status: 404 });
      }

      const [{ data: profile }, { data: subscriptions }] = await Promise.all([
        supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", userId)
          .eq("payment_provider", "creem")
          .order("updated_at", { ascending: false })
      ]);
      effectivePlan = resolveEffectivePlan(
        profile?.plan,
        getActiveSubscription(
          (subscriptions ?? []).map((subscription) => ({
            status: String(subscription.status ?? ""),
            currentPeriodEnd: subscription.current_period_end
          }))
        )
      );
    }

    const reportBuild = await buildReportBody(
      userId,
      input,
      effectivePlan,
      request.headers.get("Idempotency-Key")
    );
    if (reportBuild.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reportBuild.outcome === "existing") {
      return NextResponse.json({ error: "This iteration request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    const report: IterationReport = {
      id: crypto.randomUUID(),
      kitId: input.kitId,
      ...reportBuild.report,
      createdAt: new Date().toISOString()
    };

    if (isLocalMockMode()) saveMockIterationReport(report);

    if (supabase) {
      const { error: insertError } = await supabase.from("iteration_reports").insert({
        id: report.id,
        kit_id: report.kitId,
        user_id: userId,
        summary: report.summary,
        wins: report.wins,
        problems: report.problems,
        next_actions: report.nextActions,
        created_at: report.createdAt
      });
      if (insertError) {
        console.error("[iterate] Failed to persist iteration report:", JSON.stringify(insertError));
      }
    }

    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to generate an iteration report." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create iteration report." }, { status: 400 });
  }
}

/**
 * Growth+ gets a real LLM-authored report (buildLLMIterationReport reads
 * the kit's actual copy alongside its metrics); everyone else — and Growth+
 * whenever the LLM call fails — gets the deterministic heuristic report
 * below. The heuristic path is intentionally kept as the fallback rather
 * than an error, since a report a tier down is better than no report.
 */
async function buildReportBody(
  userId: string,
  input: ReturnType<typeof iterateRequestSchema.parse>,
  effectivePlan: PlanId | "free",
  idempotencyKey: string | null
): Promise<
  | { outcome: "ready"; report: Omit<IterationReport, "id" | "kitId" | "createdAt"> }
  | { outcome: "insufficient_credits" }
  | { outcome: "existing" }
> {
  if (!getPlanFeatures(effectivePlan).iterateReport) {
    return { outcome: "ready", report: buildHeuristicReport(input) };
  }

  await ensurePlanCredits(userId, effectivePlan);
  const requestId = resolveGenerationRequestId(idempotencyKey);
  const billing = createAiUsageBilling({
    operationKey: `iteration-report:${userId}:${requestId}`,
    userId,
    action: "aiScoreOptimize",
    cost: ACTION_CREDITS.aiScoreOptimize,
    source: "iteration_report",
    detail: {
      requestId,
      platformCount: input.outputs.length,
      inputFingerprint: await hashGenerationRequest(input)
    }
  });
  const reservation = await billing.reserveAndStart();
  if (reservation.outcome === "insufficient_credits") return { outcome: "insufficient_credits" };
  if (reservation.outcome === "existing") return { outcome: "existing" };

  let reportReady = false;
  try {
    const report = await buildLLMIterationReport(input);
    reportReady = true;
    await billing.settle();
    return { outcome: "ready", report };
  } catch (error) {
    if (reportReady) throw error;
    await billing.refund("iteration_report_failed").catch(() => undefined);
    console.error("[iterate] LLM report failed, falling back to heuristic:", error);
    return { outcome: "ready", report: buildHeuristicReport(input) };
  }
}

function buildHeuristicReport(input: ReturnType<typeof iterateRequestSchema.parse>): Omit<IterationReport, "id" | "kitId" | "createdAt"> {
  const isZh = input.language === "zh";
  const titleByPlatform = new Map(input.outputs.map((output) => [output.platform, output.title]));
  const samples: GrowthMetricSample[] = input.metrics.map((metric) => ({
    kitId: input.kitId,
    platform: metric.platform,
    title: titleByPlatform.get(metric.platform) ?? input.ideaText.slice(0, 80),
    ideaText: input.ideaText,
    measuredAt: metric.measuredAt,
    impressions: metric.impressions,
    views: metric.views,
    clicks: metric.clicks,
    coverClickRate: metric.coverClickRate,
    averageViewSeconds: metric.averageViewSeconds,
    likes: metric.likes,
    comments: metric.comments,
    saves: metric.saves,
    shares: metric.shares,
    followerGrowth: metric.followerGrowth,
    profileVisits: metric.profileVisits,
    leads: metric.leads,
    signups: metric.signups,
    revenue: metric.revenue
  }));
  const briefing = buildGrowthBriefing(samples, input.language);
  const sorted = [...input.metrics].sort((a, b) => score(b) - score(a));
  const best = sorted[0];
  const healthySignals = briefing.funnel.filter((signal) => signal.health === "healthy");
  const experiment = briefing.experiment;

  return {
    summary: briefing.summary,
    wins: healthySignals.length > 0
      ? healthySignals.slice(0, 3).map((signal) => `${signal.label}：${signal.evidence}`)
      : best
        ? [
            isZh
              ? `${getPlatform(best.platform).label} 已形成可比较的真实样本；下一轮可以一次只改变一个变量。`
              : `${getPlatform(best.platform).label} now has a measurable baseline, so the next cycle can change one variable at a time.`
          ]
        : [isZh ? "目前还没有真实发布数据可作为赢家证据。" : "There is no measured publishing result to call a winner yet."],
    problems: briefing.priorities.map((priority) => `${priority.title}：${priority.evidence}`),
    nextActions: experiment
      ? [
          briefing.priorities[0]?.action ?? experiment.hypothesis,
          ...experiment.variants.map((variant) =>
            isZh
              ? `${variant.name}：${variant.hookInstruction}；形式为${variant.format}。`
              : `${variant.name}: ${variant.hookInstruction}; use ${variant.format}.`
          ),
          isZh
            ? `本轮只观察「${experiment.primaryMetric}」，其余主题、正文信息与发布时间尽量保持一致。`
            : `Judge this cycle only by “${experiment.primaryMetric}”; hold the topic, body, and timing as constant as possible.`
        ]
      : [
          briefing.priorities[0]?.action ?? (isZh ? "先录入一篇真实发布结果。" : "Add one real publishing result first."),
          isZh ? `缺少：${briefing.missingData.join("、")}` : `Missing: ${briefing.missingData.join(", ")}`
        ]
  };
}

function score(metric: ReturnType<typeof iterateRequestSchema.parse>["metrics"][number]) {
  return metric.views
    + metric.clicks * 2
    + metric.likes
    + metric.comments * 3
    + metric.saves * 4
    + metric.shares * 5
    + metric.followerGrowth * 8
    + metric.leads * 8
    + metric.signups * 10
    + metric.revenue;
}
