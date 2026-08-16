import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  listGrowthMissions,
  type GrowthMission
} from "@/lib/agent/growth-missions";
import {
  loadWeeklyGrowthReport,
  type WeeklyGrowthAnomaly,
  type WeeklyGrowthReport
} from "@/lib/agent/weekly-growth-report";
import {
  loadXhsWorkflowState,
  type XhsWorkflowStage,
  type XhsWorkflowState
} from "@/lib/agent/xhs-workflow";
import { getXhsCoachingDay } from "@/lib/agent/xhs-coaching";

export type PatrolItemStatus = "open" | "done" | "dismissed" | "superseded";
export type PatrolUrgency = "planned" | "today" | "overdue";
export type PatrolActionKind =
  | "mission_generate"
  | "mission_publish"
  | "mission_measure"
  | "mission_review"
  | "measure_results"
  | "review_drafts"
  | "new_experiment"
  | "first_measured_post"
  | "xhs_positioning"
  | "xhs_topic"
  | "xhs_draft"
  | "xhs_title"
  | "xhs_visual"
  | "xhs_publish"
  | "xhs_review";

export type LocalizedPatrolCopy = { zh: string; en: string };

export type AgentPatrolItem = {
  id: string;
  status: PatrolItemStatus;
  actionKind: PatrolActionKind;
  urgency: PatrolUrgency;
  title: LocalizedPatrolCopy;
  detail: LocalizedPatrolCopy;
  evidence: LocalizedPatrolCopy;
  actionHref: string;
  fingerprint: string;
  missionId: string | null;
  sourceState: Record<string, unknown>;
  dueAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatrolOutputSignal = {
  id: string;
  kitId: string;
  platform?: string;
  publishStatus: string;
  publishedAt: string | null;
  updatedAt: string;
};

export type PatrolState = {
  missions: GrowthMission[];
  outputs: PatrolOutputSignal[];
  latestMetric: { kitId: string; measuredAt: string | null } | null;
  hasAnyKit: boolean;
  weeklyReport?: WeeklyGrowthReport | null;
  xhsWorkflow?: XhsWorkflowState | null;
  xhsCoaching?: XhsCoachingPatrolState | null;
};

export type XhsCoachingPatrolState = {
  programId: string;
  currentDay: number;
  task: {
    id: string;
    dayNumber: number;
    kind: "baseline" | "plan" | "create" | "publish" | "observe" | "review" | "rediagnose";
    title: string;
    reason: string;
    targetMetric: string;
    singleVariable: string;
    workbenchHref: string;
    status: "todo" | "in_progress";
    dueAt: string;
    updatedAt: string;
  } | null;
};

export type PatrolCandidate = Omit<
  AgentPatrolItem,
  "id" | "status" | "firstSeenAt" | "lastSeenAt" | "completedAt" | "createdAt" | "updatedAt"
>;

export type PatrolProgressEvent =
  | { type: "mission_created"; missionId: string }
  | { type: "kit_generated"; kitId: string; missionId?: string | null }
  | { type: "output_posted"; kitId: string; outputId: string; missionId?: string | null }
  | { type: "metrics_saved"; kitId: string; platform: string; missionId?: string | null };

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PatrolRow = {
  id: string;
  status: PatrolItemStatus;
  action_kind: PatrolActionKind;
  urgency: PatrolUrgency;
  title_zh: string;
  title_en: string;
  detail_zh: string;
  detail_en: string;
  evidence_zh: string;
  evidence_en: string;
  action_href: string;
  fingerprint: string;
  mission_id: string | null;
  source_state: Record<string, unknown> | null;
  due_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const PATROL_FIELDS = [
  "id",
  "status",
  "action_kind",
  "urgency",
  "title_zh",
  "title_en",
  "detail_zh",
  "detail_en",
  "evidence_zh",
  "evidence_en",
  "action_href",
  "fingerprint",
  "mission_id",
  "source_state",
  "due_at",
  "first_seen_at",
  "last_seen_at",
  "completed_at",
  "created_at",
  "updated_at"
].join(", ");

const ACTIVE_MISSION_STATUSES = new Set(["accepted", "draft_ready", "posted"]);
const HOUR_MS = 60 * 60 * 1000;

export function derivePatrolCandidate(
  state: PatrolState,
  now = new Date()
): PatrolCandidate {
  return derivePatrolCandidates(state, now)[0];
}

export function derivePatrolCandidates(
  state: PatrolState,
  now = new Date()
): PatrolCandidate[] {
  const candidates: PatrolCandidate[] = state.missions
    .filter((mission) => ACTIVE_MISSION_STATUSES.has(mission.status))
    .map((mission) => missionCandidate(mission, now));
  if (state.xhsCoaching?.task) {
    candidates.unshift(xhsCoachingCandidate(state.xhsCoaching, now));
  } else if (!state.xhsCoaching && state.xhsWorkflow?.workflow) {
    candidates.unshift(xhsWorkflowCandidate(state.xhsWorkflow, now));
  }
  const weeklyAnomaly = state.weeklyReport?.anomalies[0];
  if (weeklyAnomaly && state.weeklyReport) {
    candidates.push(weeklyAnomalyCandidate(state.weeklyReport, weeklyAnomaly, now));
  }
  const completedMission = state.missions.find((mission) => mission.status === "completed");
  if (completedMission) {
    const outcome = completedMission.outcome?.actualValue;
    candidates.push({
      actionKind: "mission_review",
      urgency: "today",
      title: {
        zh: "上一轮实验已经有结论",
        en: "Your last experiment has a verdict"
      },
      detail: {
        zh: "先复盘胜负和证据，再决定是否扩大、重试或换下一个变量。",
        en: "Review the verdict and evidence before scaling, retrying, or changing the next variable."
      },
      evidence: {
        zh: `${completedMission.primaryMetric}：实际 ${formatMetric(outcome)} / 目标 ${formatMetric(completedMission.targetValue)}`,
        en: `${completedMission.primaryMetric}: ${formatMetric(outcome)} actual / ${formatMetric(completedMission.targetValue)} target`
      },
      actionHref: `/operations/missions/${completedMission.id}`,
      fingerprint: `mission_review:${completedMission.id}`,
      missionId: completedMission.id,
      sourceState: {
        missionStatus: completedMission.status,
        verdict: completedMission.verdict,
        actualValue: outcome,
        targetValue: completedMission.targetValue
      },
      dueAt: completedMission.completedAt
    });
  }

  for (const posted of state.outputs.filter((output) => output.publishStatus === "posted")) {
    const publishedAt = posted.publishedAt ?? posted.updatedAt;
    const dueAt = addHours(publishedAt, 48);
    candidates.push({
      actionKind: "measure_results",
      urgency: urgencyForDueAt(dueAt, now),
      title: {
        zh: "有内容已经发布，但还没有结果",
        en: "A published post is still missing results"
      },
      detail: {
        zh: "补上平台表现，Agent 才能判断问题在曝光、点击、停留还是关注转化。",
        en: "Add platform results so the Agent can locate the break across reach, click, retention, or follow conversion."
      },
      evidence: {
        zh: `已发布 ${ageLabel(publishedAt, now, "zh")}`,
        en: `Published ${ageLabel(publishedAt, now, "en")}`
      },
      actionHref: `/kits/${posted.kitId}`,
      fingerprint: `measure_results:${posted.id}`,
      missionId: null,
      sourceState: {
        outputId: posted.id,
        kitId: posted.kitId,
        platform: posted.platform,
        publishedAt
      },
      dueAt
    });
  }

  for (const draft of state.outputs.filter((output) =>
    output.publishStatus === "draft" || output.publishStatus === "planned"
  )) {
    candidates.push({
      actionKind: "review_drafts",
      urgency: "today",
      title: {
        zh: "草稿已经准备好，正在等待决策",
        en: "A draft is ready and waiting for a decision"
      },
      detail: {
        zh: "今天只做一件事：选中最强版本、完成必要修改并发布。",
        en: "Do one thing today: choose the strongest version, make the necessary edits, and publish it."
      },
      evidence: {
        zh: `草稿更新于 ${formatDate(draft.updatedAt, "zh")}`,
        en: `Draft updated ${formatDate(draft.updatedAt, "en")}`
      },
      actionHref: `/kits/${draft.kitId}`,
      fingerprint: `review_drafts:${draft.id}`,
      missionId: null,
      sourceState: {
        outputId: draft.id,
        kitId: draft.kitId,
        platform: draft.platform
      },
      dueAt: new Date(now.getTime() + 12 * HOUR_MS).toISOString()
    });
  }

  if (state.latestMetric) {
    candidates.push({
      actionKind: "new_experiment",
      urgency: "planned",
      title: {
        zh: "新的真实结果已经可以用于下一轮",
        en: "Fresh real-world results are ready for the next cycle"
      },
      detail: {
        zh: "让 Agent 重新定位当前最大漏斗断点，再决定下一轮唯一实验变量。",
        en: "Let the Agent locate the largest funnel break again before choosing the next single variable."
      },
      evidence: {
        zh: `最近数据：${formatDate(state.latestMetric.measuredAt, "zh")}`,
        en: `Latest measurement: ${formatDate(state.latestMetric.measuredAt, "en")}`
      },
      actionHref: "/dashboard",
      fingerprint: `new_experiment:${state.latestMetric.kitId}:${state.latestMetric.measuredAt ?? "unknown"}`,
      missionId: null,
      sourceState: state.latestMetric,
      dueAt: new Date(now.getTime() + 24 * HOUR_MS).toISOString()
    });
  }

  if (!state.latestMetric) {
    candidates.push({
      actionKind: "first_measured_post",
      urgency: state.hasAnyKit ? "today" : "planned",
      title: {
        zh: state.hasAnyKit ? "先建立第一条真实数据闭环" : "从第一篇可测量内容开始",
        en: state.hasAnyKit ? "Build your first real measurement loop" : "Start with one measurable post"
      },
      detail: {
        zh: "生成、发布并回填一篇内容的完整表现；有了真实结果，Agent 才会开始做账号级判断。",
        en: "Generate, publish, and record one post end to end. The Agent starts account-level diagnosis from real outcomes."
      },
      evidence: {
        zh: state.hasAnyKit ? "已有内容包，但尚无表现数据" : "尚无可分析的内容或表现数据",
        en: state.hasAnyKit ? "Content exists, but no outcomes are measured yet" : "No measurable content or outcomes yet"
      },
      actionHref: "/workbench",
      fingerprint: state.hasAnyKit ? "first_measured_post:kit_exists" : "first_measured_post:empty",
      missionId: null,
      sourceState: { hasAnyKit: state.hasAnyKit },
      dueAt: new Date(now.getTime() + 24 * HOUR_MS).toISOString()
    });
  }
  return candidates;
}

export async function refreshUserPatrol(
  admin: AdminClient,
  userId: string,
  now = new Date()
): Promise<AgentPatrolItem | null> {
  const [missions, outputsResult, metricResult, kitResult, weeklyReport, xhsWorkflow, xhsCoaching] = await Promise.all([
    listGrowthMissions(admin, userId, 10),
    admin
      .from("kit_outputs")
      .select("id, kit_id, platform, publish_status, published_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(80),
    admin
      .from("performance_metrics")
      .select("kit_id, measured_at")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("content_kits")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    loadWeeklyGrowthReport(admin, userId, "zh", undefined, now).catch((error) => {
      console.error(`[agent/patrol] weekly report unavailable for user=${userId}:`, error);
      return null;
    }),
    loadXhsWorkflowState(admin, userId, "zh").catch(() => null),
    loadXhsCoachingPatrolState(admin, userId, now).catch(() => null)
  ]);

  if (outputsResult.error) throw outputsResult.error;
  if (metricResult.error) throw metricResult.error;
  if (kitResult.error) throw kitResult.error;

  const state: PatrolState = {
    missions,
    outputs: (outputsResult.data ?? []).map((row) => ({
      id: String(row.id),
      kitId: String(row.kit_id),
      platform: String(row.platform ?? ""),
      publishStatus: String(row.publish_status ?? "draft"),
      publishedAt: row.published_at ?? null,
      updatedAt: String(row.updated_at ?? now.toISOString())
    })),
    latestMetric: metricResult.data
      ? {
          kitId: String(metricResult.data.kit_id),
          measuredAt: metricResult.data.measured_at ?? null
        }
      : null,
    hasAnyKit: Boolean(kitResult.data),
    weeklyReport,
    xhsWorkflow,
    xhsCoaching
  };
  const candidates = derivePatrolCandidates(state, now);
  const [openItem, acknowledgedResult] = await Promise.all([
    getOpenPatrolItem(admin, userId),
    admin
      .from("agent_patrol_items")
      .select("fingerprint")
      .eq("user_id", userId)
      .in("status", ["done", "dismissed"])
      .in("fingerprint", candidates.map((candidate) => candidate.fingerprint))
      .order("updated_at", { ascending: false })
  ]);
  if (acknowledgedResult.error) throw acknowledgedResult.error;
  const acknowledgedFingerprints = new Set(
    (acknowledgedResult.data ?? []).map((row) => String(row.fingerprint))
  );
  const candidate = candidates.find((next) => !acknowledgedFingerprints.has(next.fingerprint));

  if (!candidate) {
    if (openItem) {
      await closePatrolItem(admin, userId, openItem, state, now);
    }
    return null;
  }

  if (openItem?.fingerprint === candidate.fingerprint) {
    const { data, error } = await admin
      .from("agent_patrol_items")
      .update({
        urgency: candidate.urgency,
        due_at: candidate.dueAt,
        source_state: candidate.sourceState,
        last_seen_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq("id", openItem.id)
      .eq("user_id", userId)
      .select(PATROL_FIELDS)
      .single();
    if (error) throw error;
    return mapPatrolItem(data as unknown as PatrolRow);
  }

  if (openItem) {
    await closePatrolItem(admin, userId, openItem, state, now);
  }

  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    status: "open",
    action_kind: candidate.actionKind,
    urgency: candidate.urgency,
    title_zh: candidate.title.zh,
    title_en: candidate.title.en,
    detail_zh: candidate.detail.zh,
    detail_en: candidate.detail.en,
    evidence_zh: candidate.evidence.zh,
    evidence_en: candidate.evidence.en,
    action_href: candidate.actionHref,
    fingerprint: candidate.fingerprint,
    mission_id: candidate.missionId,
    source_state: candidate.sourceState,
    due_at: candidate.dueAt,
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  const { data, error } = await admin
    .from("agent_patrol_items")
    .insert(row)
    .select(PATROL_FIELDS)
    .single();
  if (error) {
    // A browser refresh and the scheduled patrol can race. Return the row
    // that won the partial unique index instead of surfacing a duplicate.
    const concurrent = await getOpenPatrolItem(admin, userId);
    if (concurrent) return concurrent;
    throw error;
  }
  return mapPatrolItem(data as unknown as PatrolRow);
}

export async function getOpenPatrolItem(
  admin: AdminClient,
  userId: string
): Promise<AgentPatrolItem | null> {
  const { data, error } = await admin
    .from("agent_patrol_items")
    .select(PATROL_FIELDS)
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPatrolItem(data as unknown as PatrolRow) : null;
}

export async function listPatrolItems(
  admin: AdminClient,
  userId: string,
  limit = 10
): Promise<AgentPatrolItem[]> {
  const { data, error } = await admin
    .from("agent_patrol_items")
    .select(PATROL_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25));
  if (error) throw error;
  return ((data ?? []) as unknown as PatrolRow[]).map(mapPatrolItem);
}

export async function advancePatrolAfterEvent(
  admin: AdminClient,
  userId: string,
  event: PatrolProgressEvent,
  now = new Date()
): Promise<AgentPatrolItem | null> {
  const openItem = await getOpenPatrolItem(admin, userId);
  if (openItem && patrolItemMatchesEvent(openItem, event)) {
    const timestamp = now.toISOString();
    const { error } = await admin
      .from("agent_patrol_items")
      .update({
        status: "done",
        completed_at: timestamp,
        last_seen_at: timestamp,
        updated_at: timestamp
      })
      .eq("id", openItem.id)
      .eq("user_id", userId)
      .eq("status", "open");
    if (error) throw error;
  }
  return refreshUserPatrol(admin, userId, now);
}

export function patrolItemMatchesEvent(
  item: AgentPatrolItem,
  event: PatrolProgressEvent
): boolean {
  if (item.actionKind.startsWith("xhs_")) return false;
  if (event.type === "mission_created") {
    return item.actionKind === "new_experiment" || item.actionKind === "mission_review";
  }
  if (event.type === "kit_generated") {
    return item.actionKind === "mission_generate"
      && Boolean(event.missionId)
      && item.missionId === event.missionId;
  }
  if (event.type === "output_posted") {
    if (item.actionKind === "mission_publish") {
      return Boolean(event.missionId) && item.missionId === event.missionId;
    }
    return item.actionKind === "review_drafts"
      && sourceString(item, "outputId") === event.outputId;
  }
  if (item.actionKind === "mission_measure") {
    return Boolean(event.missionId) && item.missionId === event.missionId;
  }
  if (item.actionKind === "measure_results") {
    const sameKit = sourceString(item, "kitId") === event.kitId;
    const expectedPlatform = sourceString(item, "platform");
    return sameKit && (!expectedPlatform || expectedPlatform === event.platform);
  }
  return item.actionKind === "first_measured_post";
}

export function isPatrolItemSatisfiedByState(
  item: AgentPatrolItem,
  state: PatrolState
): boolean {
  if (item.actionKind.startsWith("xhs_")) {
    if (sourceString(item, "kind") === "coaching") {
      const expectedTaskId = sourceString(item, "taskId");
      return !state.xhsCoaching?.task || state.xhsCoaching.task.id !== expectedTaskId;
    }
    const expectedStage = sourceString(item, "stage");
    const current = state.xhsWorkflow?.workflow;
    return !current || current.stage !== expectedStage;
  }
  const mission = item.missionId
    ? state.missions.find((candidate) => candidate.id === item.missionId)
    : null;
  if (item.actionKind === "mission_generate") {
    return Boolean(mission && ["draft_ready", "posted", "completed"].includes(mission.status));
  }
  if (item.actionKind === "mission_publish") {
    return Boolean(mission && ["posted", "completed"].includes(mission.status));
  }
  if (item.actionKind === "mission_measure") {
    return mission?.status === "completed";
  }
  if (item.actionKind === "mission_review" || item.actionKind === "new_experiment") {
    const firstSeen = new Date(item.firstSeenAt).getTime();
    return state.missions.some((candidate) =>
      ACTIVE_MISSION_STATUSES.has(candidate.status)
      && new Date(candidate.createdAt).getTime() >= firstSeen
    );
  }
  if (item.actionKind === "measure_results") {
    const outputId = sourceString(item, "outputId");
    return state.outputs.some((output) =>
      output.id === outputId && ["measured", "iterated"].includes(output.publishStatus)
    );
  }
  if (item.actionKind === "review_drafts") {
    const outputId = sourceString(item, "outputId");
    return state.outputs.some((output) =>
      output.id === outputId && ["posted", "measured", "iterated"].includes(output.publishStatus)
    );
  }
  return Boolean(state.latestMetric);
}

function xhsCoachingCandidate(state: XhsCoachingPatrolState, now: Date): PatrolCandidate {
  const task = state.task!;
  const actionKinds: Record<typeof task.kind, PatrolActionKind> = {
    baseline: "xhs_review",
    plan: "xhs_topic",
    create: "xhs_draft",
    publish: "xhs_publish",
    observe: "xhs_review",
    review: "xhs_review",
    rediagnose: "xhs_review"
  };
  return {
    actionKind: actionKinds[task.kind],
    urgency: urgencyForDueAt(task.dueAt, now),
    title: {
      zh: `Day ${task.dayNumber} · ${task.title}`,
      en: `Day ${task.dayNumber} · Continue Xiaohongshu coaching`
    },
    detail: {
      zh: task.reason,
      en: "Complete today's evidence-backed coaching task before changing another variable."
    },
    evidence: {
      zh: `目标指标：${task.targetMetric}；唯一变量：${task.singleVariable}`,
      en: `Target metric: ${task.targetMetric}; single variable: ${task.singleVariable}`
    },
    actionHref: task.workbenchHref || "/operations/xiaohongshu",
    fingerprint: `xhs-coaching:${state.programId}:${task.id}:${task.updatedAt}`,
    missionId: null,
    sourceState: {
      kind: "coaching",
      programId: state.programId,
      taskId: task.id,
      dayNumber: task.dayNumber,
      taskStatus: task.status,
      targetMetric: task.targetMetric,
      singleVariable: task.singleVariable
    },
    dueAt: task.dueAt
  };
}

async function loadXhsCoachingPatrolState(
  admin: AdminClient,
  userId: string,
  now: Date
): Promise<XhsCoachingPatrolState | null> {
  const { data: program, error: programError } = await admin
    .from("xhs_coaching_programs")
    .select("id, start_date, timezone")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (programError) throw programError;
  if (!program) return null;

  const currentDay = getXhsCoachingDay(
    String(program.start_date),
    String(program.timezone),
    now
  );
  const { data: task, error: taskError } = await admin
    .from("xhs_coaching_tasks")
    .select("id, day_number, task_kind, title, reason, target_metric, single_variable, workbench_href, status, due_at, updated_at")
    .eq("user_id", userId)
    .eq("program_id", program.id)
    .lte("day_number", currentDay)
    .in("status", ["todo", "in_progress"])
    .order("day_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (taskError) throw taskError;
  return {
    programId: String(program.id),
    currentDay,
    task: task ? {
      id: String(task.id),
      dayNumber: Number(task.day_number),
      kind: String(task.task_kind) as NonNullable<XhsCoachingPatrolState["task"]>["kind"],
      title: String(task.title),
      reason: String(task.reason),
      targetMetric: String(task.target_metric),
      singleVariable: String(task.single_variable),
      workbenchHref: String(task.workbench_href || "/operations/xiaohongshu"),
      status: String(task.status) as "todo" | "in_progress",
      dueAt: String(task.due_at),
      updatedAt: String(task.updated_at)
    } : null
  };
}

function xhsWorkflowCandidate(state: XhsWorkflowState, now: Date): PatrolCandidate {
  const workflow = state.workflow!;
  const stageKind: Record<typeof workflow.stage, PatrolActionKind> = {
    positioning: "xhs_positioning",
    topic: "xhs_topic",
    draft: "xhs_draft",
    title: "xhs_title",
    visual: "xhs_visual",
    publish: "xhs_publish",
    review: "xhs_review"
  };
  const action = state.nextAction;
  return {
    actionKind: stageKind[workflow.stage],
    urgency: workflow.stage === "publish" || workflow.stage === "review" ? "today" : "planned",
    title: {
      zh: action.title,
      en: xhsStageTitle(workflow.stage)
    },
    detail: {
      zh: action.reason,
      en: "Continue the one approved next step in the active Xiaohongshu workflow."
    },
    evidence: {
      zh: action.evidence,
      en: action.confidence === "measured"
        ? "This recommendation uses measured outcomes."
        : "This recommendation is a strategy hypothesis until measured outcomes are available."
    },
    actionHref: action.href,
    fingerprint: `xhs:${workflow.id}:${workflow.stage}:${workflow.updatedAt}`,
    missionId: workflow.growthMissionId,
    sourceState: {
      workflowId: workflow.id,
      stage: workflow.stage,
      targetMetric: action.targetMetric,
      confidence: action.confidence
    },
    dueAt: new Date(now.getTime() + 24 * HOUR_MS).toISOString()
  };
}

function xhsStageTitle(stage: XhsWorkflowStage): string {
  const labels: Record<string, string> = {
    positioning: "Clarify the Xiaohongshu position",
    topic: "Choose the next Xiaohongshu topic",
    draft: "Prepare the evidence-backed note",
    title: "Choose one title experiment",
    visual: "Build the 3:4 visual story",
    publish: "Execute and publish the approved package",
    review: "Review the result and choose one next variable"
  };
  return labels[stage] ?? "Continue the Xiaohongshu workflow";
}

export function mapPatrolItem(row: PatrolRow): AgentPatrolItem {
  return {
    id: row.id,
    status: row.status,
    actionKind: row.action_kind,
    urgency: row.urgency,
    title: { zh: row.title_zh, en: row.title_en },
    detail: { zh: row.detail_zh, en: row.detail_en },
    evidence: { zh: row.evidence_zh, en: row.evidence_en },
    actionHref: row.action_href,
    fingerprint: row.fingerprint,
    missionId: row.mission_id,
    sourceState: row.source_state ?? {},
    dueAt: row.due_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function closePatrolItem(
  admin: AdminClient,
  userId: string,
  item: AgentPatrolItem,
  state: PatrolState,
  now: Date
): Promise<void> {
  const timestamp = now.toISOString();
  const { error } = await admin
    .from("agent_patrol_items")
    .update({
      status: isPatrolItemSatisfiedByState(item, state) ? "done" : "superseded",
      completed_at: timestamp,
      last_seen_at: timestamp,
      updated_at: timestamp
    })
    .eq("id", item.id)
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) throw error;
}

function sourceString(item: AgentPatrolItem, key: string): string {
  const value = item.sourceState[key];
  return typeof value === "string" ? value : "";
}

function weeklyAnomalyCandidate(
  report: WeeklyGrowthReport,
  anomaly: WeeklyGrowthAnomaly,
  now: Date
): PatrolCandidate {
  const english = weeklyAnomalyEnglishCopy(report, anomaly);
  return {
    actionKind: "new_experiment",
    urgency: anomaly.severity === "critical" ? "overdue" : "today",
    title: {
      zh: `本周异常：${anomaly.title}`,
      en: `Weekly alert: ${english.title}`
    },
    detail: {
      zh: `${anomaly.interpretation}${anomaly.action}`,
      en: english.detail
    },
    evidence: {
      zh: anomaly.evidence,
      en: english.evidence
    },
    actionHref: "/dashboard?focus=weekly-report",
    fingerprint: `weekly_anomaly:${report.fingerprint}`,
    missionId: null,
    sourceState: {
      reportFingerprint: report.fingerprint,
      anomalyId: anomaly.id,
      platform: report.platform,
      stage: anomaly.stage,
      severity: anomaly.severity,
      metric: anomaly.metric,
      changePercent: anomaly.changePercent
    },
    dueAt: new Date(now.getTime() + (anomaly.severity === "critical" ? 4 : 12) * HOUR_MS).toISOString()
  };
}

function weeklyAnomalyEnglishCopy(
  report: WeeklyGrowthReport,
  anomaly: WeeklyGrowthAnomaly
): { title: string; detail: string; evidence: string } {
  const copy: Record<string, { title: string; detail: string; trendKey?: string }> = {
    publishing_gap: {
      title: "No measurable post in the last 7 days",
      detail: "Restore one measurable post using the strongest structure from the previous cycle."
    },
    distribution_drop: {
      title: "Reach dropped sharply",
      detail: "Test only the topic entry or publish timing before rewriting the content.",
      trendKey: "impressions"
    },
    click_drop: {
      title: "Cover click-through declined",
      detail: "Test only the cover promise and keep the body structure fixed.",
      trendKey: "cover_click_rate"
    },
    value_drop: {
      title: "Save/share efficiency declined",
      detail: "Add one save-worthy checklist, template, or decision framework.",
      trendKey: "save_share_per_thousand"
    },
    conversion_drop: {
      title: "Views are not converting to follows",
      detail: "Strengthen one explicit ongoing follow promise without changing other variables.",
      trendKey: "followers_per_thousand"
    }
  };
  const selected = copy[anomaly.id] ?? {
    title: "A core growth metric declined",
    detail: "Investigate the evidence and test one variable before changing the whole post."
  };
  const trend = report.trends.find((candidate) => candidate.key === selected.trendKey);
  const evidence = anomaly.id === "publishing_gap"
    ? `${report.previous.samples} measurable post(s) in the previous cycle → ${report.current.samples} now.`
    : trend
      ? `${trend.previousDisplay} previously → ${trend.currentDisplay} now${trend.changePercent === null ? "" : ` (${trend.changePercent.toFixed(1)}%)`}.`
      : "The latest comparison crossed Finfold's material-change threshold.";
  return { title: selected.title, detail: selected.detail, evidence };
}

function missionCandidate(mission: GrowthMission, now: Date): PatrolCandidate {
  const metricEvidence = {
    zh: `${mission.primaryMetric}：基线 ${formatMetric(mission.baselineValue)} → 目标 ${formatMetric(mission.targetValue)}`,
    en: `${mission.primaryMetric}: ${formatMetric(mission.baselineValue)} baseline → ${formatMetric(mission.targetValue)} target`
  };
  if (mission.status === "accepted") {
    return {
      actionKind: "mission_generate",
      urgency: "today",
      title: { zh: "Growth Mission 已接受，等待生成", en: "Growth Mission accepted — generation is next" },
      detail: {
        zh: "把同一个实验 ID 带进工作台，生成只验证本轮变量的内容。",
        en: "Carry the same experiment ID into the Workbench and generate content that tests only this variable."
      },
      evidence: metricEvidence,
      actionHref: `/operations/missions/${mission.id}`,
      fingerprint: `mission_generate:${mission.id}`,
      missionId: mission.id,
      sourceState: { missionStatus: mission.status },
      dueAt: new Date(now.getTime() + 12 * HOUR_MS).toISOString()
    };
  }
  if (mission.status === "draft_ready") {
    return {
      actionKind: "mission_publish",
      urgency: "today",
      title: { zh: "实验草稿已经就绪，下一步是发布", en: "The experiment draft is ready — publishing is next" },
      detail: {
        zh: "完成最后检查并发布目标平台版本；不要同时改动实验之外的变量。",
        en: "Complete the final check and publish the target-platform version without changing variables outside the experiment."
      },
      evidence: metricEvidence,
      actionHref: `/operations/missions/${mission.id}`,
      fingerprint: `mission_publish:${mission.id}`,
      missionId: mission.id,
      sourceState: { missionStatus: mission.status, kitId: mission.kitId },
      dueAt: new Date(now.getTime() + 12 * HOUR_MS).toISOString()
    };
  }

  const dueAt = addHours(mission.updatedAt, 48);
  return {
    actionKind: "mission_measure",
    urgency: urgencyForDueAt(dueAt, now),
    title: {
      zh: urgencyForDueAt(dueAt, now) === "overdue" ? "实验结果已经到期，等待回采" : "实验已发布，准备回采结果",
      en: urgencyForDueAt(dueAt, now) === "overdue" ? "Experiment results are overdue" : "Experiment published — prepare to collect results"
    },
    detail: {
      zh: "回填唯一主指标后，Agent 会自动判定胜出、未胜出或证据不足。",
      en: "Record the single primary metric and the Agent will judge won, lost, or inconclusive automatically."
    },
    evidence: metricEvidence,
    actionHref: `/operations/missions/${mission.id}`,
    fingerprint: `mission_measure:${mission.id}`,
    missionId: mission.id,
    sourceState: { missionStatus: mission.status, kitId: mission.kitId },
    dueAt
  };
}

function urgencyForDueAt(dueAt: string, now: Date): PatrolUrgency {
  const remaining = new Date(dueAt).getTime() - now.getTime();
  if (remaining <= 0) return "overdue";
  return remaining <= 24 * HOUR_MS ? "today" : "planned";
}

function addHours(iso: string, hours: number): string {
  const timestamp = new Date(iso).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(safeTimestamp + hours * HOUR_MS).toISOString();
}

function ageLabel(iso: string, now: Date, locale: "zh" | "en"): string {
  const ageHours = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / HOUR_MS));
  if (ageHours < 24) return locale === "zh" ? `${ageHours} 小时` : `${ageHours}h ago`;
  const days = Math.floor(ageHours / 24);
  return locale === "zh" ? `${days} 天` : `${days}d ago`;
}

function formatDate(iso: string | null | undefined, locale: "zh" | "en"): string {
  if (!iso) return locale === "zh" ? "暂无时间" : "time unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return locale === "zh" ? "暂无时间" : "time unavailable";
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric"
  });
}

function formatMetric(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
