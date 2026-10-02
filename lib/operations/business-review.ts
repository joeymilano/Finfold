import {
  businessMissionLimitForPlan,
  resolveBusinessMissionPlan,
  type BusinessMissionPlan
} from "@/lib/business-mission-entitlements";
import {
  PLAN_CREDITS,
  currentPeriodKey,
  getCreditAllowanceSnapshot,
  getCreditSpendSummary,
  periodKeyExpiry,
  periodKeyStart,
  type CreditSpendSummary
} from "@/lib/payment";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import type {
  BusinessMissionReviewBottleneck,
  BusinessMissionReviewDecision,
  GrowthMission
} from "@/lib/agent/growth-missions";
import type { PlatformId } from "@/lib/platforms";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ReviewMissionRow = {
  id: string;
  title: string;
  platform: PlatformId;
  objective_type: GrowthMission["objectiveType"];
  primary_metric: string;
  primary_metric_key: GrowthMission["primaryMetricKey"];
  target_value: number | string;
  execution_state: GrowthMission["executionState"];
  status: GrowthMission["status"];
  review_decision: BusinessMissionReviewDecision | null;
  review_bottleneck: BusinessMissionReviewBottleneck | null;
  review_evidence_note: string | null;
  reviewed_at: string | null;
  measurement_due_at: string | null;
  outcome: GrowthMission["outcome"];
};

type OutcomeRow = {
  mission_id: string;
  event_type: "lead" | "signup" | "purchase" | "revenue";
  quantity: number | string;
  value: number | string;
  currency: string;
  source: string;
  occurred_at: string;
};

export type BusinessReviewDecisionItem = {
  id: string;
  title: string;
  platform: PlatformId;
  objectiveType: GrowthMission["objectiveType"];
  primaryMetric: string;
  primaryMetricKey: GrowthMission["primaryMetricKey"];
  actualValue: number | null;
  targetValue: number;
  currency: string | null;
  revenueByCurrency: Array<{ currency: string; value: number }>;
  decision: BusinessMissionReviewDecision | null;
  bottleneck: BusinessMissionReviewBottleneck | null;
  evidenceNote: string | null;
  reviewedAt: string | null;
  measurementDueAt: string | null;
};

export type BusinessAccountabilityReview = {
  generatedAt: string;
  period: {
    key: string;
    start: string;
    end: string;
  };
  outcomes: {
    leads: number;
    signups: number;
    purchases: number;
    revenueByCurrency: Array<{ currency: string; value: number }>;
    recordedEvents: number;
    automaticEvents: number;
    manualEvents: number;
    latestAt: string | null;
  };
  decisions: {
    replicate: BusinessReviewDecisionItem[];
    repair: BusinessReviewDecisionItem[];
    collectEvidence: BusinessReviewDecisionItem[];
    reviewDue: BusinessReviewDecisionItem[];
  };
  resources: {
    plan: BusinessMissionPlan;
    businessMissions: {
      used: number;
      limit: number;
    };
    credits: {
      planAllowance: number;
      planUsed: number | null;
      availableBalance: number | null;
      grossReserved: number | null;
      refunded: number | null;
      netCharged: number | null;
    } | null;
  };
};

type BuildBusinessReviewInput = {
  now: Date;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  reviewedMissions: ReviewMissionRow[];
  dueMissions: ReviewMissionRow[];
  outcomes: OutcomeRow[];
  plan: BusinessMissionPlan;
  businessMissionsUsed: number;
  creditSpend: CreditSpendSummary | null;
  creditAllowance: { used: number; available: number } | null;
  missionRevenueByCurrency?: Record<string, Array<{ currency: string; value: number }>>;
};

const REVIEW_FIELDS = "id, title, platform, objective_type, primary_metric, primary_metric_key, target_value, execution_state, status, review_decision, review_bottleneck, review_evidence_note, reviewed_at, measurement_due_at, outcome";

export async function loadBusinessAccountabilityReview(
  admin: AdminClient,
  userId: string,
  now = new Date()
): Promise<BusinessAccountabilityReview> {
  const periodKey = currentPeriodKey(now);
  const periodStart = periodKeyStart(periodKey);
  const periodEnd = periodKeyExpiry(periodKey);

  const [reviewedResult, dueResult, outcomes, missionCountResult, plan] = await Promise.all([
    admin
      .from("growth_missions")
      .select(REVIEW_FIELDS)
      .eq("user_id", userId)
      .eq("mission_kind", "growth_opportunity")
      .gte("reviewed_at", periodStart)
      .lt("reviewed_at", periodEnd)
      .order("reviewed_at", { ascending: false }),
    admin
      .from("growth_missions")
      .select(REVIEW_FIELDS)
      .eq("user_id", userId)
      .eq("mission_kind", "growth_opportunity")
      .eq("execution_state", "review_due")
      .order("measurement_due_at", { ascending: true }),
    loadPeriodOutcomeRows(admin, userId, periodStart, periodEnd),
    admin
      .from("growth_missions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("mission_kind", "growth_opportunity")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    resolveBusinessMissionPlan(admin, userId)
  ]);

  for (const result of [reviewedResult, dueResult, missionCountResult]) {
    if (result.error) throw result.error;
  }

  const relevantMissions = [
    ...((reviewedResult.data ?? []) as unknown as ReviewMissionRow[]),
    ...((dueResult.data ?? []) as unknown as ReviewMissionRow[])
  ];
  const [creditSpend, creditAllowance, missionRevenueByCurrency] = await Promise.all([
    getCreditSpendSummary(userId, periodStart, periodEnd),
    getCreditAllowanceSnapshot(userId),
    loadMissionRevenueByCurrency(admin, userId, relevantMissions)
  ]);

  return buildBusinessAccountabilityReview({
    now,
    periodKey,
    periodStart,
    periodEnd,
    reviewedMissions: (reviewedResult.data ?? []) as unknown as ReviewMissionRow[],
    dueMissions: (dueResult.data ?? []) as unknown as ReviewMissionRow[],
    outcomes,
    plan,
    businessMissionsUsed: missionCountResult.count ?? 0,
    creditSpend,
    creditAllowance,
    missionRevenueByCurrency
  });
}

async function loadPeriodOutcomeRows(
  admin: AdminClient,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<OutcomeRow[]> {
  const rows: OutcomeRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("outcome_events")
      .select("mission_id, event_type, quantity, value, currency, source, occurred_at")
      .eq("user_id", userId)
      .in("event_type", ["lead", "signup", "purchase", "revenue"])
      .gte("occurred_at", periodStart)
      .lt("occurred_at", periodEnd)
      .order("occurred_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as OutcomeRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadMissionRevenueByCurrency(
  admin: AdminClient,
  userId: string,
  missions: ReviewMissionRow[]
): Promise<Record<string, Array<{ currency: string; value: number }>>> {
  const missionIds = Array.from(new Set(
    missions
      .filter((mission) => mission.primary_metric_key === "revenue")
      .map((mission) => mission.id)
  ));
  if (missionIds.length === 0) return {};

  const rows: Array<{ mission_id: string; currency: string; value: number | string }> = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("outcome_events")
      .select("mission_id, currency, value")
      .eq("user_id", userId)
      .in("mission_id", missionIds)
      .eq("event_type", "revenue")
      .order("occurred_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as typeof rows;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const grouped = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const currency = normalizeCurrencyOrNull(row.currency);
    if (!currency) throw new Error("Revenue evidence contains an invalid currency.");
    const byCurrency = grouped.get(row.mission_id) ?? new Map<string, number>();
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + finiteNonNegative(row.value));
    grouped.set(row.mission_id, byCurrency);
  }
  return Object.fromEntries(Array.from(grouped, ([missionId, values]) => [
    missionId,
    Array.from(values, ([currency, value]) => ({ currency, value }))
      .sort((left, right) => left.currency.localeCompare(right.currency))
  ]));
}

export function buildBusinessAccountabilityReview(
  input: BuildBusinessReviewInput
): BusinessAccountabilityReview {
  const revenue = new Map<string, number>();
  const explicitMissionRevenueIds = new Set(Object.keys(input.missionRevenueByCurrency ?? {}));
  const revenueByMission = new Map<string, Map<string, number>>();
  for (const [missionId, values] of Object.entries(input.missionRevenueByCurrency ?? {})) {
    const grouped = new Map<string, number>();
    for (const item of values) {
      const currency = normalizeCurrencyOrNull(item.currency);
      if (!currency) throw new Error("Revenue evidence contains an invalid currency.");
      grouped.set(currency, (grouped.get(currency) ?? 0) + finiteNonNegative(item.value));
    }
    revenueByMission.set(missionId, grouped);
  }
  let leads = 0;
  let signups = 0;
  let purchases = 0;
  let automaticEvents = 0;
  let manualEvents = 0;
  let latestAt: string | null = null;

  for (const row of input.outcomes) {
    const quantity = finiteNonNegative(row.quantity);
    const value = finiteNonNegative(row.value);
    if (row.event_type === "lead") leads += quantity;
    if (row.event_type === "signup") signups += quantity;
    if (row.event_type === "purchase") purchases += quantity;
    if (row.event_type === "revenue") {
      const currency = normalizeCurrencyOrNull(row.currency);
      if (!currency) throw new Error("Revenue evidence contains an invalid currency.");
      revenue.set(currency, (revenue.get(currency) ?? 0) + value);
      if (!explicitMissionRevenueIds.has(row.mission_id)) {
        const byCurrency = revenueByMission.get(row.mission_id) ?? new Map<string, number>();
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + value);
        revenueByMission.set(row.mission_id, byCurrency);
      }
    }
    if (row.source === "manual") manualEvents += 1;
    else automaticEvents += 1;
    if (!latestAt || row.occurred_at > latestAt) latestAt = row.occurred_at;
  }

  const reviewed = input.reviewedMissions.map((row) => mapDecision(row, revenueByMission));
  const reviewDue = input.dueMissions.map((row) => mapDecision(row, revenueByMission));
  const credits = input.creditSpend || input.creditAllowance
    ? {
        planAllowance: PLAN_CREDITS[input.plan],
        planUsed: input.creditAllowance?.used ?? null,
        availableBalance: input.creditAllowance?.available ?? null,
        grossReserved: input.creditSpend?.grossReserved ?? null,
        refunded: input.creditSpend?.refunded ?? null,
        netCharged: input.creditSpend?.netCharged ?? null
      }
    : null;

  return {
    generatedAt: input.now.toISOString(),
    period: {
      key: input.periodKey,
      start: input.periodStart,
      end: input.periodEnd
    },
    outcomes: {
      leads,
      signups,
      purchases,
      revenueByCurrency: Array.from(revenue, ([currency, value]) => ({ currency, value }))
        .sort((left, right) => left.currency.localeCompare(right.currency)),
      recordedEvents: input.outcomes.length,
      automaticEvents,
      manualEvents,
      latestAt
    },
    decisions: {
      replicate: reviewed.filter((item) => item.decision === "goal_achieved"),
      repair: reviewed.filter((item) => item.decision === "fix_bottleneck"),
      collectEvidence: reviewed.filter((item) => item.decision === "collect_more_evidence"),
      reviewDue
    },
    resources: {
      plan: input.plan,
      businessMissions: {
        used: Math.max(0, input.businessMissionsUsed),
        limit: businessMissionLimitForPlan(input.plan)
      },
      credits
    }
  };
}

function mapDecision(
  row: ReviewMissionRow,
  revenueByMission: Map<string, Map<string, number>>
): BusinessReviewDecisionItem {
  const outcome = asRecord(row.outcome);
  const revenueByCurrency = row.primary_metric_key === "revenue"
    ? Array.from(revenueByMission.get(row.id) ?? [], ([currency, value]) => ({ currency, value }))
        .sort((left, right) => left.currency.localeCompare(right.currency))
    : [];
  const singleCurrencyRevenue = revenueByCurrency.length === 1 ? revenueByCurrency[0] : null;
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    objectiveType: row.objective_type,
    primaryMetric: row.primary_metric,
    primaryMetricKey: row.primary_metric_key,
    actualValue: row.primary_metric_key === "revenue"
      ? singleCurrencyRevenue?.value ?? null
      : finiteNonNegative(outcome.actualValue),
    targetValue: finiteNonNegative(row.target_value),
    currency: singleCurrencyRevenue?.currency ?? null,
    revenueByCurrency,
    decision: row.review_decision,
    bottleneck: row.review_bottleneck,
    evidenceNote: row.review_evidence_note,
    reviewedAt: row.reviewed_at,
    measurementDueAt: row.measurement_due_at
  };
}

function finiteNonNegative(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeCurrencyOrNull(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
