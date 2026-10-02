import { describe, expect, it } from "vitest";
import {
  AUTO_DAY_LIMIT,
  AUTO_FAIL_STOP,
  commentKey,
  emptyLedger,
  isHandled,
  markHandled,
  nextAutoTarget,
  restoreLedger,
  rollLedger
} from "./autopilot";

const amy = { text: "How much is it?", author: "Amy" };
const bob = { text: "Nice post", author: "Bob" };

describe("autopilot ledger", () => {
  it("keys comments by platform, author and text", () => {
    expect(commentKey("linkedin", amy)).not.toBe(commentKey("xiaohongshu", amy));
    expect(commentKey("linkedin", amy)).not.toBe(commentKey("linkedin", { ...amy, author: "Andy" }));
    const long = "a".repeat(120);
    expect(commentKey("linkedin", { ...amy, text: long })).toBe(commentKey("linkedin", { ...amy, text: `${long}tail edits beyond the key window` }));
  });

  it("returns every unhandled comment once, in capture order", () => {
    const ledger = emptyLedger();
    const first = nextAutoTarget("xiaohongshu", [amy, bob], ledger)!;
    expect(first.text).toBe(amy.text);
    markHandled(ledger, "xiaohongshu", first, "sent");
    expect(isHandled(ledger, "xiaohongshu", amy)).toBe(true);
    const second = nextAutoTarget("xiaohongshu", [amy, bob], ledger)!;
    expect(second.text).toBe(bob.text);
    markHandled(ledger, "xiaohongshu", second, "sent");
    expect(nextAutoTarget("xiaohongshu", [amy, bob], ledger)).toBeNull();
  });

  it("stops at the client daily cap and while paused", () => {
    const capped = { ...emptyLedger(), generatedToday: AUTO_DAY_LIMIT };
    expect(nextAutoTarget("linkedin", [amy], capped)).toBeNull();
    const paused = { ...emptyLedger(), pausedReason: "failures" as const };
    expect(nextAutoTarget("linkedin", [amy], paused)).toBeNull();
  });

  it("resets counters on day rollover and prunes week-old handled entries", () => {
    const ledger = emptyLedger(new Date("2026-09-17T12:00:00"));
    markHandled(ledger, "linkedin", amy, "sent", new Date("2026-09-17T12:00:00").getTime());
    ledger.generatedToday = AUTO_DAY_LIMIT;
    ledger.failures = AUTO_FAIL_STOP;
    ledger.pausedReason = "failures";
    const rolled = rollLedger(ledger, new Date("2026-09-18T09:00:00"));
    expect(rolled.generatedToday).toBe(0);
    expect(rolled.failures).toBe(0);
    expect(rolled.pausedReason).toBe("");
    expect(isHandled(rolled, "linkedin", amy)).toBe(true);

    const stale = rollLedger(ledger, new Date("2026-09-28T09:00:00"));
    expect(isHandled(stale, "linkedin", amy)).toBe(false);
  });

  it("discards corrupted persisted ledgers instead of crashing", () => {
    expect(restoreLedger(null).day).toBe(localToday());
    expect(restoreLedger({ day: 7 }).generatedToday).toBe(0);
    const valid = emptyLedger();
    markHandled(valid, "linkedin", amy, "sent");
    const restored = restoreLedger({ ...valid, pausedReason: "credits", handled: { junk: "not-an-entry", ...valid.handled } });
    expect(restored.pausedReason).toBe("credits");
    expect(isHandled(restored, "linkedin", amy)).toBe(true);
    expect(Object.keys(restored.handled)).not.toContain("junk");
  });
});

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
