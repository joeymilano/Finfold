/**
 * Jev adaptability screen for cross-platform radar topics feeding X morning
 * generation.
 *
 * The radar tags every opportunity with the user's single best platform
 * (see choosePlatform in lib/trends/scoring.ts), which is rarely "x" — so
 * filtering generation to recommended_platform="x" starves the pipeline.
 * Instead, x-tagged topics flow directly and topics recommended for other
 * platforms must prove here that they can carry an English X post for this
 * business. Fail-closed: when Jev cannot judge, unjudged cross-platform
 * topics are dropped and the pipeline sees x-tagged topics only, exactly
 * the pre-expansion behavior.
 */
import { runJevItemReviewBatch } from "@/lib/jev-review";
import type { JevQuestion } from "@/lib/jev";
import { logInfo } from "@/lib/observability";

/** P(worth adapting) at or above this keeps a cross-platform topic. */
export const X_TOPIC_ADAPTABLE_MIN = 0.5;

export type RadarTopicCandidate = {
  id: string;
  title: string;
  whyNow: string | null;
  whyYou: string | null;
};

const ADAPTABILITY_QUESTIONS: Record<string, JevQuestion> = {
  x_adaptable: {
    type: "noul",
    instructions: `Could topic {i} carry a good English X (Twitter) post for the business in brand_context? A topic works when its insight, tension, or tactic survives translation and matters to an international builder/indie audience. A topic fails when it only makes sense through Chinese-platform mechanics (a platform-specific feature, a China-only event or festival, a domestic meme) with no broader angle.`
  }
};

/**
 * Returns the ids judged adaptable. Empty input short-circuits without a
 * Jev call; null means Jev was unavailable and the caller must keep only
 * x-tagged topics.
 */
export async function filterAdaptableTopics(
  userId: string,
  brandDigest: string,
  candidates: RadarTopicCandidate[]
): Promise<Set<string> | null> {
  if (!candidates.length) return new Set();
  try {
    const { model, answers } = await runJevItemReviewBatch({
      items: candidates.map((candidate) => ({
        title: candidate.title,
        why_now: candidate.whyNow,
        why_you: candidate.whyYou
      })),
      questions: ADAPTABILITY_QUESTIONS,
      brandContext: brandDigest,
      note: "Topics are radar opportunities originally recommended for another platform (usually Xiaohongshu). Judge only whether each can be adapted into an English X post for this business.",
      operation: "x_topic_adaptability",
      userId
    });
    const kept = new Set<string>();
    candidates.forEach((candidate, index) => {
      const answer = answers[`x_adaptable_${index}`];
      const probability = answer && typeof answer === "object"
        && typeof (answer as Record<string, unknown>).noul === "number"
        ? (answer as { noul: number }).noul : null;
      if (probability !== null && probability >= X_TOPIC_ADAPTABLE_MIN) kept.add(candidate.id);
    });
    logInfo("jev_decision", { userId }, {
      operation: "x_topic_adaptability",
      candidates: candidates.length,
      kept: kept.size,
      model
    });
    return kept;
  } catch {
    // Fail-closed: a cross-platform topic needs a judgment to enter the
    // autonomous pipeline; without one only x-tagged topics flow.
    return null;
  }
}
