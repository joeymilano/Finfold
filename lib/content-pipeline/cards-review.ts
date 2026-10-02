/**
 * Jev review for daily-pipeline Xiaohongshu card sets — the WeChat
 * five-question gate trimmed to the three questions that apply to short
 * card copy (fabricated data, clickbait hype, AI tell). Long-form quality
 * and platform-compliance questions belong to the article channel.
 *
 * Verdict is pure-code thresholds over the individual answers. Callers own
 * the fail semantics: every_post keeps this advisory (badge only);
 * jev_guarded treats a block as fail-closed and gates the material zip
 * behind an explicit human override.
 */
import { askJev } from "@/lib/jev";
import { WECHAT_REVIEW_MAX_CONTENT_CHARS, stripHtmlToText } from "@/lib/wechat-jev-review";

export const CARD_REVIEW_LIMITS = {
  maxFabricatedData: 0.15,
  maxClickbaitHype: 0.30,
  maxAiTell: 0.30
} as const;

export type CardJevReviewMetrics = {
  fabricatedData: number | null;
  clickbaitHype: number | null;
  aiTell: number | null;
};

export type CardJevReview = {
  decision: "pass" | "blocked";
  reasons: string[];
  metrics: CardJevReviewMetrics;
  model: string;
  at: string;
};

/** Pure threshold evaluation — exported for tests. Missing/wrong answers block. */
export function evaluateCardReview(answers: Record<string, unknown>): {
  decision: "pass" | "blocked";
  reasons: string[];
  metrics: CardJevReviewMetrics;
} {
  const reasons: string[] = [];
  const metrics: CardJevReviewMetrics = { fabricatedData: null, clickbaitHype: null, aiTell: null };
  const noul = (key: string): number | null => {
    const answer = answers[key];
    if (!answer || typeof answer !== "object") return null;
    const probability = (answer as Record<string, unknown>).noul;
    return typeof probability === "number" && Number.isFinite(probability) ? probability : null;
  };
  metrics.fabricatedData = noul("fabricated_data");
  metrics.clickbaitHype = noul("clickbait_hype");
  metrics.aiTell = noul("ai_tell");
  if (metrics.fabricatedData === null || metrics.clickbaitHype === null || metrics.aiTell === null) {
    return { decision: "blocked", reasons: ["jev_answer_missing"], metrics };
  }
  if (metrics.fabricatedData > CARD_REVIEW_LIMITS.maxFabricatedData) reasons.push("fabricated_data_risk");
  if (metrics.clickbaitHype > CARD_REVIEW_LIMITS.maxClickbaitHype) reasons.push("clickbait_hype_risk");
  if (metrics.aiTell > CARD_REVIEW_LIMITS.maxAiTell) reasons.push("ai_tell_risk");
  return { decision: reasons.length ? "blocked" : "pass", reasons, metrics };
}

const FINDINGS_ZH: Record<string, string> = {
  jev_answer_missing: "质检结果不完整，为安全起见拦截，可确认仍要下载。",
  fabricated_data_risk: "卡文疑似包含来源无法支撑的具体数据或事实。",
  clickbait_hype_risk: "标题或封面疑似标题党/夸大承诺。",
  ai_tell_risk: "AI 生成痕迹明显，建议先重新生成。"
};

export function cardReviewFindings(reasons: string[]): string[] {
  return reasons.map((reason) => FINDINGS_ZH[reason] ?? reason);
}

/** Throws JevUnavailableError upward; the caller decides fail semantics. */
export async function runCardJevReview(
  userId: string,
  input: { noteTitle: string; noteBody: string; cardText: string }
): Promise<CardJevReview> {
  const result = await askJev(
    {
      note: "This is a Xiaohongshu carousel note (title, caption, and the text of every card) about to be exported for manual posting. card_text is the concatenated on-card copy.",
      title: input.noteTitle,
      caption: stripHtmlToText(input.noteBody).slice(0, WECHAT_REVIEW_MAX_CONTENT_CHARS),
      card_text: stripHtmlToText(input.cardText).slice(0, WECHAT_REVIEW_MAX_CONTENT_CHARS)
    },
    {
      fabricated_data: {
        type: "noul" as const,
        instructions: "Does this note state any specific number, statistic, price, or named third-party fact that is NOT derivable from its own first-hand content? Generic mechanisms and clearly-marked hypotheticals do not count."
      },
      clickbait_hype: {
        type: "noul" as const,
        instructions: "Is the note packaged as clickbait or hollow hype — a promise the cards do not keep, exaggerated stakes, secret-formula framing, or manipulative urgency?"
      },
      ai_tell: {
        type: "noul" as const,
        instructions: "Would a typical reader flag this as unedited AI-generated filler? Consider hollow parallel slogans, uniform card rhythm, and generic conclusions."
      }
    },
    { operation: "content_pipeline_card_review", userId }
  );
  const evaluation = evaluateCardReview(result.answers as unknown as Record<string, unknown>);
  return { ...evaluation, model: result.model, at: new Date().toISOString() };
}
