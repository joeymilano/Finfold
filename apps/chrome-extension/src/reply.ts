import type { ReplyPlatform } from "./types";

export type ReplyInput = {
  platform: ReplyPlatform;
  comment: string;
  // Base64 jpeg data URL of the target comment's screenshot; "" when absent.
  // Kept inside the saved state so a closed panel can recover the request,
  // but replyIntent hashes it to a fingerprint to keep intent strings small.
  commentImage: string;
  postContext: string;
  conversation: string;
  intent: string;
  language: "auto" | "zh" | "en";
};
export type ReplyResult = {
  status: "draft" | "needs_context";
  body: string;
  factsToCheck: string[];
};
export type ReplyState = {
  userId: string;
  input: ReplyInput;
  result: ReplyResult | null;
  editedBody: string;
  resultIntent?: string;
  // Correlation id of the generation that produced `result`; used to report
  // the final send outcome back for reliability telemetry.
  resultRequestId?: string;
  pending?: { intent: string; requestId: string };
  savedAt: number;
};
export const EMPTY_REPLY: ReplyInput = {
  platform: "xiaohongshu", comment: "", commentImage: "", postContext: "", conversation: "", intent: "", language: "auto"
};
export function replyIntent(input: ReplyInput): string {
  return JSON.stringify({ ...input, comment: input.comment.trim(), commentImage: imageFingerprint(input.commentImage),
    postContext: input.postContext.trim(), conversation: input.conversation.trim(), intent: input.intent.trim() });
}
export function imageFingerprint(dataUrl: string): string {
  if (!dataUrl) return "";
  return `${dataUrl.length}:${dataUrl.slice(-32)}`;
}
export function restoreReply(value: unknown, userId: string, now = Date.now()): ReplyState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as ReplyState;
  if (state.userId !== userId || !Number.isFinite(state.savedAt) || now - state.savedAt >= 86_400_000
    || state.savedAt > now || !state.input || !["xiaohongshu", "linkedin"].includes(state.input.platform)) return null;
  if (!["comment", "postContext", "conversation", "intent"].every((key) => typeof state.input[key as keyof ReplyInput] === "string")
    || typeof state.input.commentImage !== "string"
    || !["auto", "zh", "en"].includes(state.input.language) || typeof state.editedBody !== "string") return null;
  if (state.result && (!Array.isArray(state.result.factsToCheck) || typeof state.result.body !== "string"
    || !["draft", "needs_context"].includes(state.result.status))) return null;
  return state;
}
