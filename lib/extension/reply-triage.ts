/**
 * Jev triage for extension reply drafting (mirrors lib/x-pipeline/replies.ts).
 * One fan-out call judges worth_replying + audience type from the comment
 * text; the verdict only steers tone, never blocks. Pure optimization:
 * disabled / unavailable / screenshot-only comments all return null and the
 * caller behaves exactly as it did before Jev existed.
 */
import { askJev, jevEnabled, type JevQuestions } from "@/lib/jev";
import { logInfo } from "@/lib/observability";
import type { ReplyDraftRequest } from "./reply-contracts";

export type ExtensionAudienceType = "potential_customer" | "peer_builder" | "noise" | "hostile" | "other";
export type ExtensionReplyTriage = { audienceType: ExtensionAudienceType; worthReplying: number };

const AUDIENCE_TYPES: ReadonlySet<string> = new Set(["potential_customer", "peer_builder", "noise", "hostile", "other"]);

export function buildExtensionReplyTriageQuestions(platform: "xiaohongshu" | "linkedin" | "x"): JevQuestions {
  const xhs = platform === "xiaohongshu";
  const onX = platform === "x";
  return {
    worth_replying: {
      type: "noul",
      instructions: xhs
        ? "Is this comment worth a substantive author reply on Xiaohongshu — a real question about the post's topic or product, purchase intent, or a peer creator engaging? Emoji-only praise, copy-paste chain comments, spam and bot comments are not worth a reply."
        : onX
          ? "Is this reply worth a substantive author reply on X (Twitter) — a real question, a genuine disagreement with substance, or a relevant first-hand experience? Quote-tweet bait, single-emoji reactions, bot spam and pure link drops are not worth a reply."
          : "Is this comment worth a substantive author reply on LinkedIn — a real question, a professional disagreement, or a relevant first-hand experience? Empty congratulations, bot spam and pure link drops are not worth a reply."
    },
    audience_type: {
      type: "choice",
      instructions: "Classify the commenter from their comment alone.",
      criteria: xhs ? {
        potential_customer: "asks how to buy, compares alternatives, or describes a problem the author's product or service plausibly solves",
        peer_builder: "a fellow creator or practitioner exchanging experience, methods, or collaboration",
        noise: "emoji-only praise, copy-paste chain comments, spam, bots, or off-topic chatter",
        hostile: "aggressive, mocking, or bad-faith remarks — engaging risks a flame war",
        other: "anything else"
      } : onX ? {
        potential_customer: "asks about availability, pricing, or fit, or describes a problem the author's product or service plausibly solves",
        peer_builder: "a fellow builder or practitioner adding substance — questions, counterpoints, or their own experience",
        noise: "single-emoji reactions, dunk attempts, bot spam, or pure link drops",
        hostile: "aggressive, mocking, or bad-faith remarks — engaging risks a flame war",
        other: "anything else"
      } : {
        potential_customer: "asks about availability, pricing, or fit, or describes a relevant professional pain point",
        peer_builder: "a fellow professional adding substance — questions, counterpoints, or their own experience",
        noise: "empty congratulations, recruiter/bot spam, or pure link drops",
        hostile: "dismissive, inflammatory, or bad-faith criticism",
        other: "anything else"
      }
    }
  };
}

/** Tone guidance injected into the draft prompt per audience type. */
export function audienceToneGuidance(audienceType: string): string {
  switch (audienceType) {
    case "peer_builder": return "talk shop as a fellow builder or creator — share experience and specifics, no promotion";
    case "potential_customer": return "answer the underlying need seriously and helpfully as a person; do not push a sale";
    case "hostile": return "respond with at most one calm, non-defensive sentence, or return needs_context";
    case "noise": return "do not be enthusiastically promotional; a brief polite acknowledgement or needs_context is fine";
    default: return "stay neutral and helpful";
  }
}

export async function triageExtensionReply(
  request: ReplyDraftRequest,
  brandContext: string | null,
  options: { userId?: string } = {}
): Promise<ExtensionReplyTriage | null> {
  // Jev takes no images: a screenshot-only comment has no text to judge.
  if (!request.comment.trim() || !jevEnabled()) return null;
  try {
    const result = await askJev(
      {
        brand_context: brandContext,
        platform: request.platform,
        comment: request.comment.slice(0, 2_000),
        post_context: request.postContext.slice(0, 1_000)
      },
      buildExtensionReplyTriageQuestions(request.platform),
      { operation: "extension_reply_triage", userId: options.userId }
    );
    const answers = result.answers as unknown as Record<string, Record<string, unknown>>;
    const worth = answers.worth_replying;
    const audience = answers.audience_type;
    const probability = worth && typeof worth.noul === "number" && Number.isFinite(worth.noul) ? worth.noul : null;
    const choice = audience && typeof audience.choice === "string" ? audience.choice : null;
    if (probability === null || !choice) return null;
    const audienceType = (AUDIENCE_TYPES.has(choice) ? choice : "other") as ExtensionAudienceType;
    logInfo("jev_decision", { userId: options.userId }, { operation: "extension_reply_triage", platform: request.platform, audience_type: audienceType, worth_replying: probability, model: result.model });
    return { audienceType, worthReplying: probability };
  } catch {
    return null; // Tone guidance is an optimization; failures draft as before.
  }
}
