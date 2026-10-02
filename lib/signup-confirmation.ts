const KEY = "finfold-email-confirmation-v1";
type ConfirmationState = { email: string; retryAt: number; pending: boolean };

export function rememberEmailConfirmation(email: string, seconds: number, pending: boolean, now = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), retryAt: now + Math.min(3600, Math.max(1, seconds)) * 1000, pending }));
  } catch { /* Provider rate limits remain authoritative if storage is unavailable. */ }
}

export function readEmailConfirmation(email: string, now = Date.now()): { seconds: number; pending: boolean } | null {
  try {
    const state = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as ConfirmationState | null;
    if (!state || state.email !== email.trim().toLowerCase() || !Number.isFinite(state.retryAt) || typeof state.pending !== "boolean" || state.retryAt > now + 3600_000 || now - state.retryAt > 24 * 3600_000) return null;
    return { seconds: Math.max(0, Math.ceil((state.retryAt - now) / 1000)), pending: state.pending };
  } catch { return null; }
}
