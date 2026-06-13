import { z } from "zod";
import { goalIdSchema, personaIdSchema, platformIdSchema } from "@/lib/content-schema";
import { getGoal, type GoalId } from "@/lib/goals";
import { getPersona } from "@/lib/personas";
import { getPlatform, type PlatformId } from "@/lib/platforms";

export const atomizerRequestSchema = z.object({
  sourceText: z.string().min(50),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema).min(1).max(11),
  language: z.enum(["zh", "en"]).default("zh")
});

export type AtomizerRequest = z.infer<typeof atomizerRequestSchema>;

export type AtomizedFormat =
  | "short-post"
  | "long-post"
  | "faq"
  | "video-script"
  | "email"
  | "thread"
  | "case-study"
  | "comparison"
  | "checklist"
  | "founder-note";

export type AtomizedAsset = {
  id: string;
  format: AtomizedFormat;
  platform: PlatformId;
  title: string;
  body: string;
  cta: string;
  finfoldNote: string;
};

export type AtomizedKit = {
  id: string;
  sourceSummary: string;
  strategy: string;
  assets: AtomizedAsset[];
  createdAt: string;
};

const formats: AtomizedFormat[] = [
  "short-post",
  "long-post",
  "faq",
  "video-script",
  "email",
  "thread",
  "case-study",
  "comparison",
  "checklist",
  "founder-note"
];

const formatLabels: Record<AtomizedFormat, { zh: string; en: string }> = {
  "short-post": { zh: "短帖", en: "Short post" },
  "long-post": { zh: "长文", en: "Long post" },
  faq: { zh: "FAQ", en: "FAQ" },
  "video-script": { zh: "视频脚本", en: "Video script" },
  email: { zh: "邮件", en: "Email" },
  thread: { zh: "Thread", en: "Thread" },
  "case-study": { zh: "案例拆解", en: "Case study" },
  comparison: { zh: "竞品对比", en: "Comparison" },
  checklist: { zh: "清单", en: "Checklist" },
  "founder-note": { zh: "创始人笔记", en: "Founder note" }
};

export function atomizeContent(input: AtomizerRequest): AtomizedKit {
  const parsed = atomizerRequestSchema.parse(input);
  const isEn = parsed.language === "en";
  const goal = getGoal(parsed.goal);
  const persona = getPersona(parsed.persona);
  const sourceSummary = summarizeSource(parsed.sourceText);

  return {
    id: crypto.randomUUID(),
    sourceSummary,
    strategy: isEn
      ? `Split one source into 10 reusable assets for ${persona.labelEn}, each mapped to a format and platform that supports ${goal.labelEn}.`
      : `把一个源内容拆成 10 个可复用资产，面向${persona.label}，分别承接${goal.label}的不同转化场景。`,
    assets: formats.map((format, index) => {
      const platform = parsed.platforms[index % parsed.platforms.length] as PlatformId;
      const platformMeta = getPlatform(platform);
      const label = isEn ? formatLabels[format].en : formatLabels[format].zh;

      return {
        id: crypto.randomUUID(),
        format,
        platform,
        title: isEn
          ? `${label}: ${sourceSummary}`
          : `${label}：${sourceSummary}`,
        body: buildAssetBody({
          isEn,
          format,
          sourceSummary,
          platformLabel: platformMeta.shortLabel,
          goalLabel: isEn ? goal.labelEn : goal.label,
          personaLabel: isEn ? persona.labelEn : persona.label
        }),
        cta: createAtomizerCta(parsed.goal, isEn),
        finfoldNote: isEn
          ? `Use this as the ${platformMeta.shortLabel} version. Keep the format distinct from the other nine assets.`
          : `作为 ${platformMeta.shortLabel} 版本使用。保持这个格式和其他 9 个资产明显区分。`
      };
    }),
    createdAt: new Date().toISOString()
  };
}

function summarizeSource(sourceText: string): string {
  const normalized = sourceText.replace(/\s+/g, " ").trim();
  return normalized.length > 56 ? `${normalized.slice(0, 56)}...` : normalized;
}

function buildAssetBody({
  isEn,
  format,
  sourceSummary,
  platformLabel,
  goalLabel,
  personaLabel
}: {
  isEn: boolean;
  format: AtomizedFormat;
  sourceSummary: string;
  platformLabel: string;
  goalLabel: string;
  personaLabel: string;
}) {
  const zh: Record<AtomizedFormat, string> = {
    "short-post": `用一句强 hook 切入：${sourceSummary}\n\n适合 ${platformLabel} 的短内容，用痛点、结果和下一步组成三段。目标是让${personaLabel}快速理解为什么这件事和自己有关。`,
    "long-post": `围绕「${sourceSummary}」写一篇完整长文：先讲问题，再讲为什么过去的方法失效，最后给出你的方法论和产品视角。`,
    faq: `Q1：这个解决什么问题？\nA：它把「${sourceSummary}」拆成更容易理解和执行的内容资产。\n\nQ2：适合谁？\nA：适合${personaLabel}。\n\nQ3：下一步是什么？\nA：围绕${goalLabel}设计一个明确行动。`,
    "video-script": `前 3 秒：直接点出痛点。\n中段：用「${sourceSummary}」解释解决方案。\n结尾：给一个清晰 CTA，并提醒观众保存或私信。`,
    email: `主题：把一个好想法变成可执行内容\n\n正文：如果你正在处理「${sourceSummary}」，这封邮件可以用来解释问题、给出方法，并引导读者进入下一步。`,
    thread: `1/ 先抛出反常识观点。\n2/ 用「${sourceSummary}」说明为什么。\n3/ 拆成 3 个可执行要点。\n4/ 以一个问题或 CTA 收尾。`,
    "case-study": `案例结构：背景 -> 挑战 -> 做法 -> 结果。\n把「${sourceSummary}」包装成一个真实业务场景，让读者看到前后变化。`,
    comparison: `对比角度：旧方式 vs 新方式。\n旧方式：同一份内容到处复制。\n新方式：围绕「${sourceSummary}」按平台重组。`,
    checklist: `发布前检查：\n- hook 是否清楚\n- 平台语气是否正确\n- CTA 是否匹配${goalLabel}\n- 是否避免硬广\n- 是否能被${personaLabel}快速理解`,
    "founder-note": `创始人视角：我为什么在意「${sourceSummary}」。写成真实观察，不要像产品公告。重点放在动机、取舍和下一步。`
  };

  const en: Record<AtomizedFormat, string> = {
    "short-post": `Open with one sharp hook: ${sourceSummary}\n\nFor ${platformLabel}, keep it tight: pain, proof, next step. Make ${personaLabel} immediately understand why it matters.`,
    "long-post": `Build a full essay around "${sourceSummary}": problem, why old workflows fail, the method, and the product point of view.`,
    faq: `Q1: What problem does this solve?\nA: It turns "${sourceSummary}" into assets people can understand and use.\n\nQ2: Who is it for?\nA: ${personaLabel}.\n\nQ3: What should readers do next?\nA: Take one action tied to ${goalLabel}.`,
    "video-script": `First 3 seconds: name the pain.\nMiddle: explain the solution through "${sourceSummary}".\nClose: give one CTA and ask viewers to save or reply.`,
    email: `Subject: Turn one strong idea into usable content\n\nBody: If you are working on "${sourceSummary}", this email explains the pain, gives a method, and moves readers to the next step.`,
    thread: `1/ Open with a contrarian point.\n2/ Explain why using "${sourceSummary}".\n3/ Break it into 3 practical lessons.\n4/ End with one question or CTA.`,
    "case-study": `Case arc: context -> challenge -> approach -> result. Turn "${sourceSummary}" into a real business scene with a before/after shift.`,
    comparison: `Comparison angle: old way vs new way.\nOld: copy the same post everywhere.\nNew: reshape "${sourceSummary}" for each platform.`,
    checklist: `Pre-publish checklist:\n- Hook is clear\n- Platform tone fits\n- CTA matches ${goalLabel}\n- No hard-sell language\n- ${personaLabel} can understand it quickly`,
    "founder-note": `Founder angle: why I care about "${sourceSummary}". Make it a real observation, not an announcement. Focus on motivation, tradeoffs, and the next step.`
  };

  return isEn ? en[format] : zh[format];
}

function createAtomizerCta(goal: GoalId, isEn: boolean) {
  const ctas: Record<GoalId, { zh: string; en: string }> = {
    "lead-gen": { zh: "引导读者预约、私信或加入 waitlist。", en: "Ask readers to book, DM, or join the waitlist." },
    "audience-growth": { zh: "引导关注、收藏，并评论一个真实问题。", en: "Ask readers to follow, save, and answer one specific question." },
    "product-launch": { zh: "引导访问发布页、试用产品或留下反馈。", en: "Send readers to the launch page, trial, or feedback form." },
    "event-promo": { zh: "引导报名、转发给同伴或设置提醒。", en: "Ask readers to register, share, or set a reminder." }
  };

  return isEn ? ctas[goal].en : ctas[goal].zh;
}
