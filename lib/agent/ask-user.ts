import { z } from "zod";

/**
 * Structured clarification protocol for the Agent chat.
 *
 * When a task is genuinely blocked on a missing choice, the model calls the
 * `ask_user` tool instead of asking an open-ended question in plain text. The
 * result renders as a tappable option card; the user's picks are sent back as
 * a normal user message, so no extra API surface is required.
 *
 * Hard limits keep the card decisive: one blocking question per turn, 2-4
 * concrete options, and one recommended default. Historical results may
 * still contain up to three questions and remain readable.
 */
export const askUserOptionSchema = z.object({
  label: z.string().min(1).max(60),
  description: z.string().max(120).optional()
});

export const askUserQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1).max(160),
  options: z.array(askUserOptionSchema).min(2).max(4),
  multiple: z.boolean().optional(),
  /** Label of the recommended option; must exist in `options`. */
  recommended: z.string().max(60).optional()
}).refine(
  (value) => !value.recommended || value.options.some((option) => option.label === value.recommended),
  { message: "recommended must match one of the option labels" }
);

export const askUserRequestSchema = z.object({
  questions: z.array(askUserQuestionSchema).length(1)
});

export type AskUserOption = z.infer<typeof askUserOptionSchema>;
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>;

/** Shape returned by the ask_user tool and persisted in tool results. */
export const askUserResultSchema = z.object({
  askedUser: z.literal(true),
  questions: z.array(askUserQuestionSchema).min(1).max(3)
});

export type AskUserResult = z.infer<typeof askUserResultSchema>;

export function parseAskUserResult(value: unknown): AskUserResult | null {
  const parsed = askUserResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Compose the picked options into one user-message string. The Agent receives
 * it as a normal chat turn, phrased so the answer maps back to each question.
 */
export function buildAskUserAnswer(
  picks: Array<{ question: AskUserQuestion; labels: string[] }>,
  locale: "zh" | "en"
): string {
  const lines = picks
    .filter((pick) => pick.labels.length > 0)
    .map((pick) => locale === "zh"
      ? `我已选择「${pick.labels.join("、")}」。请直接继续完成任务，不要重复提问。问题是：${pick.question.question}`
      : `I chose "${pick.labels.join(", ")}". Continue the task now without repeating the question. Question: ${pick.question.question}`);
  return lines.join("\n");
}

/** China-platform labels, matched in either language (小红书 / RedNote, 公众号…). */
const CHINA_PLATFORM_PATTERN
  = /小红书|rednote|知乎|zhihu|微信|wechat|视频号|公众号|抖音|douyin|微博|weibo|b站|bilibili|哔哩哔哩|贴吧/i;
/** Global-platform labels (X / Twitter, Instagram, TikTok, LinkedIn…). */
const GLOBAL_PLATFORM_PATTERN
  = /\bx\b|twitter|instagram|tiktok|linkedin|领英|reddit|youtube|油管|facebook|threads|product\s*hunt|hacker\s*news|substack|medium|newsletter|quora/i;

export type PlatformRegion = "China" | "Global";

/** Classifies an option label as a China/Global platform name, or null when
 *  the label is not a recognizable platform (non-platform option lists are
 *  never reordered). */
export function platformRegionOfLabel(label: string): PlatformRegion | null {
  if (CHINA_PLATFORM_PATTERN.test(label)) return "China";
  if (GLOBAL_PLATFORM_PATTERN.test(label)) return "Global";
  return null;
}

/**
 * Deterministic region ordering for platform-flavored option lists: English
 * conversations list Global platforms first, Chinese conversations list China
 * platforms first. Ordering is stable within each region. Lists whose options
 * are not recognizably platforms (and whose question id does not mention
 * "platform") are returned untouched.
 */
export function orderAskUserOptionsForLocale<T extends { label: string }>(
  options: T[],
  locale: "zh" | "en",
  questionId?: string
): T[] {
  if (options.length < 2) return options;
  const regions = options.map((option) => platformRegionOfLabel(option.label));
  const known = regions.filter((region) => region !== null).length;
  if (known === 0) return options;
  const platformQuestion = questionId ? /platform/i.test(questionId) : false;
  if (!platformQuestion && known * 2 < options.length) return options;
  const preferred: PlatformRegion = locale === "en" ? "Global" : "China";
  const rank = (region: PlatformRegion | null) =>
    region === null ? 2 : region === preferred ? 0 : 1;
  return options
    .map((option, index) => ({ option, index, region: regions[index] }))
    .sort((a, b) => rank(a.region) - rank(b.region) || a.index - b.index)
    .map((entry) => entry.option);
}

const NUMBERED_OPTIONS_PATTERN
  = /(?:^|\n|\s)(?:1[.、)）]|①)\s*\S[\s\S]{0,240}?(?:2[.、)）]|②)/;
const CHOICE_QUESTION_PATTERN
  = /(请告诉我|请选择|请回复|选一个|选哪个|你选|想做哪个|想做哪一个|更倾向|倾向哪|哪一种|哪一个方向|挑一个|告诉我你想|你要哪个|优先做哪个)/;

/** Detects "pick one of these numbered options" replies that should have gone
 * through the ask_user tool. Used by the agent loop as a one-shot corrective
 * nudge so users never have to type their choice back. */
export function looksLikeNumberedChoiceQuestion(text: string): boolean {
  if (!text) return false;
  return NUMBERED_OPTIONS_PATTERN.test(text) && CHOICE_QUESTION_PATTERN.test(text);
}
