import { z } from "zod";
import { goalIdSchema, personaIdSchema, platformIdSchema } from "@/lib/content-schema";
import { getGoal, type GoalId } from "@/lib/goals";
import { getPersona } from "@/lib/personas";
import { getPlatform, type PlatformId } from "@/lib/platforms";

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
};

export type CampaignPlan = {
  id: string;
  title: string;
  strategy: string;
  durationDays: 7 | 14 | 30;
  days: CampaignDay[];
  createdAt: string;
};

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
  const idea = summarizeIdea(parsed.ideaText);
  const phases = phaseTemplates[parsed.goal][parsed.language];

  const days: CampaignDay[] = Array.from({ length: parsed.durationDays }, (_, index) => {
    const platform = parsed.platforms[index % parsed.platforms.length] as PlatformId;
    const platformMeta = getPlatform(platform);
    const supportingPlatforms = parsed.platforms.filter((item) => item !== platform).slice(0, 2);
    const phase = phases[index % phases.length];
    const cadence = Math.floor(index / phases.length) + 1;

    return {
      day: index + 1,
      phase,
      theme: isEn
        ? `${phase}: ${idea}`
        : `${phase}：${idea}`,
      angle: createAngle({ isEn, phase, goalLabel: isEn ? goal.labelEn : goal.label, personaLabel: isEn ? persona.labelEn : persona.label, platform: platformMeta.shortLabel, cadence }),
      primaryPlatform: platform,
      supportingPlatforms,
      deliverable: createDeliverable(isEn, platformMeta.shortLabel, phase),
      cta: createCampaignCta(parsed.goal, isEn),
      checklist: createChecklist(isEn, platformMeta.shortLabel)
    };
  });

  return {
    id: crypto.randomUUID(),
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
