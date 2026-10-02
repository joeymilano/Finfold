/**
 * Jev pre-approval review for WeChat Official Account publication.
 *
 * Five typed questions about the rendered snapshot (fabricated data,
 * clickbait hype, compliance risk, AI tell, long-form quality). The
 * verdict is pure-code thresholds over the individual answers — never the
 * model's self-assessment. Callers own the fail semantics: this module
 * throws on Jev unavailability and the route fails open (a human is
 * explicitly clicking approve); missing/malformed answers fail blocked.
 */
import { askJev } from "@/lib/jev";

export const WECHAT_REVIEW_LIMITS = {
  /** P(specific number/date/named fact the title+summary+body cannot back). */
  maxFabricatedData: 0.15,
  /** P(clickbait/hype packaging: misleading promise, exaggerated stakes). */
  maxClickbaitHype: 0.30,
  /** P(content risks WeChat platform or regulatory complaints). */
  maxComplianceRisk: 0.15,
  /** P(reads like unedited AI-generated filler). */
  maxAiTell: 0.30,
  /** Probability-weighted 0-4 long-form substance floor. */
  minQualityScore: 3.0
} as const;

export const WECHAT_REVIEW_MAX_CONTENT_CHARS = 6_000;

const WECHAT_QUALITY_SCALE: [string, string, ...string[]] = [
  "empty filler — restated cliches with no information a subscriber can use",
  "thin — one padded point stretched across the whole article",
  "readable but generic — the reader gains little they could not find elsewhere",
  "solid — concrete mechanisms, honest specifics, or a genuinely useful takeaway",
  "exceptional — specific, well-grounded, worth reading to the end and sharing"
];

/** Strips tags, decodes common entities, collapses whitespace, truncates. */
export function stripHtmlToText(contentHtml: string): string {
  return contentHtml
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, WECHAT_REVIEW_MAX_CONTENT_CHARS);
}

export type WechatJevReviewMetrics = {
  fabricatedData: number | null;
  clickbaitHype: number | null;
  complianceRisk: number | null;
  aiTell: number | null;
  quality: number | null;
};
export type WechatJevReview = {
  decision: "pass" | "blocked";
  reasons: string[];
  metrics: WechatJevReviewMetrics;
  model: string;
  at: string;
};

function buildWechatReviewQuestions() {
  return {
    fabricated_data: {
      type: "noul" as const,
      instructions: "Does the article state any specific number, statistic, date, price, or named third-party fact that is NOT derivable from its own first-hand content (the author's stated experience, examples, or reasoning)? Generic mechanisms and clearly-marked hypotheticals do not count."
    },
    clickbait_hype: {
      type: "noul" as const,
      instructions: "Is the article packaged as clickbait or hollow hype — a promise the body does not keep, exaggerated stakes, secret-formula framing, or manipulative urgency?"
    },
    compliance_risk: {
      type: "noul" as const,
      instructions: "Does the article risk WeChat Official Account platform or regulatory complaints — medical/financial guarantees, unlicensed claims, inciting content, or prohibited promotional framing?"
    },
    ai_tell: {
      type: "noul" as const,
      instructions: "Would a typical reader flag this article as unedited AI-generated filler? Consider listicle scaffolding with no specifics, uniform paragraph rhythm, hollow transitions, and generic conclusions."
    },
    quality: {
      type: "score" as const,
      instructions: "Rate the substantive value of this long-form article for its intended subscribers.",
      criteria: WECHAT_QUALITY_SCALE
    }
  };
}

/** Pure threshold evaluation — exported for tests. Missing/wrong answers block. */
export function evaluateWechatReview(answers: Record<string, unknown>): { decision: "pass" | "blocked"; reasons: string[]; metrics: WechatJevReviewMetrics } {
  const reasons: string[] = [];
  const metrics: WechatJevReviewMetrics = { fabricatedData: null, clickbaitHype: null, complianceRisk: null, aiTell: null, quality: null };
  const noul = (key: string): number | null => {
    const answer = answers[key];
    if (!answer || typeof answer !== "object") return null;
    const probability = (answer as Record<string, unknown>).noul;
    return typeof probability === "number" && Number.isFinite(probability) ? probability : null;
  };
  const score = (key: string): number | null => {
    const answer = answers[key];
    if (!answer || typeof answer !== "object") return null;
    const value = (answer as Record<string, unknown>).score;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  metrics.fabricatedData = noul("fabricated_data");
  metrics.clickbaitHype = noul("clickbait_hype");
  metrics.complianceRisk = noul("compliance_risk");
  metrics.aiTell = noul("ai_tell");
  metrics.quality = score("quality");
  if (metrics.fabricatedData === null || metrics.clickbaitHype === null || metrics.complianceRisk === null || metrics.aiTell === null || metrics.quality === null) {
    return { decision: "blocked", reasons: ["jev_answer_missing"], metrics };
  }
  if (metrics.fabricatedData > WECHAT_REVIEW_LIMITS.maxFabricatedData) reasons.push("fabricated_data_risk");
  if (metrics.clickbaitHype > WECHAT_REVIEW_LIMITS.maxClickbaitHype) reasons.push("clickbait_hype_risk");
  if (metrics.complianceRisk > WECHAT_REVIEW_LIMITS.maxComplianceRisk) reasons.push("compliance_risk");
  if (metrics.aiTell > WECHAT_REVIEW_LIMITS.maxAiTell) reasons.push("ai_tell_risk");
  if (metrics.quality < WECHAT_REVIEW_LIMITS.minQualityScore) reasons.push("quality_below_floor");
  return { decision: reasons.length ? "blocked" : "pass", reasons, metrics };
}

const FINDINGS_ZH: Record<string, string> = {
  jev_answer_missing: "质检结果不完整，为安全起见拦截，可确认仍要发布。",
  fabricated_data_risk: "疑似包含来源无法支撑的具体数据或事实。",
  clickbait_hype_risk: "标题或包装疑似标题党/夸大承诺。",
  compliance_risk: "疑似存在平台合规风险（医疗/金融保证、违规推广等）。",
  ai_tell_risk: "AI 生成痕迹明显，建议先润色。",
  quality_below_floor: "内容质量低于自动放行下限。"
};

export function wechatReviewFindings(reasons: string[]): string[] {
  return reasons.map(reason => FINDINGS_ZH[reason] ?? reason);
}

/** Throws JevUnavailableError upward; the route decides fail-open. */
export async function runWechatJevReview(
  userId: string,
  input: { title: string; summary: string; contentHtml: string }
): Promise<WechatJevReview> {
  const result = await askJev(
    {
      note: "This is a WeChat Official Account article snapshot about to be scheduled. content is tag-stripped plain text of the full article.",
      title: input.title,
      summary: input.summary,
      content: stripHtmlToText(input.contentHtml)
    },
    buildWechatReviewQuestions(),
    { operation: "wechat_publication_review", userId }
  );
  const evaluation = evaluateWechatReview(result.answers as unknown as Record<string, unknown>);
  return { ...evaluation, model: result.model, at: new Date().toISOString() };
}
