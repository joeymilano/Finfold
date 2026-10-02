import { createHash } from "node:crypto";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { sendRawPrompt } from "@/lib/llm";
import { campaignSlug, generateTrackingCode, sanitizeTrackingDestination } from "@/lib/mission-attribution";
import {
  CHANNEL_CAPABILITIES,
  GROWTH_LOOP_CHANNEL,
  GROWTH_LOOP_MISSION_KIND,
  GROWTH_PLAN_PROMPT_VERSION,
  experimentPlanModelSchema,
  type ExperimentPlanModel,
  type GrowthLoopGoalRow
} from "@/lib/growth-loop/contracts";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const GROWTH_PLAN_MODEL_TIER = "haiku" as const;
export const GROWTH_PLAN_CREDIT_COST = 1;

export class ExperimentPlanError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_model_output"
      | "invalid_plan_reference"
      | "active_mission_exists"
      | "persistence_failed"
  ) {
    super(message);
    this.name = "ExperimentPlanError";
  }
}

export type PlanContextLearning = {
  id: string;
  statement: string;
  applicableConditions: string;
  limitations: string;
};

export type ExperimentPlanResult = {
  plan: ExperimentPlanModel;
  injectedLearnings: PlanContextLearning[];
  contextDigest: {
    hasBrandBrain: boolean;
    brandName: string | null;
    recentMissionCount: number;
    injectedLearningCount: number;
  };
};

/**
 * One model call produces the whole executable plan (spec §5). Everything the
 * model can reference — brand facts, capability, learnings — is injected by
 * deterministic code, and every reference it returns is validated here.
 */
export async function generateExperimentPlan(
  admin: AdminClient,
  userId: string,
  goal: GrowthLoopGoalRow
): Promise<ExperimentPlanResult> {
  const [brandDigest, learnings, recentMissions] = await Promise.all([
    loadBrandDigest(admin, userId),
    loadAcceptedLearnings(admin, userId, goal.id),
    loadRecentLoopMissions(admin, userId, goal.id)
  ]);

  const capability = CHANNEL_CAPABILITIES[GROWTH_LOOP_CHANNEL];
  const prompt = buildPlanPrompt({
    goal,
    brand: brandDigest,
    learnings,
    recentMissionSummaries: recentMissions.map((mission) => ({
      title: mission.title,
      hypothesis: mission.hypothesis,
      outcome: mission.outcome_summary ?? null
    })),
    capability: {
      platform: capability.platform,
      actionTypes: [...capability.actionTypes],
      executionModes: [...capability.executionModes],
      evidenceCeiling: capability.evidenceCeiling
    }
  });

  const raw = await sendRawPrompt(prompt, {
    modelTier: GROWTH_PLAN_MODEL_TIER,
    promptVersion: GROWTH_PLAN_PROMPT_VERSION,
    operation: "growth_experiment_plan",
    allowPersistentAgentFallback: false,
    maxTokens: 1600
  });

  const plan = await parsePlanWithOneRepair(raw, async (repairPrompt) =>
    sendRawPrompt(repairPrompt, {
      modelTier: GROWTH_PLAN_MODEL_TIER,
      promptVersion: GROWTH_PLAN_PROMPT_VERSION,
      operation: "growth_experiment_plan_repair",
      allowPersistentAgentFallback: false,
      maxTokens: 1600
    }));
  validatePlanReferences(plan, learnings);
  return {
    plan,
    injectedLearnings: learnings,
    contextDigest: {
      hasBrandBrain: brandDigest.hasBrandBrain,
      brandName: brandDigest.brandName,
      recentMissionCount: recentMissions.length,
      injectedLearningCount: learnings.length
    }
  };
}

/**
 * Invalid model output gets exactly one repair round (spec §5: no unbounded
 * token burn); a second failure surfaces as a user-recoverable error.
 */
async function parsePlanWithOneRepair(
  raw: string,
  callModel: (prompt: string) => Promise<string>
): Promise<ExperimentPlanModel> {
  const first = tryParsePlan(raw);
  if (first.ok) return first.plan;
  const repairedRaw = await callModel(
    `你上一次的输出不合法。错误：${first.error}\n请重新输出一个符合要求的 JSON 对象，不要输出任何其他文字。`
  );
  const repaired = tryParsePlan(repairedRaw);
  if (repaired.ok) return repaired.plan;
  throw new ExperimentPlanError(
    "The generated experiment plan was invalid twice.",
    "invalid_model_output"
  );
}

function tryParsePlan(raw: string): { ok: true; plan: ExperimentPlanModel } | { ok: false; error: string } {
  const json = extractJsonObject(raw);
  if (!json) return { ok: false, error: "The response is not a JSON object." };
  const parsed = experimentPlanModelSchema.safeParse(json);
  if (parsed.success) return { ok: true, plan: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
      .slice(0, 500)
  };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validatePlanReferences(
  plan: ExperimentPlanModel,
  learnings: PlanContextLearning[]
): void {
  const injectedIds = new Set(learnings.map((learning) => learning.id));
  const unknown = plan.usedLearningIds.filter((id) => !injectedIds.has(id));
  if (unknown.length > 0) {
    throw new ExperimentPlanError(
      "The plan referenced learnings that were not supplied to the model.",
      "invalid_plan_reference"
    );
  }
  const variantKeys = new Set(plan.variants.map((variant) => variant.key));
  for (const action of plan.actions) {
    if (!variantKeys.has(action.variantKey)) {
      throw new ExperimentPlanError(
        "The plan has an action without a matching variant.",
        "invalid_plan_reference"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence: mission + per-variant prepare actions + variant tracking links.
// ---------------------------------------------------------------------------

export type MaterializedExperiment = {
  missionId: string;
  trackingLinks: Array<{ variantKey: string; trackingUrl: string }>;
};

export async function materializeExperiment(
  admin: AdminClient,
  userId: string,
  goal: GrowthLoopGoalRow,
  result: ExperimentPlanResult,
  options: { appUrl: string }
): Promise<MaterializedExperiment> {
  const now = new Date().toISOString();
  const activeMission = await admin
    .from("growth_missions")
    .select("id")
    .eq("goal_id", goal.id)
    .eq("user_id", userId)
    .eq("mission_kind", GROWTH_LOOP_MISSION_KIND)
    .in("status", ["accepted", "draft_ready", "posted"])
    .maybeSingle();
  if (activeMission.data) {
    throw new ExperimentPlanError(
      "This goal already has an active experiment.",
      "active_mission_exists"
    );
  }

  const previousCount = await admin
    .from("growth_missions")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goal.id)
    .eq("user_id", userId)
    .eq("mission_kind", GROWTH_LOOP_MISSION_KIND);
  const planVersion = (previousCount.count ?? 0) + 1;

  const missionPlan = {
    planVersion,
    hypothesis: result.plan.hypothesis,
    primaryVariable: result.plan.primaryVariable,
    designType: result.plan.designType,
    variants: result.plan.variants.map((variant) => ({
      key: variant.key,
      angle: variant.angle,
      workbenchIdea: variant.workbenchIdea
    })),
    usedLearningIds: result.plan.usedLearningIds,
    missingInputs: result.plan.missingInputs,
    contextDigest: result.contextDigest,
    generatedAt: now
  };

  const { data: mission, error: missionError } = await admin
    .from("growth_missions")
    .insert({
      user_id: userId,
      goal_id: goal.id,
      mission_kind: GROWTH_LOOP_MISSION_KIND,
      objective_type: "signups",
      platform: GROWTH_LOOP_CHANNEL,
      status: "accepted",
      stage: "conversion",
      title: goal.title,
      hypothesis: result.plan.hypothesis,
      primary_metric: "有效激活用户",
      primary_metric_key: "signups",
      baseline_value: 0,
      target_value: goal.target_value,
      variants: missionPlan.variants,
      workbench_idea: result.plan.variants[0].workbenchIdea,
      plan: missionPlan,
      design_type: "exploratory",
      execution_state: "awaiting_decision",
      tracking_enabled: true
    })
    .select("id")
    .single();
  if (missionError || !mission) {
    throw new ExperimentPlanError(
      missionError?.message ?? "Mission insert returned no row.",
      "persistence_failed"
    );
  }

  const variantActions = result.plan.variants.map((variant) => ({
    mission_id: mission.id,
    user_id: userId,
    kind: "prepare_execution_draft",
    status: "awaiting_approval",
    risk_level: "low",
    requires_approval: true,
    input: {
      variantKey: variant.key,
      angle: variant.angle,
      workbenchIdea: variant.workbenchIdea
    },
    provider: "finfold_studio",
    idempotency_key: `growth-loop-prepare:${mission.id}:${variant.key}`
  }));
  const { error: actionError } = await admin.from("mission_actions").insert(variantActions);
  if (actionError) {
    throw new ExperimentPlanError(actionError.message, "persistence_failed");
  }

  const destinationUrl = sanitizeTrackingDestination(goal.landing_url);
  const campaign = campaignSlug(goal.title);
  const trackingLinks: MaterializedExperiment["trackingLinks"] = [];
  for (const variant of result.plan.variants) {
    const code = generateTrackingCode();
    const { error: linkError } = await admin.rpc("upsert_mission_tracking_link", {
      p_user_id: userId,
      p_mission_id: mission.id,
      p_code: code,
      p_destination_url: destinationUrl,
      p_source: GROWTH_LOOP_CHANNEL,
      p_medium: "organic_social",
      p_campaign: campaign,
      p_content: variant.key,
      p_variant_key: variant.key
    });
    if (linkError) {
      throw new ExperimentPlanError(linkError.message, "persistence_failed");
    }
    trackingLinks.push({
      variantKey: variant.key,
      trackingUrl: `${options.appUrl.replace(/\/$/, "")}/go/${code}`
    });
  }

  return { missionId: mission.id, trackingLinks };
}

// ---------------------------------------------------------------------------
// Context loaders.
// ---------------------------------------------------------------------------

async function loadBrandDigest(
  admin: AdminClient,
  userId: string
): Promise<{ hasBrandBrain: boolean; brandName: string | null; digest: string }> {
  const { data } = await admin
    .from("brand_brains")
    .select("brand_name, product_description, target_audience, positioning_statement, tone_keywords")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return {
      hasBrandBrain: false,
      brandName: null,
      digest: "（品牌资料尚未填写）"
    };
  }
  const parts = [
    data.brand_name ? `品牌：${data.brand_name}` : null,
    data.product_description ? `产品：${String(data.product_description).slice(0, 400)}` : null,
    data.target_audience ? `受众：${String(data.target_audience).slice(0, 300)}` : null,
    data.positioning_statement ? `定位：${String(data.positioning_statement).slice(0, 300)}` : null,
    Array.isArray(data.tone_keywords) && data.tone_keywords.length > 0
      ? `语气关键词：${data.tone_keywords.slice(0, 10).join("、")}`
      : null
  ].filter((part): part is string => part !== null);
  return {
    hasBrandBrain: parts.length > 0,
    brandName: data.brand_name ?? null,
    digest: parts.length > 0 ? parts.join("\n") : "（品牌资料尚未填写）"
  };
}

async function loadAcceptedLearnings(
  admin: AdminClient,
  userId: string,
  goalId: string
): Promise<PlanContextLearning[]> {
  const { data } = await admin
    .from("growth_learnings")
    .select("id, statement, applicable_conditions, limitations")
    .eq("user_id", userId)
    .eq("status", "accepted")
    .or(`goal_id.is.null,goal_id.eq.${goalId}`)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((row) => ({
    id: row.id,
    statement: row.statement,
    applicableConditions: row.applicable_conditions ?? "",
    limitations: row.limitations ?? ""
  }));
}

async function loadRecentLoopMissions(
  admin: AdminClient,
  userId: string,
  goalId: string
): Promise<Array<{
  title: string;
  hypothesis: string;
  outcome_summary: string | null;
}>> {
  const { data } = await admin
    .from("growth_missions")
    .select("title, hypothesis, outcome")
    .eq("goal_id", goalId)
    .eq("user_id", userId)
    .eq("mission_kind", GROWTH_LOOP_MISSION_KIND)
    .order("created_at", { ascending: false })
    .limit(2);
  return (data ?? []).map((row) => ({
    title: row.title,
    hypothesis: row.hypothesis,
    outcome_summary: row.outcome?.explanation ?? null
  }));
}

function buildPlanPrompt(input: {
  goal: GrowthLoopGoalRow;
  brand: { digest: string };
  learnings: PlanContextLearning[];
  recentMissionSummaries: Array<{ title: string; hypothesis: string; outcome: string | null }>;
  capability: { platform: string; actionTypes: string[]; executionModes: string[]; evidenceCeiling: string };
}): string {
  const learningBlock = input.learnings.length > 0
    ? input.learnings
        .map((learning, index) => `${index + 1}. [learning_id=${learning.id}] ${learning.statement}（适用条件：${learning.applicableConditions || "未注明"}；局限：${learning.limitations || "未注明"}）`)
        .join("\n")
    : "（暂无已采纳经验）";
  const recentBlock = input.recentMissionSummaries.length > 0
    ? input.recentMissionSummaries
        .map((mission) => `- ${mission.title}｜假设：${mission.hypothesis}｜复盘：${mission.outcome ?? "尚未复盘"}`)
        .join("\n")
    : "（这是该目标的第一个实验）";

  return `你是一个增长实验策划助手。请基于以下真实信息，为下一个内容获客实验提出计划。

【增长目标】
${input.goal.title}
目标指标：有效激活用户（新用户完成注册，并首次把生成内容保存到内容库）
目标值：${input.goal.target_value} 人；截止：${input.goal.end_at}
渠道：${input.capability.platform}（唯一渠道）

【品牌事实】
${input.brand.digest}

【渠道真实能力（必须遵守，不得虚构其他能力）】
可执行动作：${input.capability.actionTypes.join("、")}
执行方式：${input.capability.executionModes.join("、")}（没有自动发布 API）
证据上限：${input.capability.evidenceCeiling}（用户贴链接）
无平台曝光数据权限，CTR 不可计算。

【已采纳经验（仅可引用这些 learning_id）】
${learningBlock}

【该目标最近的实验与结果】
${recentBlock}

【要求】
1. 输出一个 JSON 对象，不要输出任何其他文字。
2. hypothesis：一句可检验的假设，说明为什么这个内容角度可能带来激活。
3. 只改变一个主要变量（primaryVariable），通常是两个变体的信息角度。
4. variants：恰好两个，key 为 "A" 和 "B"，各给出 angle（角度名）和 workbenchIdea（可直接用于创作台的中文选题描述，包含内容要点与行动引导）。
5. usedLearningIds：只允许填入上面列出的 learning_id，没有就空数组。不得引用未列出的经验。
6. missingInputs：如果品牌资料或落地页信息不足以做出可靠计划，列出缺什么。
7. 不得虚构客户案例、平台能力或数据。

【输出 JSON 结构】
{
  "hypothesis": "…",
  "primaryVariable": "…",
  "designType": "exploratory",
  "variants": [{"key":"A","angle":"…","workbenchIdea":"…"},{"key":"B","angle":"…","workbenchIdea":"…"}],
  "actions": [{"variantKey":"A","type":"publish_post","channelRef":"selected_channel"},{"variantKey":"B","type":"publish_post","channelRef":"selected_channel"}],
  "missingInputs": [],
  "usedLearningIds": []
}`;
}

export function planOperationKey(goalId: string, planVersion: number): string {
  return `growth-plan:${goalId}:${planVersion}`;
}

export function hashPlanInput(goal: GrowthLoopGoalRow, contextDigest: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ goalId: goal.id, digest: contextDigest }))
    .digest("hex");
}
