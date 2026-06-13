import { describe, expect, it } from "vitest";
import { canUsePaidFeatures, getActiveSubscription } from "@/lib/payment/entitlements";

describe("payment entitlements", () => {
  it("does not unlock paid features from profile plan alone", () => {
    expect(canUsePaidFeatures("creator", null)).toBe(false);
  });

  it("unlocks paid features for active paid subscriptions", () => {
    expect(canUsePaidFeatures("starter", { status: "active" })).toBe(true);
    expect(canUsePaidFeatures("pro", { status: "past_due" })).toBe(true);
  });

  it("does not unlock paid features for canceled or expired subscriptions", () => {
    expect(canUsePaidFeatures("creator", { status: "canceled" })).toBe(false);
    expect(canUsePaidFeatures("team", { status: "expired" })).toBe(false);
  });

  it("only keeps scheduled cancellations active until the period ends", () => {
    expect(
      canUsePaidFeatures("creator", {
        status: "scheduled_cancel",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z"
      })
    ).toBe(true);

    expect(
      canUsePaidFeatures("creator", {
        status: "scheduled_cancel",
        currentPeriodEnd: "2000-01-01T00:00:00.000Z"
      })
    ).toBe(false);
  });

  it("selects the best active subscription from multiple records", () => {
    const active = getActiveSubscription([
      { status: "expired", currentPeriodEnd: "2099-01-01T00:00:00.000Z" },
      { status: "active", currentPeriodEnd: "2099-02-01T00:00:00.000Z" }
    ]);

    expect(active?.status).toBe("active");
  });
});
