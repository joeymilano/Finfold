import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  METRIC_DEFINITION_VERSION,
  type GrowthLearningRow,
  type GrowthLoopGoalRow,
  type MissionPlanSnapshot
} from "@/lib/growth-loop/contracts";
import { sanitizeTrackingDestination } from "@/lib/mission-attribution";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type GoalMissionSummary = {
  id: string;
  title: string;
  hypothesis: string;
  status: string;
  executionState: string;
  designType: string;
  planVersion: number | null;
  usedLearningIds: string[];
  targetValue: number;
  createdAt: string;
  reviewHistory: MissionPlanSnapshot["reviewHistory"];
};

export type GoalListItem = {
  goal: GrowthLoopGoalRow;
  activeMission: GoalMissionSummary | null;
  missionCount: number;
  acceptedLearnings: number;
};

export type GoalMissionDetail = GoalMissionSummary & {
  actions: Array<{
    id: string;
    kind: string;
    status: string;
    riskLevel: string;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    payloadHash: string | null;
    approvedPayloadHash: string | null;
    approvedAt: string | null;
    executionMode: string;
    evidenceUrl: string | null;
    evidenceLevel: string;
    createdAt: string;
    updatedAt: string;
  }>;
  trackingLinks: Array<{
    variantKey: string;
    code: string;
    trackingUrl: string;
    destinationUrl: string;
    status: string;
  }>;
  events: Array<{
    id: number;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt: string;
  }>;
  variantKits: Record<string, string | undefined>;
};

export type GoalDetail = {
  goal: GrowthLoopGoalRow;
  missions: GoalMissionDetail[];
  learnings: GrowthLearningRow[];
};

export async function createGrowthLoopGoal(
  admin: AdminClient,
  userId: string,
  input: {
    title: string;
    landingUrl: string;
    targetValue: number;
    endAt: string;
    timezone: string;
  }
): Promise<GrowthLoopGoalRow> {
  const landingUrl = sanitizeTrackingDestination(input.landingUrl);
  const { data, error } = await admin
    .from("growth_loop_goals")
    .insert({
      user_id: userId,
      title: input.title,
      objective_type: "qualified_activations",
      metric_definition: {
        definition: "新用户完成注册，并首次将生成内容保存到内容库",
        activationEvent: "finfold-first-save",
        signupEvent: "finfold-native-signup"
      },
      metric_definition_version: METRIC_DEFINITION_VERSION,
      landing_url: landingUrl,
      channel_platform: "xiaohongshu",
      target_value: input.targetValue,
      end_at: input.endAt,
      timezone: input.timezone,
      status: "active"
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Goal insert returned no row.");
  return data as GrowthLoopGoalRow;
}

export async function listGrowthLoopGoals(
  admin: AdminClient,
  userId: string
): Promise<GoalListItem[]> {
  const { data: goals, error } = await admin
    .from("growth_loop_goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const items: GoalListItem[] = [];
  for (const goal of (goals ?? []) as GrowthLoopGoalRow[]) {
    const { data: missions } = await admin
      .from("growth_missions")
      .select("id, title, hypothesis, status, execution_state, design_type, plan, target_value, created_at")
      .eq("goal_id", goal.id)
      .eq("user_id", userId)
      .eq("mission_kind", "growth_loop")
      .order("created_at", { ascending: false });
    const missionRows = missions ?? [];
    const active = missionRows.find((mission) =>
      ["accepted", "draft_ready", "posted"].includes(mission.status)
    );
    const { count: acceptedLearnings } = await admin
      .from("growth_learnings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`goal_id.is.null,goal_id.eq.${goal.id}`)
      .eq("status", "accepted");
    items.push({
      goal,
      activeMission: active ? toMissionSummary(active) : null,
      missionCount: missionRows.length,
      acceptedLearnings: acceptedLearnings ?? 0
    });
  }
  return items;
}

function toMissionSummary(row: Record<string, unknown>): GoalMissionSummary {
  const plan = (row.plan ?? {}) as MissionPlanSnapshot;
  return {
    id: row.id as string,
    title: row.title as string,
    hypothesis: row.hypothesis as string,
    status: row.status as string,
    executionState: row.execution_state as string,
    designType: (row.design_type as string) ?? "exploratory",
    planVersion: plan.planVersion ?? null,
    usedLearningIds: plan.usedLearningIds ?? [],
    targetValue: Number(row.target_value ?? 0),
    createdAt: row.created_at as string,
    reviewHistory: plan.reviewHistory ?? []
  };
}

export async function loadGrowthGoalDetail(
  admin: AdminClient,
  userId: string,
  goalId: string,
  options: { appUrl: string }
): Promise<GoalDetail | null> {
  const { data: goalData, error: goalError } = await admin
    .from("growth_loop_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (goalError) throw goalError;
  if (!goalData) return null;
  const goal = goalData as GrowthLoopGoalRow;

  const { data: missions } = await admin
    .from("growth_missions")
    .select("id, title, hypothesis, status, execution_state, design_type, plan, target_value, created_at")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .eq("mission_kind", "growth_loop")
    .order("created_at", { ascending: false })
    .limit(10);

  const details: GoalMissionDetail[] = [];
  for (const missionRow of missions ?? []) {
    const summary = toMissionSummary(missionRow);
    const [actions, links, events] = await Promise.all([
      admin
        .from("mission_actions")
        .select(
          "id, kind, status, risk_level, input, output, payload_hash, approved_payload_hash, approved_at, execution_mode, evidence_url, evidence_level, created_at, updated_at"
        )
        .eq("mission_id", summary.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      admin
        .from("tracking_links")
        .select("variant_key, code, destination_url, status")
        .eq("mission_id", summary.id)
        .eq("user_id", userId),
      admin
        .from("mission_events")
        .select("id, event_type, payload, occurred_at")
        .eq("mission_id", summary.id)
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(50)
    ]);

    const variantKits: Record<string, string | undefined> = {};
    const plan = ((missionRow as Record<string, unknown>).plan ?? {}) as MissionPlanSnapshot;
    for (const variant of plan.variants ?? []) {
      if (variant.kitId) variantKits[variant.key] = variant.kitId;
    }

    details.push({
      ...summary,
      actions: (actions.data ?? []).map((action) => ({
        id: action.id,
        kind: action.kind,
        status: action.status,
        riskLevel: action.risk_level,
        input: (action.input ?? {}) as Record<string, unknown>,
        output: (action.output ?? null) as Record<string, unknown> | null,
        payloadHash: action.payload_hash,
        approvedPayloadHash: action.approved_payload_hash,
        approvedAt: action.approved_at,
        executionMode: action.execution_mode,
        evidenceUrl: action.evidence_url,
        evidenceLevel: action.evidence_level,
        createdAt: action.created_at,
        updatedAt: action.updated_at
      })),
      trackingLinks: (links.data ?? []).map((link) => ({
        variantKey: link.variant_key,
        code: link.code,
        trackingUrl: `${options.appUrl.replace(/\/$/, "")}/go/${link.code}`,
        destinationUrl: link.destination_url,
        status: link.status
      })),
      events: (events.data ?? []).map((event) => ({
        id: event.id,
        eventType: event.event_type,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        occurredAt: event.occurred_at
      })),
      variantKits
    });
  }

  const { data: learnings } = await admin
    .from("growth_learnings")
    .select("*")
    .eq("user_id", userId)
    .or(`goal_id.is.null,goal_id.eq.${goalId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    goal,
    missions: details,
    learnings: (learnings ?? []) as GrowthLearningRow[]
  };
}

export async function setGoalStatus(
  admin: AdminClient,
  userId: string,
  goalId: string,
  status: "active" | "paused"
): Promise<GrowthLoopGoalRow | null> {
  const { data, error } = await admin
    .from("growth_loop_goals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return (data as GrowthLoopGoalRow) ?? null;
}
