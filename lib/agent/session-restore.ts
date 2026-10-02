/**
 * Shared "most recent Agent conversation" pointer.
 *
 * Both the full-page conversation (/dashboard) and the side rail restore from
 * this key, so returning from any product surface lands back in the latest
 * conversation instead of a blank new-chat state. A new chat only starts when
 * the user explicitly taps "new chat" (or arrives with a fresh task prompt).
 */
export const LAST_AGENT_SESSION_KEY = "finfold-global-agent-session-v1";

export function readLastAgentSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_AGENT_SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberLastAgentSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_AGENT_SESSION_KEY, sessionId);
  } catch {
    // Storage may be unavailable (private mode). The conversation still works
    // for this page load; it just cannot be restored on the next visit.
  }
}

export function clearLastAgentSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_AGENT_SESSION_KEY);
  } catch {
    // Clearing is best-effort and must never block a new conversation.
  }
}
