import { createHash } from "node:crypto";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { sendRawPrompt } from "@/lib/llm";
import {
  ATTRIBUTION_RULE_VERSION,
  GROWTH_REVIEW_PROMPT_VERSION,
  METRIC_DEFINITION_VERSION,
  reviewNarrativeModelSchema,
  type MissionPlanSnapshot,
  type ReviewConclusion,
  type ReviewNarrativeModel
} from "@/lib/growth-loop/contracts";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const GROWTH_REVIEW_MODEL_TIER = "haiku" as const;
export const GROWTH_REVIEW_CREDIT_COST = 1;
const MAX_REVIEW_HISTORY = 10;
const MAX_CANDIDATE_LEARNINGS_PER_MISSION = 3;

export class MissionReviewError extends Error {
  constructor(
    message: string,
    readonly code: "mission_not_found" | "not_measuring" | "model_output_invalid" | "persistence_failed"
  ) {
    super(message);
    this.name = "MissionReviewError";
  }
}

export type ReviewSnapshot = {
  asOf: string;
  attributionRuleVersion: string;
  metricDefinitionVersion: string;
  observation: {
    startedAt: string | null;
    dueAt: string | null;
    windowDays: number | null;
  };
  variants: Array<{
    key: string;
    distinctClickVisitors: number;
    attributedSignups: number;
    activations: number;
  }>;
  totals: {
    distinctClickVisitors: number;
    attributedSignups: number;
    activations: number;
    sitewideSignupsInWindow: number | null;
    unattributedSignups: number | null;
  };
  cost: {
    knownCredits: number;
    scopeNote: string;
  };
  ratios: {
    clickToSignup: number | null;
    signupToActivation: number | null;
    costPerActivationCredits: number | null;
  };
  limitations: string[];
};

type OutcomeEventRow = {
  event_type: string;
  source: string;
  tracking_link_id: string | null;
  visitor_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

type MissionRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  status: string;
  execution_state: string;
  measurement_started_at: string | null;
  measurement_due_at: string | null;
  measurement_window_days: number | null;
  plan: MissionPlanSnapshot | null;
  variants: Array<{ key: string }> | null;
};

/**
 * Deterministic review snapshot (spec §8): every number is computed here from
 * frozen data; the model never computes, fills, or rounds anything. Test
 * events (metadata.isTest = true) are excluded from real counts.
 */
export async function computeMissionReviewSnapshot(
  admin: AdminClient,
  userId: string,
  missionId: string,
  asOf: Date = new Date()
): Promise<{ mission: MissionRow; snapshot: ReviewSnapshot }> {
  const { data: missionData, error: missionError } = await admin
    .from("growth_missions")
    .select(
      "id, user_id, goal_id, status, execution_state, measurement_started_at, measurement_due_at, measurement_window_days, plan, variants"
    )
    .eq("id", missionId)
    .eq("user_id", userId)
    .eq("mission_kind", "growth_loop")
    .maybeSingle();
  if (missionError) throw missionError;
  if (!missionData) throw new MissionReviewError("Growth loop mission not found.", "mission_not_found");
  const mission = missionData as MissionRow;

  const { data: links } = await admin
    .from("tracking_links")
    .select("id, variant_key")
    .eq("mission_id", missionId)
    .eq("user_id", userId);
  const linkVariantByKey = new Map<string, string>();
  const variantKeyByLinkId = new Map<string, string>();
  for (const link of links ?? []) {
    linkVariantByKey.set(link.variant_key, link.id);
    variantKeyByLinkId.set(link.id, link.variant_key);
  }

  const { data: events, error: eventsError } = await admin
    .from("outcome_events")
    .select("event_type, source, tracking_link_id, visitor_id, occurred_at, metadata")
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .lte("occurred_at", asOf.toISOString())
    .or("metadata->>isTest.is.null,metadata->>isTest.neq.true");
  if (eventsError) throw eventsError;
  const realEvents = (events ?? []) as OutcomeEventRow[];

  const variantKeys = new Set<string>(
    (mission.variants ?? []).map((variant) => variant.key).filter((key) => typeof key === "string")
  );
  if (variantKeyByKeyFallback(variantKeys, linkVariantByKey).size === 0 && variantKeys.size === 0) {
    variantKeys.add("A");
    variantKeys.add("B");
  }

  const perVariant = new Map<string, { visitors: Set<string>; signups: number; activations: number }>();
  const ensureVariant = (key: string) => {
    if (!perVariant.has(key)) perVariant.set(key, { visitors: new Set(), signups: 0, activations: 0 });
    return perVariant.get(key)!;
  };
  const allVisitors = new Set<string>();
  let totalSignups = 0;
  let totalActivations = 0;

  for (const event of realEvents) {
    const variantKey = event.tracking_link_id
      ? variantKeyByLinkId.get(event.tracking_link_id) ?? ""
      : "";
    if (event.event_type === "click") {
      const visitor = event.visitor_id ?? "unknown";
      allVisitors.add(visitor);
      if (variantKey) ensureVariant(variantKey).visitors.add(visitor);
      continue;
    }
    if (event.event_type === "signup" && event.source === "finfold-native-signup") {
      totalSignups += 1;
      if (variantKey) ensureVariant(variantKey).signups += 1;
      continue;
    }
    if (event.event_type === "activation" && event.source === "finfold-first-save") {
      totalActivations += 1;
      if (variantKey) ensureVariant(variantKey).activations += 1;
    }
  }

  let sitewideSignupsInWindow: number | null = null;
  if (mission.measurement_started_at) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", mission.measurement_started_at)
      .lte("created_at", asOf.toISOString());
    sitewideSignupsInWindow = count ?? 0;
  }

  const knownCredits = await sumKnownLoopCredits(admin, userId, mission);

  const distinctClickVisitors = allVisitors.size;
  const clickToSignup = distinctClickVisitors > 0 ? totalSignups / distinctClickVisitors : null;
  const signupToActivation = totalSignups > 0 ? totalActivations / totalSignups : null;
  const costPerActivationCredits = totalActivations > 0 ? knownCredits / totalActivations : null;

  const limitations = [
    "非随机曝光的探索性比较，不能证明增量因果",
    "无平台曝光权限，CTR 不可计算",
    "跨设备、链接被摘除或浏览器拦截 cookie 的访问无法归因"
  ];
  if (sitewideSignupsInWindow === null) {
    limitations.push("测量窗口尚未开始，全站注册量不可用");
  }

  const snapshot: ReviewSnapshot = {
    asOf: asOf.toISOString(),
    attributionRuleVersion: ATTRIBUTION_RULE_VERSION,
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    observation: {
      startedAt: mission.measurement_started_at,
      dueAt: mission.measurement_due_at,
      windowDays: mission.measurement_window_days
    },
    variants: [...variantKeys].sort().map((key) => {
      const bucket = ensureVariant(key);
      return {
        key,
        distinctClickVisitors: bucket.visitors.size,
        attributedSignups: bucket.signups,
        activations: bucket.activations
      };
    }),
    totals: {
      distinctClickVisitors,
      attributedSignups: totalSignups,
      activations: totalActivations,
      sitewideSignupsInWindow,
      unattributedSignups:
        sitewideSignupsInWindow === null ? null : Math.max(0, sitewideSignupsInWindow - totalSignups)
    },
    cost: {
      knownCredits,
      scopeNote: "仅包含本闭环记录的模型积分消耗，不含人工时间与平台成本"
    },
    ratios: { clickToSignup, signupToActivation, costPerActivationCredits },
    limitations
  };
  return { mission, snapshot };
}

function variantKeyByKeyFallback(
  missionVariantKeys: Set<string>,
  linkMap: Map<string, string>
): Set<string> {
  const keys = new Set(missionVariantKeys);
  for (const key of linkMap.keys()) keys.add(key);
  return keys;
}

async function sumKnownLoopCredits(
  admin: AdminClient,
  userId: string,
  mission: MissionRow
): Promise<number> {
  if (!mission.goal_id) return 0;
  const { data } = await admin
    .from("ai_usage_operations")
    .select("cost, status")
    .eq("user_id", userId)
    .eq("source", "growth_loop")
    .eq("detail->>goalId", mission.goal_id)
    .in("status", ["started", "settled"]);
  return (data ?? []).reduce((sum, row) => sum + (row.cost ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Model narrative: explanation only, numbers stay server-computed.
// ---------------------------------------------------------------------------

export type MissionReviewResult = {
  missionId: string;
  reviewVersion: number;
  conclusion: ReviewConclusion;
  narrative: string;
  learningCandidateId: string | null;
  snapshot: ReviewSnapshot;
};

export async function runMissionReview(
  admin: AdminClient,
  userId: string,
  missionId: string
): Promise<MissionReviewResult> {
  const { mission, snapshot } = await computeMissionReviewSnapshot(admin, userId, missionId);
  if (!["posted", "completed"].includes(mission.status) || !["measuring", "review_due", "completed"].includes(mission.execution_state)) {
    throw new MissionReviewError(
      "This mission is not in its measurement phase yet.",
      "not_measuring"
    );
  }

  const prompt = buildReviewPrompt(snapshot);
  const callModel = () =>
    sendRawPrompt(prompt, {
      modelTier: GROWTH_REVIEW_MODEL_TIER,
      promptVersion: GROWTH_REVIEW_PROMPT_VERSION,
      operation: "growth_mission_review",
      allowPersistentAgentFallback: false,
      maxTokens: 900
    });
  const raw = await callModel();
  let parsed = tryParseNarrative(raw);
  if (!parsed) {
    const repairedRaw = await sendRawPrompt(
      "你上一次的输出不合法或不是纯 JSON 对象。请重新输出一个符合要求的 JSON 对象，不要输出任何其他文字。",
      {
        modelTier: GROWTH_REVIEW_MODEL_TIER,
        promptVersion: GROWTH_REVIEW_PROMPT_VERSION,
        operation: "growth_mission_review_repair",
        allowPersistentAgentFallback: false,
        maxTokens: 900
      }
    );
    parsed = tryParseNarrative(repairedRaw);
  }
  if (!parsed) {
    throw new MissionReviewError(
      "The review explanation was invalid twice.",
      "model_output_invalid"
    );
  }
  const narrative = sanitizeNarrative(parsed.narrative, snapshot);

  const history = mission.plan?.reviewHistory ?? [];
  const reviewVersion = history.length + 1;
  const updatedHistory = [
    ...history.slice(-(MAX_REVIEW_HISTORY - 1)),
    {
      reviewVersion,
      asOf: snapshot.asOf,
      conclusion: parsed.conclusion,
      narrative,
      snapshotDigest: digestSnapshot(snapshot),
      generatedAt: new Date().toISOString()
    }
  ];

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("growth_missions")
    .update({
      plan: { ...(mission.plan ?? {}), reviewHistory: updatedHistory },
      updated_at: now
    })
    .eq("id", missionId)
    .eq("user_id", userId);
  if (updateError) throw new MissionReviewError(updateError.message, "persistence_failed");

  let learningCandidateId: string | null = null;
  const { count: candidateCount } = await admin
    .from("growth_learnings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mission_id", missionId)
    .in("status", ["candidate", "accepted"]);
  if ((candidateCount ?? 0) < MAX_CANDIDATE_LEARNINGS_PER_MISSION) {
    const { data: learning, error: learningError } = await admin
      .from("growth_learnings")
      .insert({
        user_id: userId,
        goal_id: mission.goal_id,
        mission_id: missionId,
        statement: parsed.suggestedLearning.statement,
        applicable_conditions: parsed.suggestedLearning.applicableConditions,
        limitations: parsed.suggestedLearning.limitations,
        evidence: {
          asOf: snapshot.asOf,
          attributionRuleVersion: ATTRIBUTION_RULE_VERSION,
          reviewVersion,
          counts: {
            variants: snapshot.variants,
            totals: snapshot.totals
          }
        },
        status: "candidate"
      })
      .select("id")
      .single();
    if (learningError) throw new MissionReviewError(learningError.message, "persistence_failed");
    learningCandidateId = learning?.id ?? null;
  }

  return {
    missionId,
    reviewVersion,
    conclusion: parsed.conclusion,
    narrative,
    learningCandidateId,
    snapshot
  };
}

function tryParseNarrative(raw: string): ReviewNarrativeModel | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return reviewNarrativeModelSchema.parse(JSON.parse(trimmed.slice(start, end + 1)));
  } catch {
    return null;
  }
}

/**
 * Percentage claims are stripped deterministically: the model explains, it
 * never quantifies. If the narrative is unusable, a factual fallback keeps the
 * review honest instead of failing the whole operation.
 */
function sanitizeNarrative(narrative: string, snapshot: ReviewSnapshot): string {
  if (!/\d+(\.\d+)?\s*%/.test(narrative)) return narrative;
  return [
    "（模型叙述包含未经计算的百分比，已替换为事实摘要。）",
    `截至 ${snapshot.asOf}，可归因注册 ${snapshot.totals.attributedSignups} 人，有效激活 ${snapshot.totals.activations} 人。`,
    "以上数字由服务端按冻结口径计算。"
  ].join("");
}

function digestSnapshot(snapshot: ReviewSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 16);
}

function buildReviewPrompt(snapshot: ReviewSnapshot): string {
  const variantLines = snapshot.variants
    .map(
      (variant) =>
        `- 变体 ${variant.key}：独立点击访客 ${variant.distinctClickVisitors}，可归因注册 ${variant.attributedSignups}，有效激活 ${variant.activations}`
    )
    .join("\n");
  const ratioLines = [
    `点击→注册转化率：${formatRatio(snapshot.ratios.clickToSignup)}`,
    `注册→激活转化率：${formatRatio(snapshot.ratios.signupToActivation)}`,
    `每有效激活已知积分成本：${snapshot.ratios.costPerActivationCredits === null ? "不可计算（激活为 0 或成本缺失）" : `${snapshot.ratios.costPerActivationCredits.toFixed(2)} 积分（${snapshot.cost.scopeNote}）`}`,
    `全站注册（窗口内）：${snapshot.totals.sitewideSignupsInWindow ?? "窗口未开始，不可用"}`,
    `无法归因注册：${snapshot.totals.unattributedSignups ?? "不可用"}`
  ].join("\n");
  const limitationLines = snapshot.limitations.map((item) => `- ${item}`).join("\n");

  return `你是一个增长复盘助手。以下数字全部由服务端按冻结口径计算，你不得计算新数字、不得给出百分比、不得填充缺失指标。你的职责是解释与建议。

【实验数据（截至 ${snapshot.asOf}）】
${variantLines}
${ratioLines}
观察窗口：${snapshot.observation.windowDays ?? "未设置"} 天（起 ${snapshot.observation.startedAt ?? "未开始"}，止 ${snapshot.observation.dueAt ?? "未定"}）

【必须如实承认的局限】
${limitationLines}

【要求】
1. 输出一个 JSON 对象，不要输出任何其他文字。
2. conclusion 从这些里选一个："insufficient_data"（数据不足）、"continue_observing"（继续观察）、"revise_hypothesis"（修改假设）、"repeat_test"（重复检验）、"stop"（停止）。
3. narrative：中文解释，120-300 字，不得出现任何百分比或自己算出的数字，不得声称证明了因果。
4. suggestedLearning：一条可撤销的经验候选，statement 说明"在什么条件下、哪个变体方向更值得继续检验"，不要推广为通用结论。

【输出 JSON 结构】
{"conclusion":"…","narrative":"…","suggestedLearning":{"statement":"…","applicableConditions":"…","limitations":"…"}}`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "不可计算（分母为 0 或缺失）";
  return `${(value * 100).toFixed(1)}%`;
}

export function reviewOperationKey(missionId: string, reviewVersion: number): string {
  return `growth-review:${missionId}:${reviewVersion}`;
}
