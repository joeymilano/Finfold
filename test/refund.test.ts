import { describe, it, expect } from "vitest";
import { isWithinRefundWindow, REFUND_WINDOW_MS } from "../lib/payment/creem-management";

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now" so assertions are deterministic.
const NOW = new Date("2026-07-11T12:00:00Z").getTime();

describe("REFUND_WINDOW_MS", () => {
  it("is exactly 3 days", () => {
    expect(REFUND_WINDOW_MS).toBe(3 * DAY);
  });
});

describe("isWithinRefundWindow", () => {
  it("accepts a charge from 2 days ago", () => {
    expect(isWithinRefundWindow(new Date(NOW - 2 * DAY).toISOString(), NOW)).toBe(true);
  });

  it("accepts a charge from just inside 3 days", () => {
    const justInside = new Date(NOW - (3 * DAY - 60_000)).toISOString();
    expect(isWithinRefundWindow(justInside, NOW)).toBe(true);
  });

  it("rejects a charge from 4 days ago (outside the window)", () => {
    expect(isWithinRefundWindow(new Date(NOW - 4 * DAY).toISOString(), NOW)).toBe(false);
  });

  it("rejects a charge exactly at 3 days + 1 second", () => {
    const justOutside = new Date(NOW - (3 * DAY + 1000)).toISOString();
    expect(isWithinRefundWindow(justOutside, NOW)).toBe(false);
  });

  it("rejects a future-dated charge (can't refund before being charged)", () => {
    expect(isWithinRefundWindow(new Date(NOW + DAY).toISOString(), NOW)).toBe(false);
  });

  it("fails closed when the charge date is missing", () => {
    expect(isWithinRefundWindow(undefined, NOW)).toBe(false);
    expect(isWithinRefundWindow(null, NOW)).toBe(false);
    expect(isWithinRefundWindow("", NOW)).toBe(false);
  });

  it("fails closed when the charge date is unparseable", () => {
    expect(isWithinRefundWindow("not-a-date", NOW)).toBe(false);
  });

  it("accepts a charge from exactly now", () => {
    expect(isWithinRefundWindow(new Date(NOW).toISOString(), NOW)).toBe(true);
  });
});
