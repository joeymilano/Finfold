/**
 * Jev-guarded auto review for the X publication pipeline (review mode
 * "jev_guarded").
 *
 * Jobs are always CREATED as needs_approval; this gate then asks Jev
 * (TypeSafe System One) one fan-out batch of typed questions about the
 * whole draft batch. A draft is auto-approved only when every risk signal
 * is under its threshold and the quality floor is met — the approval itself
 * goes through the same approveXPublicationJob transition as a human click
 * (status guard + fingerprint re-pin), never around it. Anything borderline,
 * plus every Jev outage (fail closed), stays in the human review queue.
 *
 * Thresholds live here as named constants so tuning is reviewable in one
 * place; the decision is computed in code from the individual answers, not
 * delegated to the model's self-assessment.
 */

import { jevEnabled, JevUnavailableError, type JevQuestion } from "@/lib/jev";
import { runJevItemReviewBatch } from "@/lib/jev-review";
import { logInfo } from "@/lib/observability";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { approveXPublicationJob } from "@/lib/x-pipeline/jobs";
import {
  autoReviewRecordSchema,
  type AutoReviewRecord,
  type XContentSnapshot
} from "@/lib/x-pipeline/content";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const AUTO_REVIEW_LIMITS = {
  /** P(specific number/date/named fact exists that brand+topic context cannot back). */
  maxFabricatedSpecifics: 0.15,
  /** P(reads like AI marketing content). */
  maxAiTell: 0.3,
  /** P(unsolicited product pitch rather than natural contribution). */
  maxHardSell: 0.3,
  /** P(contradicts brand context or embarrasses the author). */
  maxOffBrandRisk: 0.15,
  /** Probability-weighted 0-4 substance score must clear this floor. */
  minQualityScore: 3.0
} as const;

const QUALITY_SCALE: [string, string, ...string[]] = [
  "filler or a restated cliche — no new information",
  "thin — one small point padded out to fill space",
  "readable but generic — the point is familiar to the audience",
  "solid — one concrete mechanism, reason, or honest first-hand observation",
  "exceptional — specific, grounded in brand context, worth a stranger's click"
];

export type AutoReviewDraft = {
  jobId: string;
  snapshot: XContentSnapshot;
  /** Optional radar context (whyNow/whyYou) beyond the snapshot topic title. */
  topicBackground?: string | null;
};

export type BatchAutoReviewResult = {
  approved: number;
  needsHuman: number;
};

export type DraftReviewOutcome = {
  decision: "approved" | "needs_human";
  reasons: string[];
  metrics: AutoReviewRecord["metrics"];
};

function draftState(draft: AutoReviewDraft): Record<string, unknown> {
  const snapshot = draft.snapshot;
  return {
    kind: snapshot.kind,
    topic_title: snapshot.topic.title,
    topic_background: draft.topicBackground ?? null,
    target_post: snapshot.replyContext ? `@${snapshot.replyContext.handle}: ${snapshot.replyContext.text}` : null,
    tweets: snapshot.tweets.map((tweet) => tweet.text)
  };
}

// The batch helper injects each draft's global index into the state and the
// "{i}" tokens below; stem insertion order defines the wire question order.
const AUTO_REVIEW_QUESTION_STEMS: Record<string, JevQuestion> = {
  fabricated: {
    type: "noul",
    instructions: `Does draft {i} state any specific number, statistic, date, price, or named third-party fact that is NOT derivable from brand_context, topic_background, or target_post? Opinions and generic mechanisms do not count.`
  },
  ai_tell: {
    type: "noul",
    instructions: `Would a typical X reader flag draft {i} as AI-generated marketing content? Consider sycophantic openers, reversal framing ("It's not X, it's Y", "Most people think... actually..."), "Here's the thing" openers, numbered-lesson scaffolding, and hollow hype.`
  },
  hard_sell: {
    type: "noul",
    instructions: `Is draft {i} an unsolicited product pitch rather than a natural contribution to the topic or conversation?`
  },
  off_brand: {
    type: "noul",
    instructions: `Does draft {i} contradict brand_context, or risk embarrassing its author (unverifiable claims, petty attacks, hot takes on unrelated controversies)?`
  },
  quality: {
    type: "score",
    instructions: `Rate the substantive value of draft {i} for its intended audience.`,
    criteria: QUALITY_SCALE
  }
};

/**
 * Pure threshold evaluation for one draft — exported for tests. Unknown,
 * missing, or wrongly-typed answers fail closed to needs_human.
 */
export function evaluateAutoReviewDraft(
  answers: Record<string, unknown>,
  index: number
): DraftReviewOutcome {
  const reasons: string[] = [];
  const metrics: AutoReviewRecord["metrics"] = {
    fabricatedSpecifics: null,
    aiTell: null,
    hardSell: null,
    offBrandRisk: null,
    quality: null
  };

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

  metrics.fabricatedSpecifics = noul(`fabricated_${index}`);
  metrics.aiTell = noul(`ai_tell_${index}`);
  metrics.hardSell = noul(`hard_sell_${index}`);
  metrics.offBrandRisk = noul(`off_brand_${index}`);
  metrics.quality = score(`quality_${index}`);

  if (metrics.fabricatedSpecifics === null || metrics.aiTell === null
    || metrics.hardSell === null || metrics.offBrandRisk === null || metrics.quality === null) {
    return { decision: "needs_human", reasons: ["jev_answer_missing"], metrics };
  }
  if (metrics.fabricatedSpecifics > AUTO_REVIEW_LIMITS.maxFabricatedSpecifics) {
    reasons.push("fabricated_specifics_risk");
  }
  if (metrics.aiTell > AUTO_REVIEW_LIMITS.maxAiTell) {
    reasons.push("ai_tell_risk");
  }
  if (metrics.hardSell > AUTO_REVIEW_LIMITS.maxHardSell) {
    reasons.push("hard_sell_risk");
  }
  if (metrics.offBrandRisk > AUTO_REVIEW_LIMITS.maxOffBrandRisk) {
    reasons.push("off_brand_risk");
  }
  if (metrics.quality < AUTO_REVIEW_LIMITS.minQualityScore) {
    reasons.push("quality_below_floor");
  }
  return { decision: reasons.length ? "needs_human" : "approved", reasons, metrics };
}

async function persistAutoReview(
  admin: AdminClient,
  userId: string,
  jobId: string,
  record: AutoReviewRecord
): Promise<void> {
  const { error } = await admin
    .from("x_publication_jobs")
    .update({ auto_review: record, updated_at: record.decidedAt })
    .eq("id", jobId)
    .eq("user_id", userId);
  if (error) throw error;
}

function unavailableRecord(reason: string, decidedAt: string): AutoReviewRecord {
  return {
    model: "unavailable",
    decision: "needs_human",
    reasons: [reason],
    metrics: {
      fabricatedSpecifics: null,
      aiTell: null,
      hardSell: null,
      offBrandRisk: null,
      quality: null
    },
    decidedAt
  };
}

/**
 * One Jev call for the whole batch, then per-draft threshold evaluation.
 * All failure modes (disabled, outage, parse) leave jobs in needs_approval
 * with an explanatory record — behavior degrades to every_post, never to
 * spot_check.
 */
export async function runJevBatchAutoReview(
  admin: AdminClient,
  userId: string,
  drafts: AutoReviewDraft[],
  context: { brandDigest: string; operation: "x_morning_generation" | "x_engagement_draft" }
): Promise<BatchAutoReviewResult> {
  const outcome: BatchAutoReviewResult = { approved: 0, needsHuman: 0 };
  if (!drafts.length) return outcome;

  let answers: Record<string, unknown> = {};
  let model = "unavailable";
  if (!jevEnabled()) {
    await Promise.all(drafts.map((draft) =>
      persistAutoReview(admin, userId, draft.jobId, unavailableRecord("jev_disabled", new Date().toISOString()))
    ));
    outcome.needsHuman = drafts.length;
    return outcome;
  }

  try {
    const result = await runJevItemReviewBatch({
      items: drafts.map((draft) => draftState(draft)),
      questions: AUTO_REVIEW_QUESTION_STEMS,
      itemsKey: "drafts",
      brandContext: context.brandDigest,
      note: "Drafts are generated X posts/replies. topic_background and brand_context are the ONLY first-hand facts the drafts may speak from.",
      operation: context.operation,
      userId
    });
    answers = result.answers;
    model = result.model;
  } catch (error) {
    const reason = error instanceof JevUnavailableError ? error.message : "jev_unavailable";
    await Promise.all(drafts.map((draft) =>
      persistAutoReview(admin, userId, draft.jobId, unavailableRecord(reason.slice(0, 200), new Date().toISOString()))
    ));
    outcome.needsHuman = drafts.length;
    return outcome;
  }

  const decidedAt = new Date().toISOString();
  for (const [index, draft] of drafts.entries()) {
    const evaluation = evaluateAutoReviewDraft(answers, index);
    if (evaluation.decision === "approved") {
      // Same transition a human approval takes: status guard + fingerprint
      // re-pin. A null return (already transitioned) falls back to human.
      const approved = await approveXPublicationJob(admin, userId, draft.jobId);
      if (approved) {
        outcome.approved += 1;
      } else {
        evaluation.decision = "needs_human";
        evaluation.reasons.push("approve_transition_failed");
        outcome.needsHuman += 1;
      }
    } else {
      outcome.needsHuman += 1;
    }
    await persistAutoReview(admin, userId, draft.jobId, {
      model,
      decision: evaluation.decision,
      reasons: evaluation.reasons,
      metrics: evaluation.metrics,
      decidedAt
    });
  }
  logInfo("x_auto_review_completed", { userId }, {
    operation: context.operation,
    approved: outcome.approved,
    needs_human: outcome.needsHuman,
    model
  });
  return outcome;
}
