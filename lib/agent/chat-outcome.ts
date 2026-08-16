export const AGENT_CHAT_OUTCOMES = [
  "completed",
  "awaiting_confirmation",
  "failed"
] as const;

export type AgentChatOutcome = (typeof AGENT_CHAT_OUTCOMES)[number];

export function isAgentChatOutcome(value: unknown): value is AgentChatOutcome {
  return typeof value === "string"
    && AGENT_CHAT_OUTCOMES.includes(value as AgentChatOutcome);
}

export function isPendingAgentConfirmation(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.confirmationRequired === true
    || Boolean(result.pendingAction && typeof result.pendingAction === "object");
}

/**
 * Resolve the final user-visible content without treating a successful
 * tool-only turn as a failed Agent reply. The pending-action fallback keeps
 * rolling deployments compatible with servers that predate the typed
 * `outcome` field.
 */
export function resolveAgentTerminalContent({
  assistantText,
  streamError,
  outcome,
  hasPendingConfirmation,
  fallback
}: {
  assistantText: string;
  streamError: string | null;
  outcome: AgentChatOutcome | null;
  hasPendingConfirmation: boolean;
  fallback: string;
}): string {
  if (assistantText) return assistantText;
  if (streamError) return streamError;
  if (outcome === "awaiting_confirmation" || hasPendingConfirmation) return "";
  return fallback;
}
