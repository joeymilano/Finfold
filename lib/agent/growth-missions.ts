import type { PerformanceMetrics } from "@/lib/content-schema";
import { loadGrowthBriefing, type GrowthBriefing, type GrowthBriefingLocale, type GrowthExperimentVariant } from "@/lib/agent/growth-briefing";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { PlatformId } from "@/lib/platforms";
import { summarizeMissionOutcomeRows, type MissionOutcomeSummary } from "@/lib/mission-attribution";
import {
  buildBusinessMissionFollowUp,
  buildBusinessMissionRepairFollowUp
} from "@/lib/business-mission-follow-up";
import {
  enforceMonthlyBusinessMissionLimit,
  resolveBusinessMissionPlan
} from "@/lib/business-mission-entitlements";

export type GrowthMissionStatus =
  | "accepted"
  | "draft_ready"
  | "posted"
  | "completed"
  | "dismissed"
  | "superseded";

export type GrowthMissionVerdict = "won" | "lost" | "inconclusive" | null;
export type BusinessMissionReviewDecision = "goal_achieved" | "fix_bottleneck" | "collect_more_evidence";
export type BusinessMissionReviewBottleneck = "acquisition_message" | "landing_page" | "lead_capture" | "signup_flow" | "checkout";

export type GrowthMission = {
  id: string;
  platform: PlatformId;
  status: GrowthMissionStatus;
  stage: string;
  title: string;
  hypothesis: string;
  primaryMetric: string;
  primaryMetricKey:
    | "impressions"
    | "cover_click_rate"
    | "average_view_seconds"
    | "save_share_per_thousand"
    | "followers_per_thousand"
    | "leads"
    | "signups"
    | "revenue";
  baselineValue: number;
  targetValue: number;
  variants: GrowthExperimentVariant[];
  workbenchIdea: string;
  kitId: string | null;
  missionKind: string;
  objectiveType: "leads" | "signups" | "purchases" | null;
  executionState: "planned" | "generating" | "awaiting_decision" | "running" | "measuring" | "review_due" | "completed" | "closed";
  trackingEnabled: boolean;
  measurementWindowDays: number | null;
  measurementStartedAt: string | null;
  measurementDueAt: string | null;
  reviewDecision: BusinessMissionReviewDecision | null;
  reviewBottleneck: BusinessMissionReviewBottleneck | null;
  reviewEvidenceNote: string | null;
  reviewedAt: string | null;
  verdict: GrowthMissionVerdict;
  outcome: {
    actualValue?: number;
    baselineValue?: number;
    targetValue?: number;
    measuredAt?: string;
    explanation?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  outcomeSummary?: MissionOutcomeSummary;
};

export type GrowthMissionFollowUpSource = {
  missionId: string;
  verdict: Exclude<GrowthMissionVerdict, null>;
  completedAt: string | null;
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type GrowthMissionRow = {
  id: string;
  platform: PlatformId;
  status: GrowthMissionStatus;
  stage: string;
  title: string;
  hypothesis: string;
  primary_metric: string;
  primary_metric_key: GrowthMission["primaryMetricKey"];
  baseline_value: number | string;
  target_value: number | string;
  variants: GrowthExperimentVariant[] | null;
  workbench_idea: string;
  kit_id: string | null;
  mission_kind?: string | null;
  objective_type?: GrowthMission["objectiveType"];
  execution_state?: GrowthMission["executionState"];
  tracking_enabled?: boolean;
  measurement_window_days?: number | string | null;
  measurement_started_at?: string | null;
  measurement_due_at?: string | null;
  review_decision?: BusinessMissionReviewDecision | null;
  review_bottleneck?: BusinessMissionReviewBottleneck | null;
  review_evidence_note?: string | null;
  reviewed_at?: string | null;
  verdict: GrowthMissionVerdict;
  outcome: GrowthMission["outcome"];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type BusinessGrowthMissionSourceRow = GrowthMissionRow & {
  source_briefing: unknown;
  source_opportunity_id: string | null;
};

const MISSION_FIELDS = "id, platform, status, stage, title, hypothesis, primary_metric, primary_metric_key, baseline_value, target_value, variants, workbench_idea, kit_id, mission_kind, objective_type, execution_state, tracking_enabled, measurement_window_days, measurement_started_at, measurement_due_at, review_decision, review_bottleneck, review_evidence_note, reviewed_at, verdict, outcome, created_at, updated_at, completed_at";
const ACTIVE_STATUSES: GrowthMissionStatus[] = ["accepted", "draft_ready", "posted"];

export function mapGrowthMission(row: GrowthMissionRow): GrowthMission {
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    stage: row.stage,
    title: row.title,
    hypothesis: row.hypothesis,
    primaryMetric: row.primary_metric,
    primaryMetricKey: row.primary_metric_key,
    baselineValue: Number(row.baseline_value ?? 0),
    targetValue: Number(row.target_value ?? 0),
    variants: row.variants ?? [],
    workbenchIdea: row.workbench_idea,
    kitId: row.kit_id,
    missionKind: row.mission_kind ?? "content_experiment",
    objectiveType: row.objective_type ?? null,
    executionState: row.execution_state ?? executionStateForStatus(row.status),
    trackingEnabled: Boolean(row.tracking_enabled),
    measurementWindowDays: row.measurement_window_days === null || row.measurement_window_days === undefined
      ? null
      : Number(row.measurement_window_days),
    measurementStartedAt: row.measurement_started_at ?? null,
    measurementDueAt: row.measurement_due_at ?? null,
    reviewDecision: row.review_decision ?? null,
    reviewBottleneck: row.review_bottleneck ?? null,
    reviewEvidenceNote: row.review_evidence_note ?? null,
    reviewedAt: row.reviewed_at ?? null,
    verdict: row.verdict ?? null,
    outcome: row.outcome ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export async function advanceDueBusinessMissionReviews(
  admin: AdminClient,
  userId: string,
  now = new Date()
): Promise<number> {
  const { data, error } = await admin.rpc("advance_due_business_mission_reviews", {
    p_user_id: userId,
    p_now: now.toISOString()
  });
  if (error) throw error;
  return Number(data ?? 0);
}

function executionStateForStatus(status: GrowthMissionStatus): GrowthMission["executionState"] {
  if (status === "accepted") return "planned";
  if (status === "draft_ready") return "awaiting_decision";
  if (status === "posted") return "measuring";
  if (status === "completed") return "completed";
  return "closed";
}

export async function listGrowthMissions(
  admin: AdminClient,
  userId: string,
  limit = 10
): Promise<GrowthMission[]> {
  const { data, error } = await admin
    .from("growth_missions")
    .select(MISSION_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25));
  if (error) throw error;
  return ((data ?? []) as unknown as GrowthMissionRow[]).map(mapGrowthMission);
}

export async function getGrowthMission(
  admin: AdminClient,
  userId: string,
  missionId: string
): Promise<GrowthMission | null> {
  const { data, error } = await admin
    .from("growth_missions")
    .select(MISSION_FIELDS)
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGrowthMission(data as unknown as GrowthMissionRow) : null;
}

export async function createGrowthMission(
  admin: AdminClient,
  userId: string,
  locale: GrowthBriefingLocale,
  preferredPlatform?: PlatformId,
  followUpSource?: GrowthMissionFollowUpSource
): Promise<{ mission: GrowthMission | null; briefing: GrowthBriefing; existing: boolean }> {
  const briefing = await loadGrowthBriefing(admin, userId, locale, preferredPlatform);
  if (!briefing.experiment || !briefing.platform || briefing.priorities.length === 0) {
    return { mission: null, briefing, existing: false };
  }

  const { data: active } = await admin
    .from("growth_missions")
    .select(MISSION_FIELDS)
    .eq("user_id", userId)
    .eq("platform", briefing.platform)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) {
    return {
      mission: mapGrowthMission(active as unknown as GrowthMissionRow),
      briefing,
      existing: true
    };
  }

  const experiment = briefing.experiment;
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    platform: experiment.platform,
    status: "accepted" as const,
    stage: briefing.priorities[0].stage,
    title: experiment.name,
    hypothesis: experiment.hypothesis,
    primary_metric: experiment.primaryMetric,
    primary_metric_key: experiment.primaryMetricKey,
    baseline_value: experiment.baselineValue,
    target_value: experiment.successThreshold,
    variants: experiment.variants,
    workbench_idea: experiment.workbenchIdea,
    source_briefing: followUpSource
      ? {
          ...briefing,
          followUpSource
        }
      : briefing,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await admin
    .from("growth_missions")
    .insert(row)
    .select(MISSION_FIELDS)
    .single();
  if (error) {
    // A parallel click or tool call can hit the partial unique index. Return
    // the winner instead of creating duplicate work.
    const { data: concurrent } = await admin
      .from("growth_missions")
      .select(MISSION_FIELDS)
      .eq("user_id", userId)
      .eq("platform", briefing.platform)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (concurrent) {
      return {
        mission: mapGrowthMission(concurrent as unknown as GrowthMissionRow),
        briefing,
        existing: true
      };
    }
    throw error;
  }

  const mission = mapGrowthMission(data as unknown as GrowthMissionRow);
  return {
    mission,
    briefing,
    existing: false
  };
}

export async function createBusinessGrowthMissionFollowUp(
  admin: AdminClient,
  userId: string,
  locale: GrowthBriefingLocale,
  sourceMissionId: string
): Promise<{
  mission: GrowthMission | null;
  existing: boolean;
  error?: string;
  errorStatus?: 409 | 429;
}> {
  const { data: sourceData, error: sourceError } = await admin
    .from("growth_missions")
    .select(`${MISSION_FIELDS}, source_briefing, source_opportunity_id`)
    .eq("id", sourceMissionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceData) {
    return {
      mission: null,
      existing: false,
      error: locale === "en" ? "The source Growth Mission was not found." : "上一轮增长任务不存在。",
      errorStatus: 409
    };
  }

  const sourceRow = sourceData as unknown as BusinessGrowthMissionSourceRow;
  const sourceMission = mapGrowthMission(sourceRow);
  const isReplication = sourceMission.verdict === "won";
  const isRepair = sourceMission.verdict === "lost"
    && sourceMission.reviewDecision === "fix_bottleneck"
    && Boolean(sourceMission.reviewBottleneck);
  if (
    sourceMission.missionKind !== "growth_opportunity"
    || sourceMission.status !== "completed"
    || !sourceMission.objectiveType
    || (!isReplication && !isRepair)
  ) {
    return {
      mission: null,
      existing: false,
      error: locale === "en"
        ? "A commercial follow-up requires either a confirmed target result or one reviewed breakpoint to repair."
        : "商业任务只有在确认达标，或复盘选定一个修复断点后，才能进入下一轮。",
      errorStatus: 409
    };
  }

  const { data: activeData, error: activeError } = await admin
    .from("growth_missions")
    .select(MISSION_FIELDS)
    .eq("user_id", userId)
    .eq("mission_kind", "growth_opportunity")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (activeData) {
    return {
      mission: mapGrowthMission(activeData as unknown as GrowthMissionRow),
      existing: true
    };
  }

  const { data: platformActiveData, error: platformActiveError } = await admin
    .from("growth_missions")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", sourceMission.platform)
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (platformActiveError) throw platformActiveError;
  if (platformActiveData) {
    return {
      mission: null,
      existing: false,
      error: locale === "en"
        ? "Finish or close the active mission on this platform before repeating the business result."
        : "先完成或关闭这个平台上正在进行的任务，再复现本轮业务结果。",
      errorStatus: 409
    };
  }

  const plan = await resolveBusinessMissionPlan(admin, userId);
  const limitError = await enforceMonthlyBusinessMissionLimit(admin, userId, plan, locale);
  if (limitError) {
    return { mission: null, existing: false, error: limitError, errorStatus: 429 };
  }

  const { data: outcomeRows, error: outcomesError } = await admin
    .from("outcome_events")
    .select("event_type, quantity, value, currency")
    .eq("mission_id", sourceMission.id)
    .eq("user_id", userId);
  if (outcomesError) throw outcomesError;
  const outcomeSummary = summarizeMissionOutcomeRows(outcomeRows ?? []);
  let preview: ReturnType<typeof buildBusinessMissionFollowUp> | ReturnType<typeof buildBusinessMissionRepairFollowUp>;
  try {
    preview = isReplication
      ? buildBusinessMissionFollowUp(sourceMission, outcomeSummary, locale)
      : buildBusinessMissionRepairFollowUp(sourceMission, outcomeSummary, locale);
  } catch (error) {
    return {
      mission: null,
      existing: false,
      error: error instanceof Error ? error.message : (locale === "en" ? "The saved business result is incomplete." : "已保存的业务结果不完整。"),
      errorStatus: 409
    };
  }

  const now = new Date().toISOString();
  const sourceBriefing = asRecord(sourceRow.source_briefing);
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    platform: sourceMission.platform,
    status: "accepted" as const,
    stage: "conversion",
    title: preview.nextMissionTitle,
    hypothesis: preview.hypothesis,
    primary_metric: sourceMission.primaryMetric,
    primary_metric_key: sourceMission.primaryMetricKey,
    baseline_value: 0,
    target_value: preview.nextTargetValue,
    variants: sourceMission.variants,
    workbench_idea: `${preview.workbenchPreamble}\n\n---\n\n${sourceMission.workbenchIdea}`,
    source_briefing: {
      ...sourceBriefing,
      followUpSource: {
        missionId: sourceMission.id,
        missionKind: sourceMission.missionKind,
        objectiveType: sourceMission.objectiveType,
        verdict: sourceMission.verdict,
        actualValue: preview.actualValue,
        targetValue: sourceMission.targetValue,
        currency: preview.currency,
        sourceKitId: sourceMission.kitId,
        reviewDecision: sourceMission.reviewDecision,
        reviewBottleneck: sourceMission.reviewBottleneck,
        reviewEvidence: sourceMission.reviewEvidenceNote,
        reviewedAt: sourceMission.reviewedAt,
        completedAt: sourceMission.completedAt
      },
      followUpStrategy: isReplication
        ? "replicate_verified_business_result"
        : "repair_one_reviewed_business_bottleneck"
    },
    mission_kind: "growth_opportunity",
    objective_type: sourceMission.objectiveType,
    execution_state: "planned",
    source_opportunity_id: sourceRow.source_opportunity_id,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await admin
    .from("growth_missions")
    .insert(row)
    .select(MISSION_FIELDS)
    .single();
  if (error) {
    const { data: concurrent } = await admin
      .from("growth_missions")
      .select(MISSION_FIELDS)
      .eq("user_id", userId)
      .eq("mission_kind", "growth_opportunity")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (concurrent) {
      return {
        mission: mapGrowthMission(concurrent as unknown as GrowthMissionRow),
        existing: true
      };
    }
    throw error;
  }

  return {
    mission: mapGrowthMission(data as unknown as GrowthMissionRow),
    existing: false
  };
}

export async function validateGrowthMission(
  admin: AdminClient,
  userId: string,
  missionId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("growth_missions")
    .select("id")
    .eq("id", missionId)
    .eq("user_id", userId)
    .in("status", ["accepted", "draft_ready"])
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function linkGrowthMissionToKit(
  admin: AdminClient,
  userId: string,
  missionId: string,
  kitId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("growth_missions")
    .update({ kit_id: kitId, status: "draft_ready", execution_state: "awaiting_decision", updated_at: now })
    .eq("id", missionId)
    .eq("user_id", userId)
    .in("status", ["accepted", "draft_ready"]);
  if (error) throw error;
}

export async function markGrowthMissionPosted(
  admin: AdminClient,
  userId: string,
  missionId: string,
  platform: PlatformId
): Promise<void> {
  const mission = await getGrowthMission(admin, userId, missionId);
  if (!mission || mission.platform !== platform) return;
  if (mission.status === "posted" || mission.status === "completed" || mission.status === "dismissed" || mission.status === "superseded") return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("growth_missions")
    .update({ status: "posted", execution_state: "measuring", updated_at: now })
    .eq("id", missionId)
    .eq("user_id", userId)
    .eq("platform", platform)
    .in("status", ["accepted", "draft_ready", "posted"]);
  if (error) throw error;
}

export async function completeGrowthMissionFromMetrics(
  admin: AdminClient,
  userId: string,
  missionId: string,
  metrics: PerformanceMetrics
): Promise<GrowthMission | null> {
  const mission = await getGrowthMission(admin, userId, missionId);
  if (!mission || mission.status === "completed" || mission.status === "dismissed" || mission.status === "superseded") {
    return mission;
  }
  if (mission.platform !== metrics.platform) return mission;
  if (!hasMissionEvidence(mission.primaryMetricKey, metrics)) return mission;

  const actualValue = metricValueForMission(mission.primaryMetricKey, metrics);
  const verdict = assessMissionOutcome(mission.baselineValue, mission.targetValue, actualValue);
  const measuredAt = metrics.measuredAt ?? new Date().toISOString();
  const outcome: NonNullable<GrowthMission["outcome"]> = {
    actualValue: round(actualValue, 2),
    baselineValue: mission.baselineValue,
    targetValue: mission.targetValue,
    measuredAt,
    explanation: outcomeExplanation(verdict, mission.primaryMetric, mission.baselineValue, mission.targetValue, actualValue)
  };
  const { data, error } = await admin
    .from("growth_missions")
    .update({
      status: "completed",
      execution_state: "completed",
      verdict,
      outcome,
      completed_at: measuredAt,
      updated_at: measuredAt
    })
    .eq("id", missionId)
    .eq("user_id", userId)
    .select(MISSION_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGrowthMission(data as unknown as GrowthMissionRow) : null;
}

export function metricValueForMission(
  metricKey: GrowthMission["primaryMetricKey"],
  metrics: PerformanceMetrics
): number {
  const views = metrics.views > 0 ? metrics.views : metrics.clicks;
  if (metricKey === "impressions") return metrics.impressions;
  if (metricKey === "cover_click_rate") {
    return metrics.coverClickRate > 0
      ? metrics.coverClickRate
      : metrics.impressions > 0
        ? (views / metrics.impressions) * 100
        : 0;
  }
  if (metricKey === "average_view_seconds") return metrics.averageViewSeconds;
  if (metricKey === "leads") return metrics.leads;
  if (metricKey === "signups") return metrics.signups;
  if (metricKey === "revenue") return metrics.revenue;
  if (metricKey === "save_share_per_thousand") {
    return views > 0 ? ((metrics.saves + metrics.shares) / views) * 1000 : 0;
  }
  return views > 0 ? (metrics.followerGrowth / views) * 1000 : 0;
}

export function hasMissionEvidence(
  metricKey: GrowthMission["primaryMetricKey"],
  metrics: PerformanceMetrics
): boolean {
  const views = metrics.views > 0 ? metrics.views : metrics.clicks;
  if (metricKey === "impressions") return metrics.impressions > 0;
  if (metricKey === "cover_click_rate") return metrics.impressions > 0;
  if (metricKey === "average_view_seconds") {
    return views > 0 && metrics.averageViewSeconds > 0;
  }
  if (metricKey === "leads" || metricKey === "signups" || metricKey === "revenue") {
    return Boolean(metrics.measuredAt);
  }
  return views > 0;
}

export function assessMissionOutcome(
  baselineValue: number,
  targetValue: number,
  actualValue: number
): Exclude<GrowthMissionVerdict, null> {
  if (actualValue >= targetValue) return "won";
  if (baselineValue > 0 && actualValue < baselineValue * 0.8) return "lost";
  if (baselineValue <= 0 && actualValue < baselineValue) return "lost";
  return "inconclusive";
}

function outcomeExplanation(
  verdict: Exclude<GrowthMissionVerdict, null>,
  metric: string,
  baseline: number,
  target: number,
  actual: number
): string {
  const isZh = /[\u3400-\u9fff]/.test(metric);
  if (verdict === "won") {
    return isZh
      ? `${metric}达到 ${round(actual, 2)}，超过从 ${round(baseline, 2)} 基线设定的 ${round(target, 2)} 达标线。`
      : `${metric} reached ${round(actual, 2)}, above the ${round(target, 2)} target from a ${round(baseline, 2)} baseline.`;
  }
  if (verdict === "lost") {
    return isZh
      ? `${metric}从 ${round(baseline, 2)} 降至 ${round(actual, 2)}；暂不扩大这个方向。`
      : `${metric} fell to ${round(actual, 2)} from a ${round(baseline, 2)} baseline; do not promote this variant yet.`;
  }
  return isZh
    ? `${metric}达到 ${round(actual, 2)}，基线为 ${round(baseline, 2)}、达标线为 ${round(target, 2)}；当前证据还不足以判定胜出。`
    : `${metric} reached ${round(actual, 2)} versus a ${round(baseline, 2)} baseline and ${round(target, 2)} target; evidence is not strong enough yet.`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
