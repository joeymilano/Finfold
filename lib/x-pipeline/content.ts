import { z } from "zod";

/**
 * Pure content contracts for the X publication pipeline. The snapshot is the
 * single source of truth a job publishes; its SHA-256 fingerprint is pinned
 * at approval time so the dispatcher can refuse to publish drifted content.
 */

export const xPublicationKinds = ["post", "thread", "reply"] as const;
export type XPublicationKind = (typeof xPublicationKinds)[number];

export const xPublicationStatuses = [
  "needs_approval",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "rejected",
  "blocked"
] as const;
export type XPublicationStatus = (typeof xPublicationStatuses)[number];

export const xReviewModes = ["every_post", "spot_check", "jev_guarded"] as const;
export type XReviewMode = (typeof xReviewModes)[number];

/**
 * Audit record written by the Jev auto-review pass (review mode
 * "jev_guarded") and rendered as the review-console badge. Kept here with
 * the other job contracts so lib-side modules can parse it without
 * importing the review runner (which circularly imports the job store).
 */
export const autoReviewRecordSchema = z.object({
  model: z.string().min(1),
  decision: z.enum(["approved", "needs_human"]),
  reasons: z.array(z.string().min(1)).max(10),
  metrics: z.object({
    fabricatedSpecifics: z.number().min(0).max(1).nullable(),
    aiTell: z.number().min(0).max(1).nullable(),
    hardSell: z.number().min(0).max(1).nullable(),
    offBrandRisk: z.number().min(0).max(1).nullable(),
    quality: z.number().min(0).max(4).nullable()
  }),
  decidedAt: z.string().min(1)
});
export type AutoReviewRecord = z.infer<typeof autoReviewRecordSchema>;

// platforms.ts caps X threads at 12 tweets and 280 characters per tweet.
export const X_MAX_TWEETS_PER_THREAD = 12;
export const X_TWEET_CHAR_LIMIT = 280;

export const xTweetDraftSchema = z.object({
  text: z.string().min(1).max(X_TWEET_CHAR_LIMIT),
  mediaUrl: z.string().url().nullable()
});

export type XTweetDraft = z.infer<typeof xTweetDraftSchema>;

export const xContentSnapshotSchema = z
  .object({
    kind: z.enum(xPublicationKinds),
    tweets: z.array(xTweetDraftSchema).min(1).max(X_MAX_TWEETS_PER_THREAD),
    replyToTweetId: z.string().regex(/^[0-9]{1,32}$/).nullable(),
    quoteTweetId: z.string().regex(/^[0-9]{1,32}$/).nullable(),
    // Frozen copy of the target post a reply answers, captured at discovery
    // time so the review console can render a Twitter-style quote card
    // without spending X API reads.
    replyContext: z
      .object({
        handle: z.string().regex(/^@?[A-Za-z0-9_]{1,15}$/),
        text: z.string().min(1).max(400)
      })
      .nullable()
      .optional(),
    language: z.literal("en"),
    topic: z.object({
      source: z.enum(["radar", "watchlist", "manual"]),
      ref: z.string().min(1).max(512),
      title: z.string().min(1).max(512)
    }),
    notes: z.string().max(4_000).nullable()
  })
  .superRefine((value, ctx) => {
    if (value.kind === "post" && value.tweets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A single post must contain exactly one tweet."
      });
    }
    if (value.kind === "thread" && value.tweets.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A thread must contain at least two tweets."
      });
    }
    if (value.kind === "reply") {
      if (!value.replyToTweetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A reply must reference the target tweet."
        });
      }
      if (value.tweets.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A reply must be exactly one tweet."
        });
      }
    }
    if (value.kind !== "reply" && value.replyToTweetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only replies may set a target tweet."
      });
    }
  });

export type XContentSnapshot = z.infer<typeof xContentSnapshotSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export async function fingerprintXContentSnapshot(
  snapshot: XContentSnapshot
): Promise<string> {
  const canonical = JSON.stringify(canonicalize(xContentSnapshotSchema.parse(snapshot)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function describeXPublicationStatus(status: XPublicationStatus, lang: "zh" | "en" = "zh"): string {
  const labels: Record<XPublicationStatus, Record<"zh" | "en", string>> = {
    needs_approval: { zh: "待审核", en: "Awaiting review" },
    scheduled: { zh: "已排期", en: "Scheduled" },
    publishing: { zh: "发布中", en: "Publishing" },
    published: { zh: "已发布", en: "Published" },
    failed: { zh: "失败", en: "Failed" },
    cancelled: { zh: "已取消", en: "Cancelled" },
    rejected: { zh: "已拒绝", en: "Rejected" },
    blocked: { zh: "已阻断", en: "Blocked" }
  };
  return labels[status][lang];
}
