import { z } from "zod";

// The reply pilot's platforms. The extension sends the same literal in draft,
// outcome and locate calls; "x" is x.com/twitter.com.
export const replyPlatformSchema = z.enum(["xiaohongshu", "linkedin", "x"]);

// commentImage mirrors the locate endpoint's screenshot rule: a base64
// jpeg/png data URL, compressed client-side. The comment text may be empty
// only when a screenshot of the comment is attached.
export const replyDraftRequestSchema = z.object({
  requestId: z.string().uuid(),
  platform: replyPlatformSchema,
  comment: z.string().trim().max(2_000).default(""),
  commentImage: z.string()
    .regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/, "Comment image must be a base64 jpeg/png data URL")
    .max(1_500_000)
    .optional(),
  postContext: z.string().trim().max(4_000).default(""),
  conversation: z.string().trim().max(2_000).default(""),
  intent: z.string().trim().max(1_000).default(""),
  language: z.enum(["auto", "zh", "en"]).default("auto")
}).strict().refine((data) => data.comment.length > 0 || Boolean(data.commentImage), {
  message: "Either the comment text or a comment screenshot is required"
});

// A missing fact is a successful analysis, not an invitation to invent a reply.
export const replyDraftResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("draft"),
    body: z.string().trim().min(1).max(3_000),
    factsToCheck: z.array(z.string().trim().min(1).max(300)).max(5)
  }).strict(),
  z.object({
    status: z.literal("needs_context"),
    body: z.literal(""),
    factsToCheck: z.array(z.string().trim().min(1).max(300)).min(1).max(5)
  }).strict()
]);

export type ReplyDraftRequest = z.infer<typeof replyDraftRequestSchema>;
export type ReplyDraftResult = z.infer<typeof replyDraftResultSchema>;

// What the extension's tiered send actually achieved (DOM → vision → copy).
// Telemetry only: no comment or reply text ever travels with it.
export const replyOutcomeRequestSchema = z.object({
  requestId: z.string().uuid(),
  platform: replyPlatformSchema,
  outcome: z.enum(["sent", "typed", "copied", "failed"])
}).strict();

export type ReplyPilotMode = "off" | "whitelist" | "open";

export function replyPilotMode(): ReplyPilotMode {
  const raw = (process.env.FINFOLD_EXTENSION_REPLY_PILOT_MODE ?? "whitelist").trim().toLowerCase();
  return raw === "open" || raw === "off" ? raw : "whitelist";
}

// FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED stays the one-key kill switch for
// every mode; an unset or unknown mode falls back to the ID whitelist so an
// existing deployment behaves identically until it opts into "open".
export function replyDraftEnabled(userId: string): boolean {
  if (process.env.FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED !== "true") return false;
  const mode = replyPilotMode();
  if (mode === "off") return false;
  if (mode === "open") return true;
  return (process.env.FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

// Best-effort platform-risk guard on top of credit billing; unparseable
// values fall back to the default rather than blocking paying users.
export function replyDailyLimit(): number {
  const parsed = Number.parseInt(process.env.FINFOLD_EXTENSION_REPLY_DAILY_LIMIT ?? "30", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}
