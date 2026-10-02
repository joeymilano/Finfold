import { z } from "zod";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { loadGrowthBriefing, type GrowthBriefing } from "@/lib/agent/growth-briefing";

export const xhsWorkflowStages = [
  "positioning",
  "topic",
  "draft",
  "title",
  "visual",
  "publish",
  "review"
] as const;

export type XhsWorkflowStage = (typeof xhsWorkflowStages)[number];
export type XhsWorkflowStatus = "active" | "completed" | "dismissed" | "superseded";
export type XhsArtifactKind =
  | "creator_strategy"
  | "topic_evidence"
  | "note_brief"
  | "title_matrix"
  | "visual_plan"
  | "analytics_report";
export type XhsArtifactConfidence = "measured" | "inferred" | "hypothesis";
export type XhsPendingActionKind =
  | "confirm_positioning"
  | "confirm_campaign"
  | "select_topic"
  | "confirm_draft"
  | "select_title"
  | "confirm_visual"
  | "link_kit"
  | "mark_published"
  | "complete_review";

export type CreatorStrategyProfile = {
  id: string;
  positioningStatement: string;
  audienceLabels: string[];
  contentPillars: string[];
  identityProofs: string[];
  seriesPromises: string[];
  sustainableCadence: string;
  boundaries: string[];
  version: number;
  updatedAt: string;
};

export type XhsWorkflowArtifact = {
  id: string;
  workflowId: string;
  kind: XhsArtifactKind;
  version: number;
  status: "proposed" | "approved" | "superseded";
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  confidence: XhsArtifactConfidence;
  createdAt: string;
};

export type XhsNextAction = {
  kind:
    | "complete_positioning"
    | "research_topics"
    | "add_evidence"
    | "prepare_draft"
    | "refine_titles"
    | "build_visual"
    | "publish_note"
    | "import_metrics"
    | "review_results";
  title: string;
  reason: string;
  evidence: string;
  targetMetric: string | null;
  href: string;
  prompt: string;
  requiresConfirmation: boolean;
  confidence: XhsArtifactConfidence;
};

export type XhsWorkflow = {
  id: string;
  status: XhsWorkflowStatus;
  stage: XhsWorkflowStage;
  currentBottleneck: string | null;
  primaryMetric: string | null;
  strategyProfileId: string | null;
  growthMissionId: string | null;
  kitId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XhsWorkflowState = {
  workflow: XhsWorkflow | null;
  strategy: CreatorStrategyProfile | null;
  artifacts: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>>;
  nextAction: XhsNextAction;
  progress: {
    current: number;
    total: number;
    completedStages: XhsWorkflowStage[];
  };
  dataStatus: {
    sampleSize: number;
    hasMeasuredData: boolean;
    limitation: string | null;
  };
  persistenceAvailable: boolean;
};

export type XhsPendingAction = {
  id: string;
  workflowId: string;
  actionKind: XhsPendingActionKind;
  payload: Record<string, unknown>;
  status: "pending" | "executing" | "executed" | "expired" | "cancelled";
  expiresAt: string;
  result?: Record<string, unknown> | null;
  autoReview?: Record<string, unknown> | null;
};

/** A persisted review artifact receipt, not a claim that Brand Memory changed. */
export type XhsWorkflowCompletionReceipt = {
  title: string;
  summary: string;
  evidence: string;
  primaryMetric: string;
  nextAction: Pick<XhsNextAction, "title" | "href" | "prompt">;
  persistedArtifact: "analytics_report";
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type WorkflowRow = {
  id: string;
  status: XhsWorkflowStatus;
  stage: XhsWorkflowStage;
  current_bottleneck: string | null;
  primary_metric: string | null;
  strategy_profile_id: string | null;
  growth_mission_id: string | null;
  kit_id: string | null;
  created_at: string;
  updated_at: string;
};

type StrategyRow = {
  id: string;
  positioning_statement: string;
  audience_labels: unknown;
  content_pillars: unknown;
  identity_proofs: unknown;
  series_promises: unknown;
  sustainable_cadence: string;
  boundaries: unknown;
  version: number;
  updated_at: string;
};

type ArtifactRow = {
  id: string;
  workflow_id: string;
  kind: XhsArtifactKind;
  version: number;
  status: XhsWorkflowArtifact["status"];
  payload: unknown;
  provenance: unknown;
  confidence: XhsArtifactConfidence;
  created_at: string;
};

const WORKFLOW_FIELDS = "id, status, stage, current_bottleneck, primary_metric, strategy_profile_id, growth_mission_id, kit_id, created_at, updated_at";
const STRATEGY_FIELDS = "id, positioning_statement, audience_labels, content_pillars, identity_proofs, series_promises, sustainable_cadence, boundaries, version, updated_at";
const ARTIFACT_FIELDS = "id, workflow_id, kind, version, status, payload, provenance, confidence, created_at";

const strategyPayloadSchema = z.object({
  positioningStatement: z.string().min(4).max(300),
  audienceLabels: z.array(z.string().min(1).max(80)).min(1).max(8),
  contentPillars: z.array(z.string().min(1).max(100)).min(2).max(6),
  identityProofs: z.array(z.string().min(1).max(180)).max(8).default([]),
  seriesPromises: z.array(z.string().min(1).max(120)).max(8).default([]),
  sustainableCadence: z.string().max(100).default("每周 2-3 篇"),
  boundaries: z.array(z.string().min(1).max(160)).max(12).default([])
});

export type CreatorStrategyInput = z.infer<typeof strategyPayloadSchema>;

export function emptyXhsWorkflowState(locale: "zh" | "en" = "zh"): XhsWorkflowState {
  return {
    workflow: null,
    strategy: null,
    artifacts: {},
    nextAction: deriveXhsNextAction({ stage: "positioning", locale }),
    progress: {
      current: 1,
      total: xhsWorkflowStages.length,
      completedStages: []
    },
    dataStatus: {
      sampleSize: 0,
      hasMeasuredData: false,
      limitation: locale === "zh"
        ? "尚无真实表现数据；当前建议属于策略假设。"
        : "No measured outcomes; current advice is a strategy hypothesis."
    },
    persistenceAvailable: false
  };
}

export async function loadXhsWorkflowState(
  admin: AdminClient,
  userId: string,
  locale: "zh" | "en" = "zh",
  workflowId?: string
): Promise<XhsWorkflowState> {
  let workflow: XhsWorkflow | null = null;
  let strategy: CreatorStrategyProfile | null = null;
  let persistenceAvailable = true;
  let importedSampleSize = 0;

  let workflowQuery = admin
    .from("xhs_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("user_id", userId);
  workflowQuery = workflowId
    ? workflowQuery.eq("id", workflowId)
    : workflowQuery.eq("status", "active").order("updated_at", { ascending: false }).limit(1);

  const [workflowResult, strategyResult, briefing] = await Promise.all([
    workflowQuery.maybeSingle(),
    admin
      .from("creator_strategy_profiles")
      .select(STRATEGY_FIELDS)
      .eq("user_id", userId)
      .eq("platform", "xiaohongshu")
      .maybeSingle(),
    loadGrowthBriefing(admin, userId, locale, "xiaohongshu").catch(() => null)
  ]);

  if (workflowResult.error && isMissingRelation(workflowResult.error)) {
    persistenceAvailable = false;
  } else if (workflowResult.error) {
    throw workflowResult.error;
  } else if (workflowResult.data) {
    workflow = mapWorkflow(workflowResult.data as unknown as WorkflowRow);
  }

  if (strategyResult.error && isMissingRelation(strategyResult.error)) {
    persistenceAvailable = false;
  } else if (strategyResult.error) {
    throw strategyResult.error;
  } else if (strategyResult.data) {
    strategy = mapStrategy(strategyResult.data as unknown as StrategyRow);
  }

  const artifacts: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>> = {};
  if (workflow && persistenceAvailable) {
    const [artifactResult, importResult] = await Promise.all([
      admin
        .from("xhs_workflow_artifacts")
        .select(ARTIFACT_FIELDS)
        .eq("user_id", userId)
        .eq("workflow_id", workflow.id)
        .eq("status", "approved")
        .order("version", { ascending: false }),
      admin
        .from("agent_data_imports")
        .select("normalized_rows")
        .eq("user_id", userId)
        .eq("workflow_id", workflow.id)
    ]);
    if (artifactResult.error && !isMissingRelation(artifactResult.error)) throw artifactResult.error;
    if (artifactResult.error) persistenceAvailable = false;
    for (const row of (artifactResult.data ?? []) as unknown as ArtifactRow[]) {
      if (!artifacts[row.kind]) artifacts[row.kind] = mapArtifact(row);
    }
    if (importResult.error && !isMissingRelation(importResult.error)) throw importResult.error;
    importedSampleSize = (importResult.data ?? []).reduce(
      (sum, item) => sum + (Array.isArray(item.normalized_rows) ? item.normalized_rows.length : 0),
      0
    );
  }

  const stage = strategy ? workflow?.stage ?? "topic" : "positioning";
  const nextAction = deriveXhsNextAction({
    stage,
    strategy,
    workflow,
    artifacts,
    briefing,
    importedSampleSize,
    locale
  });
  const current = xhsWorkflowStages.indexOf(stage) + 1;

  return {
    workflow,
    strategy,
    artifacts,
    nextAction,
    progress: {
      current,
      total: xhsWorkflowStages.length,
      completedStages: xhsWorkflowStages.slice(0, Math.max(0, current - 1))
    },
    dataStatus: {
      sampleSize: (briefing?.sampleSize ?? 0) + importedSampleSize,
      hasMeasuredData: (briefing?.sampleSize ?? 0) + importedSampleSize > 0,
      limitation: dataLimitation(briefing, locale, importedSampleSize)
    },
    persistenceAvailable
  };
}

export function deriveXhsNextAction(input: {
  stage: XhsWorkflowStage;
  strategy?: CreatorStrategyProfile | null;
  workflow?: XhsWorkflow | null;
  artifacts?: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>>;
  briefing?: GrowthBriefing | null;
  importedSampleSize?: number;
  locale?: "zh" | "en";
}): XhsNextAction {
  const locale = input.locale ?? "zh";
  const zh = locale === "zh";
  const workflowId = input.workflow?.id;
  const baseHref = workflowId ? `/dashboard?workflowId=${encodeURIComponent(workflowId)}` : "/dashboard";
  const sampleSize = (input.briefing?.sampleSize ?? 0) + (input.importedSampleSize ?? 0);
  const priority = input.briefing?.priorities[0];

  if (!input.strategy || input.stage === "positioning") {
    return {
      kind: "complete_positioning",
      title: zh ? "先把账号定位说清楚" : "Clarify the account position",
      reason: zh ? "没有稳定定位时，选题和爆款技巧只会让内容越做越散。" : "Without a stable position, topic and hook tactics make the account less coherent.",
      evidence: zh ? "尚未确认小红书定位、内容支柱和可持续更新节奏。" : "Positioning, content pillars, and sustainable cadence are not confirmed.",
      targetMetric: null,
      href: baseHref,
      prompt: zh ? "帮我用三个问题完成小红书账号定位" : "Help me position my Xiaohongshu account with three questions",
      requiresConfirmation: true,
      confidence: "hypothesis"
    };
  }

  if (input.stage === "topic") {
    return {
      kind: "research_topics",
      title: zh ? "选一个既能增长、又能长期做的题" : "Choose a topic built for growth and consistency",
      reason: zh ? "把热点机会与已确认的内容支柱交叉，避免追逐无关流量。" : "Cross current opportunities with approved pillars instead of chasing unrelated reach.",
      evidence: zh
        ? `已确认 ${input.strategy.contentPillars.length} 个内容支柱；当前选题尚未确认。`
        : `${input.strategy.contentPillars.length} pillars are confirmed; the next topic is not.`,
      targetMetric: priority?.metric ?? null,
      href: baseHref,
      prompt: zh ? "基于我的定位，给我今天最值得做的三个小红书选题" : "Give me three Xiaohongshu topics worth making today",
      requiresConfirmation: true,
      confidence: sampleSize > 0 ? "inferred" : "hypothesis"
    };
  }

  if (input.stage === "draft") {
    const topic = stringValue(input.artifacts?.topic_evidence?.payload.selectedTopic);
    return {
      kind: "prepare_draft",
      title: zh ? "先补真实素材，再写正文" : "Add real evidence before drafting",
      reason: zh ? "智能体会标出缺失事实，不会替你编造案例、结果或身份背书。" : "The Agent will expose evidence gaps instead of inventing cases or outcomes.",
      evidence: topic
        ? (zh ? `当前选题：${topic}` : `Selected topic: ${topic}`)
        : (zh ? "选题已进入写作阶段。" : "The selected topic is ready for drafting."),
      targetMetric: priority?.metric ?? null,
      href: baseHref,
      prompt: zh ? "检查这个选题缺哪些真实素材，然后生成笔记框架" : "Find the real evidence gaps, then draft the note structure",
      requiresConfirmation: true,
      confidence: "hypothesis"
    };
  }

  if (input.stage === "title") {
    return {
      kind: "refine_titles",
      title: zh ? "只优化标题和首屏承诺" : "Optimize only the title and first-screen promise",
      reason: zh ? "这一轮不同时重写正文和视觉，保证实验变量可判断。" : "Keep body and visual stable so the experiment stays interpretable.",
      evidence: zh ? "正文方向已确认，标题候选尚未选择。" : "The draft direction is approved; a title has not been selected.",
      targetMetric: zh ? "封面点击率" : "Cover click-through rate",
      href: baseHref,
      prompt: zh ? "为当前笔记生成并评分标题候选" : "Generate and score title candidates for this note",
      requiresConfirmation: true,
      confidence: "inferred"
    };
  }

  if (input.stage === "visual") {
    return {
      kind: "build_visual",
      title: zh ? "把内容编排成 3:4 多页故事" : "Turn the note into a 3:4 visual story",
      reason: zh ? "继续使用 Finfold 的封面和视觉故事能力，只确定一套可执行的页面节奏。" : "Use Finfold's existing cover and visual-story tools with one executable page rhythm.",
      evidence: zh ? "标题已选定，视觉页面结构尚未确认。" : "A title is selected; the page structure is not confirmed.",
      targetMetric: zh ? "封面点击率" : "Cover click-through rate",
      href: baseHref,
      prompt: zh ? "为当前笔记生成 3:4 封面和多页视觉方案" : "Build a 3:4 cover and carousel plan",
      requiresConfirmation: true,
      confidence: "inferred"
    };
  }

  if (input.stage === "publish") {
    const workbenchHref = buildXhsWorkbenchHref(input.workflow, input.artifacts);
    return {
      kind: input.workflow?.kitId ? "publish_note" : "publish_note",
      title: input.workflow?.kitId
        ? (zh ? "发布这轮单变量实验" : "Publish this controlled experiment")
        : (zh ? "带着已确认方案去创作台" : "Execute the approved plan in Workbench"),
      reason: input.workflow?.kitId
        ? (zh ? "内容包已生成，下一步是发布并记录真实结果。" : "The kit is ready; publish it and collect a real outcome.")
        : (zh ? "策略已确认，创作台负责编辑、封面、配图和导出。" : "Strategy is approved; Workbench handles editing, visuals, and export."),
      evidence: zh ? "定位、选题、正文方向、标题和视觉方案已经确认。" : "Positioning, topic, draft direction, title, and visual plan are approved.",
      targetMetric: priority?.metric ?? null,
      href: workbenchHref,
      prompt: zh ? "检查当前方案，然后带我去创作台" : "Review the plan and take me to Workbench",
      requiresConfirmation: false,
      confidence: "inferred"
    };
  }

  const hasData = sampleSize > 0;
  return {
    kind: hasData ? "review_results" : "import_metrics",
    title: hasData
      ? (zh ? "复盘结果，只找一个上游断点" : "Review the result and find one upstream break")
      : (zh ? "回填真实数据，完成这一轮闭环" : "Add real metrics to close the loop"),
    reason: hasData
      ? (zh ? "先判断曝光、点击、停留、互动或转化中的最上游问题。" : "Find the earliest break across reach, click, retention, value, or conversion.")
      : (zh ? "没有真实表现时，智能体不会把通用规律冒充账号洞察。" : "Without outcomes, the Agent will not present generic advice as account insight."),
    evidence: hasData
      ? (priority?.evidence ?? (zh ? `已读取 ${sampleSize} 份真实结果。` : `${sampleSize} measured results loaded.`))
      : (zh ? "尚未读取到这轮发布的真实表现。" : "No measured result is linked to this workflow yet."),
    targetMetric: priority?.metric ?? null,
    href: input.workflow?.kitId ? `/kits/${input.workflow.kitId}` : baseHref,
    prompt: hasData ? (zh ? "复盘这轮表现并安排下一步" : "Review this result and assign the next move") : (zh ? "告诉我需要回填哪些小红书数据" : "Tell me which Xiaohongshu metrics to add"),
    requiresConfirmation: false,
    confidence: hasData ? "measured" : "hypothesis"
  };
}

export async function ensureActiveXhsWorkflow(
  admin: AdminClient,
  userId: string
): Promise<XhsWorkflow> {
  const { data: existing, error: existingError } = await admin
    .from("xhs_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return mapWorkflow(existing as unknown as WorkflowRow);

  const { data: profile } = await admin
    .from("creator_strategy_profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "xiaohongshu")
    .maybeSingle();
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    status: "active",
    stage: profile?.id ? "topic" : "positioning",
    strategy_profile_id: profile?.id ?? null,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await admin.from("xhs_workflows").insert(row).select(WORKFLOW_FIELDS).single();
  if (!error && data) return mapWorkflow(data as unknown as WorkflowRow);

  const { data: concurrent, error: concurrentError } = await admin
    .from("xhs_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (concurrentError || !concurrent) throw error ?? concurrentError ?? new Error("Unable to start the Xiaohongshu workflow.");
  return mapWorkflow(concurrent as unknown as WorkflowRow);
}

export async function createXhsPendingAction(
  admin: AdminClient,
  input: {
    userId: string;
    sessionId?: string;
    actionKind: XhsPendingActionKind;
    payload: Record<string, unknown>;
    autoReview?: Record<string, unknown>;
  }
): Promise<XhsPendingAction> {
  const workflow = await ensureActiveXhsWorkflow(admin, input.userId);
  const fingerprint = await createAgentActionFingerprint(workflow.id, input.actionKind, input.payload);
  const { data: existing } = await admin
    .from("agent_pending_actions")
    .select("id, workflow_id, action_kind, payload, status, expires_at, result, auto_review")
    .eq("user_id", input.userId)
    .eq("fingerprint", fingerprint)
    .eq("status", "pending")
    .maybeSingle();
  if (existing && new Date(String(existing.expires_at)).getTime() > Date.now()) {
    return mapPendingAction(existing);
  }
  if (existing) {
    await admin
      .from("agent_pending_actions")
      .update({ status: "expired" })
      .eq("id", existing.id)
      .eq("user_id", input.userId)
      .eq("status", "pending");
  }

  const row = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    workflow_id: workflow.id,
    action_kind: input.actionKind,
    payload: input.payload,
    fingerprint,
    // Conditional so creation still works before the migration is applied.
    ...(input.autoReview ? { auto_review: input.autoReview } : {})
  };
  const { data, error } = await admin
    .from("agent_pending_actions")
    .insert(row)
    .select("id, workflow_id, action_kind, payload, status, expires_at, result, auto_review")
    .single();
  if (error || !data) throw error ?? new Error("Unable to prepare the Agent action.");
  return mapPendingAction(data);
}

/** Keeps idempotency keys index-safe even when a campaign payload contains a full visual plan. */
export async function createAgentActionFingerprint(
  workflowId: string,
  actionKind: XhsPendingActionKind,
  payload: Record<string, unknown>
): Promise<string> {
  const input = `${workflowId}:${actionKind}:${stableStringify(payload)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function executeXhsPendingAction(
  admin: AdminClient,
  input: {
    userId: string;
    pendingActionId: string;
    selection?: string | number;
  }
): Promise<{
  state: XhsWorkflowState;
  auditId: string | null;
  alreadyExecuted: boolean;
  completionReceipt: XhsWorkflowCompletionReceipt | null;
}> {
  const { data: pending, error } = await admin
    .from("agent_pending_actions")
    .select("id, workflow_id, action_kind, payload, status, expires_at, result")
    .eq("id", input.pendingActionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw error;
  if (!pending) throw new Error("This Agent action no longer exists.");
  if (pending.status === "executed") {
    return {
      state: await loadXhsWorkflowState(admin, input.userId, "zh"),
      auditId: stringValue(pending.result?.auditId) || null,
      alreadyExecuted: true,
      completionReceipt: completionReceiptValue(pending.result?.completionReceipt)
    };
  }
  if (pending.status !== "pending") throw new Error("This Agent action is already being processed.");
  if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
    await admin.from("agent_pending_actions").update({ status: "expired" }).eq("id", pending.id).eq("user_id", input.userId);
    throw new Error("This confirmation expired. Ask the Agent to prepare it again.");
  }

  const { data: claimed, error: claimError } = await admin
    .from("agent_pending_actions")
    .update({ status: "executing" })
    .eq("id", pending.id)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("This Agent action is already being processed.");

  try {
    const before = await captureXhsAuditSnapshot(admin, input.userId, String(pending.workflow_id));
    await applyConfirmedAction(admin, {
      userId: input.userId,
      workflowId: String(pending.workflow_id),
      actionKind: pending.action_kind as XhsPendingActionKind,
      payload: recordValue(pending.payload),
      selection: input.selection
    });
    const after = await captureXhsAuditSnapshot(admin, input.userId, String(pending.workflow_id));
    const auditId = crypto.randomUUID();
    const { error: auditError } = await admin.from("agent_action_audit").insert({
      id: auditId,
      user_id: input.userId,
      session_id: null,
      tool_name: pending.action_kind,
      target_type: "xhs_workflow",
      action_args: { pendingActionId: pending.id, selection: input.selection },
      before_state: before,
      after_state: after,
      status: "applied"
    });
    const persistedAuditId = auditError ? null : auditId;
    const state = await loadXhsWorkflowState(admin, input.userId, "zh");
    const completionReceipt = pending.action_kind === "complete_review"
      ? buildXhsReviewCompletionReceipt(recordValue(pending.payload), state)
      : null;
    const result = {
      auditId: persistedAuditId,
      workflowId: state.workflow?.id,
      stage: state.workflow?.stage,
      ...(completionReceipt ? { completionReceipt } : {})
    };
    const { error: finishError } = await admin
      .from("agent_pending_actions")
      .update({ status: "executed", executed_at: new Date().toISOString(), result })
      .eq("id", pending.id)
      .eq("user_id", input.userId)
      .eq("status", "executing");
    if (finishError) throw finishError;
    return { state, auditId: persistedAuditId, alreadyExecuted: false, completionReceipt };
  } catch (caught) {
    await admin
      .from("agent_pending_actions")
      .update({ status: "pending" })
      .eq("id", pending.id)
      .eq("user_id", input.userId)
      .eq("status", "executing");
    throw caught;
  }
}

/**
 * Builds the receipt shown after an approved performance review. Every field
 * comes from the persisted review payload or the state-derived next action;
 * this intentionally does not represent an unverified Brand Memory update.
 */
export function buildXhsReviewCompletionReceipt(
  payload: Record<string, unknown>,
  state: XhsWorkflowState
): XhsWorkflowCompletionReceipt {
  const report = recordValue(payload.report ?? payload);
  const summary = stringValue(report.summary);
  const evidence = stringValue(report.evidence);
  const primaryMetric = stringValue(payload.primaryMetric) || stringValue(report.primaryMetric);
  return {
    title: stringValue(report.title) || "本轮真实表现复盘已保存",
    summary: summary || "已保存本轮真实表现复盘，并据此安排下一轮。",
    evidence: evidence || state.nextAction.evidence,
    primaryMetric: primaryMetric || state.nextAction.targetMetric || "",
    nextAction: {
      title: state.nextAction.title,
      href: state.nextAction.href,
      prompt: state.nextAction.prompt
    },
    persistedArtifact: "analytics_report"
  };
}

export async function linkXhsWorkflowToKit(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  kitId: string,
  missionId?: string
): Promise<void> {
  const { error } = await admin
    .from("xhs_workflows")
    .update({
      kit_id: kitId,
      growth_mission_id: missionId ?? null,
      stage: "publish",
      updated_at: new Date().toISOString()
    })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  await admin.from("content_kits").update({ xhs_workflow_id: workflowId }).eq("id", kitId).eq("user_id", userId);
}

export async function loadXhsGenerationContext(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  requestedArtifactIds: string[] = []
): Promise<{
  workflowId: string;
  stage: XhsWorkflowStage;
  positioning?: string;
  selectedTopic?: string;
  noteBrief?: Record<string, unknown>;
  selectedTitle?: string;
  visualPlan?: Record<string, unknown>;
  artifactVersionIds: string[];
}> {
  const { data: workflow, error: workflowError } = await admin
    .from("xhs_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (workflowError) throw workflowError;
  if (!workflow) throw new Error("This Xiaohongshu workflow is no longer active.");
  const mappedWorkflow = mapWorkflow(workflow as unknown as WorkflowRow);
  if (!["visual", "publish"].includes(mappedWorkflow.stage)) {
    throw new Error("Confirm the topic, draft, title, and visual direction in the Agent before generating.");
  }

  let query = admin
    .from("xhs_workflow_artifacts")
    .select(ARTIFACT_FIELDS)
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .eq("status", "approved")
    .order("version", { ascending: false });
  if (requestedArtifactIds.length > 0) query = query.in("id", requestedArtifactIds);
  const { data, error } = await query;
  if (error) throw error;
  const latest: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>> = {};
  for (const row of (data ?? []) as unknown as ArtifactRow[]) {
    if (!latest[row.kind]) latest[row.kind] = mapArtifact(row);
  }
  const artifactVersionIds = Object.values(latest).map((artifact) => artifact.id);
  return {
    workflowId,
    stage: mappedWorkflow.stage,
    positioning: stringValue(latest.creator_strategy?.payload.positioningStatement),
    selectedTopic: stringValue(latest.topic_evidence?.payload.selectedTopic),
    noteBrief: latest.note_brief?.payload,
    selectedTitle: stringValue(latest.title_matrix?.payload.selectedTitle),
    visualPlan: latest.visual_plan?.payload,
    artifactVersionIds
  };
}

export async function markXhsWorkflowReadyForReview(
  admin: AdminClient,
  userId: string,
  workflowId: string
): Promise<void> {
  const { error } = await admin
    .from("xhs_workflows")
    .update({ stage: "review", updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
}

async function applyConfirmedAction(
  admin: AdminClient,
  input: {
    userId: string;
    workflowId: string;
    actionKind: XhsPendingActionKind;
    payload: Record<string, unknown>;
    selection?: string | number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  if (input.actionKind === "confirm_campaign") {
    const strategy = strategyPayloadSchema.parse(input.payload.strategy);
    if (input.payload.strategyMode === "generated") {
      const { data: existing } = await admin
        .from("creator_strategy_profiles")
        .select("id, version")
        .eq("user_id", input.userId)
        .eq("platform", "xiaohongshu")
        .maybeSingle();
      const strategyId = existing?.id ?? crypto.randomUUID();
      const version = Number(existing?.version ?? 0) + 1;
      const { error } = await admin.from("creator_strategy_profiles").upsert({
        id: strategyId,
        user_id: input.userId,
        platform: "xiaohongshu",
        positioning_statement: strategy.positioningStatement,
        audience_labels: strategy.audienceLabels,
        content_pillars: strategy.contentPillars,
        identity_proofs: strategy.identityProofs,
        series_promises: strategy.seriesPromises,
        sustainable_cadence: strategy.sustainableCadence,
        boundaries: strategy.boundaries,
        version,
        updated_at: now
      }, { onConflict: "user_id,platform" });
      if (error) throw error;
      await createApprovedArtifact(admin, input.userId, input.workflowId, "creator_strategy", strategy, {
        source: "agent_campaign_confirmed"
      }, "inferred");
      await updateWorkflow(admin, input.userId, input.workflowId, { strategy_profile_id: strategyId });
    }

    const selectedTopic = selectCandidate(input.payload.topics, stringValue(input.payload.selectedTopicId));
    const selectedTitle = selectCandidate(input.payload.titles, stringValue(input.payload.selectedTitleId));
    await createApprovedArtifact(admin, input.userId, input.workflowId, "topic_evidence", {
      selectedTopic: stringValue(selectedTopic.title ?? selectedTopic.name ?? selectedTopic.topic),
      selected: selectedTopic,
      candidates: input.payload.topics ?? [],
      sourceLimitations: input.payload.sourceLimitations ?? []
    }, recordValue(input.payload.provenance), confidenceValue(input.payload.confidence));
    await createApprovedArtifact(admin, input.userId, input.workflowId, "note_brief", recordValue(input.payload.brief), {
      source: "agent_campaign_confirmed",
      realEvidenceRequired: true
    }, "hypothesis");
    await createApprovedArtifact(admin, input.userId, input.workflowId, "title_matrix", {
      selectedTitle: stringValue(selectedTitle.title ?? selectedTitle.name),
      selected: selectedTitle,
      candidates: input.payload.titles ?? []
    }, { source: "agent_scoring", scoringVersion: 1 }, "inferred");
    await createApprovedArtifact(admin, input.userId, input.workflowId, "visual_plan", recordValue(input.payload.visualPlan), {
      source: "finfold_visual_intelligence"
    }, "inferred");
    await updateWorkflow(admin, input.userId, input.workflowId, {
      stage: "publish",
      current_bottleneck: "execution",
      primary_metric: "cover_click_rate"
    });
    return;
  }

  if (input.actionKind === "confirm_positioning") {
    const strategy = strategyPayloadSchema.parse(input.payload.strategy ?? input.payload);
    const { data: existing } = await admin
      .from("creator_strategy_profiles")
      .select("id, version")
      .eq("user_id", input.userId)
      .eq("platform", "xiaohongshu")
      .maybeSingle();
    const id = existing?.id ?? crypto.randomUUID();
    const version = Number(existing?.version ?? 0) + 1;
    const { error } = await admin.from("creator_strategy_profiles").upsert({
      id,
      user_id: input.userId,
      platform: "xiaohongshu",
      positioning_statement: strategy.positioningStatement,
      audience_labels: strategy.audienceLabels,
      content_pillars: strategy.contentPillars,
      identity_proofs: strategy.identityProofs,
      series_promises: strategy.seriesPromises,
      sustainable_cadence: strategy.sustainableCadence,
      boundaries: strategy.boundaries,
      version,
      updated_at: now
    }, { onConflict: "user_id,platform" });
    if (error) throw error;
    await createApprovedArtifact(admin, input.userId, input.workflowId, "creator_strategy", strategy, {
      source: "agent_confirmed"
    }, "inferred");
    await updateWorkflow(admin, input.userId, input.workflowId, {
      strategy_profile_id: id,
      stage: "topic",
      current_bottleneck: "positioning",
      primary_metric: null
    });
    return;
  }

  if (input.actionKind === "select_topic") {
    const selectedTopic = selectCandidate(input.payload.topics, input.selection);
    await createApprovedArtifact(admin, input.userId, input.workflowId, "topic_evidence", {
      selectedTopic: stringValue(selectedTopic.title ?? selectedTopic.name ?? selectedTopic.topic),
      selected: selectedTopic,
      candidates: input.payload.topics ?? [],
      sourceLimitations: input.payload.sourceLimitations ?? []
    }, recordValue(input.payload.provenance), confidenceValue(input.payload.confidence));
    await updateWorkflow(admin, input.userId, input.workflowId, { stage: "draft", current_bottleneck: "topic" });
    return;
  }

  if (input.actionKind === "confirm_draft") {
    await createApprovedArtifact(admin, input.userId, input.workflowId, "note_brief", recordValue(input.payload.brief ?? input.payload), {
      source: "agent_confirmed",
      realEvidenceRequired: true
    }, "hypothesis");
    await updateWorkflow(admin, input.userId, input.workflowId, { stage: "title", current_bottleneck: "draft" });
    return;
  }

  if (input.actionKind === "select_title") {
    const selected = selectCandidate(input.payload.candidates, input.selection);
    await createApprovedArtifact(admin, input.userId, input.workflowId, "title_matrix", {
      selectedTitle: stringValue(selected.title ?? selected.name),
      selected,
      candidates: input.payload.candidates ?? []
    }, { source: "agent_scoring", scoringVersion: 1 }, "inferred");
    await updateWorkflow(admin, input.userId, input.workflowId, {
      stage: "visual",
      current_bottleneck: "click",
      primary_metric: "cover_click_rate"
    });
    return;
  }

  if (input.actionKind === "confirm_visual") {
    await createApprovedArtifact(admin, input.userId, input.workflowId, "visual_plan", recordValue(input.payload.plan ?? input.payload), {
      source: "finfold_visual_intelligence"
    }, "inferred");
    await updateWorkflow(admin, input.userId, input.workflowId, { stage: "publish" });
    return;
  }

  if (input.actionKind === "link_kit") {
    const kitId = z.string().uuid().parse(input.payload.kitId);
    await linkXhsWorkflowToKit(admin, input.userId, input.workflowId, kitId, stringValue(input.payload.missionId) || undefined);
    return;
  }

  if (input.actionKind === "mark_published") {
    await updateWorkflow(admin, input.userId, input.workflowId, { stage: "review" });
    return;
  }

  if (input.actionKind === "complete_review") {
    await createApprovedArtifact(admin, input.userId, input.workflowId, "analytics_report", recordValue(input.payload.report ?? input.payload), {
      source: "measured_performance",
      sampleDisciplineVersion: 1
    }, "measured");
    await updateWorkflow(admin, input.userId, input.workflowId, {
      stage: "topic",
      current_bottleneck: stringValue(input.payload.bottleneck) || "measurement",
      primary_metric: stringValue(input.payload.primaryMetric) || null
    });
  }
}

async function createApprovedArtifact(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  kind: XhsArtifactKind,
  payload: Record<string, unknown>,
  provenance: Record<string, unknown>,
  confidence: XhsArtifactConfidence
): Promise<XhsWorkflowArtifact> {
  const { data: previous } = await admin
    .from("xhs_workflow_artifacts")
    .select("id, version")
    .eq("workflow_id", workflowId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = Number(previous?.version ?? 0) + 1;
  if (previous?.id) {
    await admin.from("xhs_workflow_artifacts").update({ status: "superseded" }).eq("id", previous.id).eq("user_id", userId);
  }
  const { data, error } = await admin.from("xhs_workflow_artifacts").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    workflow_id: workflowId,
    kind,
    version,
    status: "approved",
    payload,
    provenance,
    confidence
  }).select(ARTIFACT_FIELDS).single();
  if (error || !data) throw error ?? new Error("Unable to save the Agent artifact.");
  return mapArtifact(data as unknown as ArtifactRow);
}

async function updateWorkflow(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from("xhs_workflows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;
}

async function captureXhsAuditSnapshot(admin: AdminClient, userId: string, workflowId: string) {
  const [{ data: workflow }, { data: strategy }, { data: artifacts }] = await Promise.all([
    admin.from("xhs_workflows").select(WORKFLOW_FIELDS).eq("id", workflowId).eq("user_id", userId).maybeSingle(),
    admin.from("creator_strategy_profiles").select(STRATEGY_FIELDS).eq("user_id", userId).eq("platform", "xiaohongshu").maybeSingle(),
    admin
      .from("xhs_workflow_artifacts")
      .select("id, kind, version, status")
      .eq("workflow_id", workflowId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
  ]);
  return { workflow: workflow ?? null, strategy: strategy ?? null, artifacts: artifacts ?? [] };
}

export async function restoreXhsWorkflowAuditSnapshot(
  admin: AdminClient,
  userId: string,
  beforeState: unknown,
  afterState: unknown
): Promise<boolean> {
  const before = recordValue(beforeState);
  const after = recordValue(afterState);
  const afterWorkflow = recordValue(after.workflow);
  const workflowId = z.string().uuid().parse(afterWorkflow.id);
  const current = await captureXhsAuditSnapshot(admin, userId, workflowId);
  if (stableStringify(current) !== stableStringify(afterState)) return false;

  const beforeWorkflow = recordValue(before.workflow);
  const { error: workflowError } = await admin
    .from("xhs_workflows")
    .update({
      status: beforeWorkflow.status,
      stage: beforeWorkflow.stage,
      current_bottleneck: beforeWorkflow.current_bottleneck ?? null,
      primary_metric: beforeWorkflow.primary_metric ?? null,
      strategy_profile_id: beforeWorkflow.strategy_profile_id ?? null,
      growth_mission_id: beforeWorkflow.growth_mission_id ?? null,
      kit_id: beforeWorkflow.kit_id ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", workflowId)
    .eq("user_id", userId);
  if (workflowError) throw workflowError;

  const beforeStrategy = before.strategy;
  if (beforeStrategy && typeof beforeStrategy === "object" && !Array.isArray(beforeStrategy)) {
    const strategy = recordValue(beforeStrategy);
    const { error } = await admin.from("creator_strategy_profiles").upsert({
      id: z.string().uuid().parse(strategy.id),
      user_id: userId,
      platform: "xiaohongshu",
      positioning_statement: strategy.positioning_statement,
      audience_labels: strategy.audience_labels ?? [],
      content_pillars: strategy.content_pillars ?? [],
      identity_proofs: strategy.identity_proofs ?? [],
      series_promises: strategy.series_promises ?? [],
      sustainable_cadence: strategy.sustainable_cadence ?? "",
      boundaries: strategy.boundaries ?? [],
      version: strategy.version ?? 1,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,platform" });
    if (error) throw error;
  } else {
    const { error } = await admin
      .from("creator_strategy_profiles")
      .delete()
      .eq("user_id", userId)
      .eq("platform", "xiaohongshu");
    if (error) throw error;
  }

  const { error: supersedeError } = await admin
    .from("xhs_workflow_artifacts")
    .update({ status: "superseded" })
    .eq("workflow_id", workflowId)
    .eq("user_id", userId);
  if (supersedeError) throw supersedeError;
  for (const item of Array.isArray(before.artifacts) ? before.artifacts : []) {
    const artifact = recordValue(item);
    const { error } = await admin
      .from("xhs_workflow_artifacts")
      .update({ status: artifact.status })
      .eq("id", z.string().uuid().parse(artifact.id))
      .eq("workflow_id", workflowId)
      .eq("user_id", userId);
    if (error) throw error;
  }
  return true;
}

export type XhsWorkbenchHandoff = {
  idea: string;
  workflowId: string | null;
  missionId: string | null;
  artifactVersionIds: string[];
};

/** Rebuilds the durable Workbench draft from approved workflow artifacts.
 * This is also used when an older handoff URL contains only a workflow id. */
export function buildXhsWorkbenchHandoff(
  workflow: XhsWorkflow | null | undefined,
  artifacts: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>> | undefined
): XhsWorkbenchHandoff {
  const topic = stringValue(artifacts?.topic_evidence?.payload.selectedTopic);
  const title = stringValue(artifacts?.title_matrix?.payload.selectedTitle);
  const brief = recordValue(artifacts?.note_brief?.payload);
  const structure = Array.isArray(brief.structure)
    ? brief.structure.map(stringValue).filter(Boolean)
    : [stringValue(brief.structure)].filter(Boolean);
  const approvedDetails = [
    topic ? `选题：${topic}` : "",
    title ? `标题：${title}` : "",
    stringValue(brief.coreMessage) ? `正文主张：${stringValue(brief.coreMessage)}` : "",
    stringValue(brief.opening) ? `开场：${stringValue(brief.opening)}` : "",
    ...structure.map((item) => `结构：${item}`),
    stringValue(brief.cta) ? `行动引导：${stringValue(brief.cta)}` : ""
  ].filter(Boolean);
  const artifactVersionIds = Object.values(artifacts ?? {})
    .map((artifact) => artifact?.id)
    .filter((id): id is string => Boolean(id));
  return {
    idea: approvedDetails.length > 0
      ? `基于以下已确认的小红书方案生成可编辑内容：\n${approvedDetails.join("\n")}`.slice(0, 1800)
      : "",
    workflowId: workflow?.id ?? null,
    missionId: workflow?.growthMissionId ?? null,
    artifactVersionIds
  };
}

function buildXhsWorkbenchHref(
  workflow: XhsWorkflow | null | undefined,
  artifacts: Partial<Record<XhsArtifactKind, XhsWorkflowArtifact>> | undefined
): string {
  const handoff = buildXhsWorkbenchHandoff(workflow, artifacts);
  const params = new URLSearchParams();
  if (handoff.workflowId) params.set("workflowId", handoff.workflowId);
  if (handoff.missionId) params.set("missionId", handoff.missionId);
  if (handoff.idea) params.set("idea", handoff.idea);
  if (handoff.artifactVersionIds.length > 0) params.set("artifactIds", handoff.artifactVersionIds.join(","));
  params.set("platform", "xiaohongshu");
  return `/workbench?${params.toString()}`;
}

function dataLimitation(
  briefing: GrowthBriefing | null,
  locale: "zh" | "en",
  importedSampleSize = 0
): string | null {
  const sampleSize = (briefing?.sampleSize ?? 0) + importedSampleSize;
  if (sampleSize === 0) return locale === "zh" ? "尚无真实表现数据；当前建议属于策略假设。" : "No measured outcomes; current advice is a strategy hypothesis.";
  if (sampleSize < 5) return locale === "zh" ? `目前只有 ${sampleSize} 份结果，不总结长期趋势。` : `Only ${sampleSize} results are available; no long-term trend is claimed.`;
  return null;
}

function mapWorkflow(row: WorkflowRow): XhsWorkflow {
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    currentBottleneck: row.current_bottleneck,
    primaryMetric: row.primary_metric,
    strategyProfileId: row.strategy_profile_id,
    growthMissionId: row.growth_mission_id,
    kitId: row.kit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStrategy(row: StrategyRow): CreatorStrategyProfile {
  return {
    id: row.id,
    positioningStatement: row.positioning_statement,
    audienceLabels: stringArray(row.audience_labels),
    contentPillars: stringArray(row.content_pillars),
    identityProofs: stringArray(row.identity_proofs),
    seriesPromises: stringArray(row.series_promises),
    sustainableCadence: row.sustainable_cadence,
    boundaries: stringArray(row.boundaries),
    version: Number(row.version ?? 1),
    updatedAt: row.updated_at
  };
}

function mapArtifact(row: ArtifactRow): XhsWorkflowArtifact {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    kind: row.kind,
    version: row.version,
    status: row.status,
    payload: recordValue(row.payload),
    provenance: recordValue(row.provenance),
    confidence: row.confidence,
    createdAt: row.created_at
  };
}

function mapPendingAction(row: Record<string, unknown>): XhsPendingAction {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    actionKind: row.action_kind as XhsPendingActionKind,
    payload: recordValue(row.payload),
    status: row.status as XhsPendingAction["status"],
    expiresAt: String(row.expires_at),
    result: row.result ? recordValue(row.result) : null,
    autoReview: row.auto_review ? recordValue(row.auto_review) : null
  };
}

function completionReceiptValue(value: unknown): XhsWorkflowCompletionReceipt | null {
  const receipt = recordValue(value);
  const nextAction = recordValue(receipt.nextAction);
  if (receipt.persistedArtifact !== "analytics_report" || !stringValue(receipt.title) || !stringValue(nextAction.title)) {
    return null;
  }
  return {
    title: stringValue(receipt.title),
    summary: stringValue(receipt.summary),
    evidence: stringValue(receipt.evidence),
    primaryMetric: stringValue(receipt.primaryMetric),
    nextAction: {
      title: stringValue(nextAction.title),
      href: stringValue(nextAction.href),
      prompt: stringValue(nextAction.prompt)
    },
    persistedArtifact: "analytics_report"
  };
}

function selectCandidate(value: unknown, selection: string | number | undefined): Record<string, unknown> {
  const candidates = Array.isArray(value) ? value.map(recordValue) : [];
  if (candidates.length === 0) throw new Error("No candidate is available for this action.");
  if (typeof selection === "number") {
    const candidate = candidates[selection];
    if (!candidate) throw new Error("The selected candidate is no longer available.");
    return candidate;
  }
  if (typeof selection === "string" && selection) {
    const candidate = candidates.find((item) => [item.id, item.title, item.name, item.topic].some((field) => String(field ?? "") === selection));
    if (!candidate) throw new Error("The selected candidate is no longer available.");
    return candidate;
  }
  return candidates[0];
}

function confidenceValue(value: unknown): XhsArtifactConfidence {
  return value === "measured" || value === "inferred" ? value : "hypothesis";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}
