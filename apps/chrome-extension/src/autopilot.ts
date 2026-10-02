import type { CapturedComment, ReplyPlatform } from "./types";

// Autopilot bookkeeping, kept as plain data so the whole policy (dedup, daily
// cap, circuit breaker) is unit-testable without a browser. The panel layer
// owns one AutoLedger, persists it in chrome.storage.local, and consults it
// before starting each generate-and-send cycle.

export type AutoOutcome = "sent" | "typed" | "failed" | "needs_context" | "error";
export type AutoPause = "" | "failures" | "daily_limit" | "credits" | "server_limit";
export type AutoLogEntry = { at: number; comment: string; outcome: AutoOutcome; detail?: string };
export type HandledEntry = { platform: ReplyPlatform; text: string; outcome: AutoOutcome; at: number };

export type AutoLedger = {
  // Local calendar day (YYYY-MM-DD); counters reset when it rolls over.
  day: string;
  // Client-side generation cap for one day, independent of the server limit.
  generatedToday: number;
  // Consecutive generation failures; AUTO_FAIL_STOP in a row pauses the pilot.
  failures: number;
  pausedReason: AutoPause;
  handled: Record<string, HandledEntry>;
};

export const AUTO_DAY_LIMIT = 30;
export const AUTO_FAIL_STOP = 3;
export const HANDLED_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const AUTO_LEDGER_KEY = "finfoldAutoLedger";
export const AUTO_SWITCH_KEY = "finfoldAutoPilot";

export function commentKey(platform: string, comment: CapturedComment): string {
  return `${platform}:${comment.author.slice(0, 40)}:${comment.text.slice(0, 120)}`;
}

export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function emptyLedger(now = new Date()): AutoLedger {
  return { day: localDay(now), generatedToday: 0, failures: 0, pausedReason: "", handled: {} };
}

// Day rollover resets the counters and prunes handled entries older than a
// week, so the ledger never grows unbounded.
export function rollLedger(ledger: AutoLedger, now = new Date()): AutoLedger {
  const day = localDay(now);
  if (ledger.day === day) return ledger;
  const cutoff = now.getTime() - HANDLED_TTL_MS;
  const handled: Record<string, HandledEntry> = {};
  for (const [key, entry] of Object.entries(ledger.handled)) if (entry.at >= cutoff) handled[key] = entry;
  return { day, generatedToday: 0, failures: 0, pausedReason: "", handled };
}

export function isHandled(ledger: AutoLedger, platform: string, comment: CapturedComment): boolean {
  return Boolean(ledger.handled[commentKey(platform, comment)]);
}

// Picks the first captured comment the pilot has not processed yet. The
// ledger's own pause reasons gate it; callers re-check session-level limits.
export function nextAutoTarget(platform: ReplyPlatform, comments: CapturedComment[], ledger: AutoLedger): CapturedComment | null {
  if (ledger.pausedReason !== "") return null;
  if (ledger.generatedToday >= AUTO_DAY_LIMIT) return null;
  return comments.find((comment) => !isHandled(ledger, platform, comment)) ?? null;
}

export function markHandled(ledger: AutoLedger, platform: ReplyPlatform, comment: CapturedComment, outcome: AutoOutcome, now = Date.now()): void {
  ledger.handled[commentKey(platform, comment)] = { platform, text: comment.text.slice(0, 300), outcome, at: now };
}

// Restores a persisted ledger, discarding corrupted shapes instead of
// crashing the panel; anything unreadable restarts from a fresh ledger.
export function restoreLedger(value: unknown, now = new Date()): AutoLedger {
  if (!value || typeof value !== "object") return emptyLedger(now);
  const raw = value as Partial<AutoLedger>;
  if (typeof raw.day !== "string" || typeof raw.generatedToday !== "number" || typeof raw.failures !== "number") return emptyLedger(now);
  const paused: AutoPause = ["", "failures", "daily_limit", "credits", "server_limit"].includes(raw.pausedReason as string)
    ? (raw.pausedReason as AutoPause) : "";
  const handled = raw.handled && typeof raw.handled === "object"
    ? Object.fromEntries(Object.entries(raw.handled).filter(([, entry]) =>
      entry && typeof entry === "object" && typeof (entry as HandledEntry).at === "number"))
    : {};
  return rollLedger({ day: raw.day, generatedToday: raw.generatedToday, failures: raw.failures, pausedReason: paused, handled }, now);
}
