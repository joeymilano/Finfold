import { z } from "zod";
import { goalIdSchema, personaIdSchema, platformIdSchema } from "@/lib/content-schema";
import { getGoal, type GoalId } from "@/lib/goals";
import { getPersona } from "@/lib/personas";
import { getLocalizedPlatformLabel, getPlatform, type PlatformId } from "@/lib/platforms";
import { sendRawPrompt } from "@/lib/llm";

export const campaignDurationSchema = z.union([z.literal(7), z.literal(14), z.literal(30)]);

export const campaignRequestSchema = z.object({
  ideaText: z.string().min(20),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema).min(1).max(11),
  durationDays: campaignDurationSchema,
  language: z.enum(["zh", "en"]).default("zh")
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;

export type CampaignDay = {
  day: number;
  phase: string;
  theme: string;
  angle: string;
  primaryPlatform: PlatformId;
  supportingPlatforms: PlatformId[];
  deliverable: string;
  cta: string;
  checklist: string[];
  /** LLM 产出的"为什么这天用这平台/phase"策略依据（P2-2）。纯模板计划无此字段；
   * explainCampaignPlan 失败时保持为空，卡片照常降级展示。 */
  rationale?: string;
};

export type CampaignPlan = {
  id: string;
  language?: "zh" | "en";
  title: string;
  strategy: string;
  durationDays: 7 | 14 | 30;
  days: CampaignDay[];
  createdAt: string;
};

export type LocalizedCampaignPlans = {
  localizedPlans: Partial<Record<"zh" | "en", CampaignPlan>>;
};

const hanCharacters = /[\u3400-\u9fff\uf900-\ufaff]/;

function containsHan(value: string): boolean {
  return hanCharacters.test(value);
}

function isCampaignPlan(value: unknown): value is CampaignPlan {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CampaignPlan>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.strategy === "string" &&
    Array.isArray(candidate.days)
  );
}

function inferCampaignLanguage(plan: CampaignPlan): "zh" | "en" {
  if (plan.language === "zh" || plan.language === "en") return plan.language;
  const visibleCopy = [plan.title, plan.strategy, ...plan.days.flatMap((day) => [day.phase, day.theme, day.angle, day.cta, day.rationale ?? ""])].join(" ");
  return containsHan(visibleCopy) ? "zh" : "en";
}

function planMatchesLanguage(plan: CampaignPlan, language: "zh" | "en"): boolean {
  if (inferCampaignLanguage(plan) !== language) return false;
  if (language === "zh") return true;
  const visibleCopy = [plan.title, plan.strategy, ...plan.days.flatMap((day) => [day.phase, day.theme, day.angle, day.cta, day.rationale ?? ""])].join(" ");
  return !containsHan(visibleCopy);
}

export function getLocalizedCampaignPlan(stored: unknown, language: "zh" | "en"): CampaignPlan | null {
  if (isCampaignPlan(stored)) {
    return planMatchesLanguage(stored, language) ? stored : null;
  }
  if (!stored || typeof stored !== "object") return null;
  const localizedPlans = (stored as Partial<LocalizedCampaignPlans>).localizedPlans;
  if (!localizedPlans || typeof localizedPlans !== "object") return null;
  const plan = localizedPlans[language];
  return isCampaignPlan(plan) && planMatchesLanguage(plan, language) ? plan : null;
}

export function mergeLocalizedCampaignPlan(
  stored: unknown,
  language: "zh" | "en",
  plan: CampaignPlan
): LocalizedCampaignPlans {
  const localizedPlans: Partial<Record<"zh" | "en", CampaignPlan>> = {};
  if (isCampaignPlan(stored)) {
    localizedPlans[inferCampaignLanguage(stored)] = stored;
  } else if (stored && typeof stored === "object") {
    const existing = (stored as Partial<LocalizedCampaignPlans>).localizedPlans;
    if (existing && typeof existing === "object") {
      if (isCampaignPlan(existing.zh)) localizedPlans.zh = existing.zh;
      if (isCampaignPlan(existing.en)) localizedPlans.en = existing.en;
    }
  }
  localizedPlans[language] = plan;
  return { localizedPlans };
}

const phaseTemplates = {
  "product-launch": {
    zh: ["预热", "问题教育", "产品故事", "Launch 日", "反馈收集", "信任补强", "复盘转化"],
    en: ["Pre-launch", "Problem Education", "Product Story", "Launch Day", "Feedback Capture", "Trust Building", "Conversion Review"]
  },
  "lead-gen": {
    zh: ["痛点识别", "方法教育", "案例证明", "异议处理", "线索转化", "跟进提醒", "复盘优化"],
    en: ["Pain Discovery", "Method Education", "Proof", "Objection Handling", "Lead Capture", "Follow-up", "Optimization"]
  },
  "audience-growth": {
    zh: ["观点破题", "经验分享", "清单收藏", "互动讨论", "创始人故事", "社区扩散", "复盘沉淀"],
    en: ["Point of View", "Lessons", "Save-worthy List", "Discussion", "Founder Story", "Community Spread", "Reflection"]
  },
  "event-promo": {
    zh: ["议题预热", "价值说明", "嘉宾/亮点", "报名推动", "临近提醒", "现场互动", "会后跟进"],
    en: ["Topic Teaser", "Value Pitch", "Highlights", "Registration Push", "Reminder", "Live Engagement", "Post-event Follow-up"]
  }
} as const;

export function buildCampaignPlan(input: CampaignRequest): CampaignPlan {
  const parsed = campaignRequestSchema.parse(input);
  const goal = getGoal(parsed.goal);
  const persona = getPersona(parsed.persona);
  const isEn = parsed.language === "en";
  const summarizedIdea = summarizeIdea(parsed.ideaText);
  const idea = isEn && containsHan(summarizedIdea)
    ? `${goal.labelEn} for ${persona.labelEn}`
    : summarizedIdea;
  const phases = phaseTemplates[parsed.goal][parsed.language];

  const days: CampaignDay[] = Array.from({ length: parsed.durationDays }, (_, index) => {
    const platform = parsed.platforms[index % parsed.platforms.length] as PlatformId;
    const supportingPlatforms = parsed.platforms.filter((item) => item !== platform).slice(0, 2);
    const phase = phases[index % phases.length];
    const cadence = Math.floor(index / phases.length) + 1;

    return {
      day: index + 1,
      phase,
      theme: isEn
        ? `${phase}: ${idea}`
        : `${phase}：${idea}`,
      angle: createAngle({
        isEn,
        phase,
        goalLabel: isEn ? goal.labelEn : goal.label,
        personaLabel: isEn ? persona.labelEn : persona.label,
        platform: getLocalizedPlatformLabel(platform, parsed.language, true),
        cadence
      }),
      primaryPlatform: platform,
      supportingPlatforms,
      deliverable: createDeliverable(isEn, getLocalizedPlatformLabel(platform, parsed.language, true), phase),
      cta: createCampaignCta(parsed.goal, isEn),
      checklist: createChecklist(isEn, getLocalizedPlatformLabel(platform, parsed.language, true))
    };
  });

  return {
    id: crypto.randomUUID(),
    language: parsed.language,
    title: isEn
      ? `${parsed.durationDays}-day ${goal.labelEn} campaign`
      : `${parsed.durationDays} 天${goal.label}内容战役`,
    strategy: isEn
      ? `A ${parsed.durationDays}-day ${goal.labelEn.toLowerCase()} campaign for ${persona.labelEn}, rotating ${parsed.platforms.length} platform-native angles from awareness to conversion.`
      : `面向${persona.label}的 ${parsed.durationDays} 天${goal.label}战役，按平台轮换选题，从认知、信任到转化逐步推进。`,
    durationDays: parsed.durationDays,
    days,
    createdAt: new Date().toISOString()
  };
}

function summarizeIdea(ideaText: string): string {
  const normalized = ideaText.replace(/\s+/g, " ").trim();
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function createAngle({
  isEn,
  phase,
  goalLabel,
  personaLabel,
  platform,
  cadence
}: {
  isEn: boolean;
  phase: string;
  goalLabel: string;
  personaLabel: string;
  platform: string;
  cadence: number;
}) {
  if (isEn) {
    return `Wave ${cadence}: use ${platform} to turn ${phase.toLowerCase()} into a ${personaLabel} story that supports ${goalLabel}.`;
  }

  return `第 ${cadence} 轮：用 ${platform} 把「${phase}」包装成${personaLabel}能理解并愿意行动的内容。`;
}

function createDeliverable(isEn: boolean, platform: string, phase: string) {
  return isEn
    ? `${platform} native post + one reusable hook for ${phase.toLowerCase()}`
    : `${platform} 原生内容 + 1 条可复用 ${phase} hook`;
}

function createCampaignCta(goal: GoalId, isEn: boolean) {
  const ctas: Record<GoalId, { zh: string; en: string }> = {
    "lead-gen": { zh: "引导预约、私信或加入 waitlist", en: "Drive booking, DM, or waitlist signup" },
    "audience-growth": { zh: "引导关注、收藏、评论一个真实问题", en: "Ask for follows, saves, and one specific reply" },
    "product-launch": { zh: "引导访问发布页、试用或反馈", en: "Send readers to launch page, trial, or feedback" },
    "event-promo": { zh: "引导报名、转发给同伴或设置提醒", en: "Drive registration, sharing, or reminder setup" }
  };
  return isEn ? ctas[goal].en : ctas[goal].zh;
}

function createChecklist(isEn: boolean, platform: string) {
  return isEn
    ? [`Adapt tone for ${platform}`, "Check first-line hook", "Remove hard-sell language", "Add one measurable next step"]
    : [`确认 ${platform} 语气`, "检查首句 hook", "去掉硬广表达", "保留一个可衡量行动"];
}

/**
 * P2-2：给纯模板计划补 LLM 策略依据。buildCampaignPlan 的 angle 是固定句式，
 * 没有"为什么这天用这平台/phase"的真实理由。这里用一次 LLM 调用给每天补一句
 * rationale（≤30字），让值班卡从机械排期升级成"有策略的本周建议"。
 *
 * 失败时静默返回原计划（rationale 为空）——绝不阻塞值班卡的展示。
 */
export async function explainCampaignPlan(
  plan: CampaignPlan,
  ideaText: string,
  language: "zh" | "en",
  options?: { invoke?: (prompt: string) => Promise<string> }
): Promise<CampaignPlan> {
  const isEn = language === "en";
  const daysBrief = plan.days
    .map((d) => `D${d.day}: phase=${d.phase}, platform=${getPlatform(d.primaryPlatform).shortLabel}, theme=${d.theme}`)
    .join("\n");

  const prompt = isEn
    ? `You are a content strategist. Here is a ${plan.durationDays}-day content plan.
Idea: ${ideaText.slice(0, 200)}

Days:
${daysBrief}

For EACH day, write ONE concise sentence (≤25 words) explaining the strategic WHY — why this phase on this day, and why this platform suits that phase. Be specific and practical, not generic.

Return JSON: {"days":[{"day":1,"rationale":"..."},{"day":2,"rationale":"..."},...]}
Only JSON, no other text.`
    : `你是内容策略师。下面是一个 ${plan.durationDays} 天内容计划。
选题：${ideaText.slice(0, 200)}

每日安排：
${daysBrief}

为每一天写一句话（≤30字）解释"为什么"——为什么这天安排这个阶段、为什么用这个平台契合这个阶段。要具体、能落地，不要空话。

只返回 JSON：{"days":[{"day":1,"rationale":"..."},{"day":2,"rationale":"..."},...]}
不要输出 JSON 以外的任何文字。`;

  try {
    const raw = await (options?.invoke ?? sendRawPrompt)(prompt);
    const rationales = parseRationaleJson(raw);
    if (rationales.size === 0) return plan;

    return {
      ...plan,
      days: plan.days.map((d) => {
        const rationale = rationales.get(d.day);
        if (!rationale || (isEn && containsHan(rationale))) return d;
        return { ...d, rationale };
      })
    };
  } catch (error) {
    if (options?.invoke) throw error;
    // AI 未配置或调用失败 → 降级为纯模板计划，值班卡照常展示。
    return plan;
  }
}

/** Best-effort 解析 LLM 返回的 {days:[{day,rationale}]} JSON。容错 markdown 围栏。 */
function parseRationaleJson(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const text = (fenced ? fenced[1] : raw).trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return out;
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(obj.days)) return out;
    for (const item of obj.days) {
      if (item && typeof item.day === "number" && typeof item.rationale === "string" && item.rationale.trim()) {
        out.set(item.day, item.rationale.trim());
      }
    }
  } catch {
    // 忽略解析失败。
  }
  return out;
}
