import { describe, expect, it } from "vitest";
import {
  canUsePaidFeatures,
  getActiveSubscription,
  getPlanFeatures,
  getPlanModelTier,
  getPlanMonthlyLimit,
  getPlanPlatformLimit,
  resolveEffectivePlan
} from "@/lib/payment/entitlements";

describe("payment entitlements", () => {
  it("does not unlock paid features from profile plan alone", () => {
    expect(canUsePaidFeatures("pro", null)).toBe(false);
  });

  it("unlocks paid features for active paid subscriptions", () => {
    expect(canUsePaidFeatures("starter", { status: "active" })).toBe(true);
    expect(canUsePaidFeatures("pro", { status: "past_due" })).toBe(true);
  });

  it("does not unlock paid features for canceled or expired subscriptions", () => {
    expect(canUsePaidFeatures("pro", { status: "canceled" })).toBe(false);
    expect(canUsePaidFeatures("employee", { status: "expired" })).toBe(false);
  });

  it("only keeps scheduled cancellations active until the period ends", () => {
    expect(
      canUsePaidFeatures("pro", {
        status: "scheduled_cancel",
        currentPeriodEnd: "2099-01-01T00:00:00.000Z"
      })
    ).toBe(true);

    expect(
      canUsePaidFeatures("pro", {
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

  it("resolves the effective plan to free when the subscription is not active", () => {
    expect(resolveEffectivePlan("employee", { status: "canceled" })).toBe("free");
    expect(resolveEffectivePlan("employee", { status: "active" })).toBe("employee");
    expect(resolveEffectivePlan(null, null)).toBe("free");
  });

  it("gates platform count and model tier by plan", () => {
    expect(getPlanMonthlyLimit("free")).toBe(1);
    expect(getPlanPlatformLimit("free")).toBe(3);
    expect(getPlanPlatformLimit("starter")).toBe(6);
    expect(getPlanPlatformLimit("pro")).toBe(14);
    expect(getPlanPlatformLimit("employee")).toBe(14);

    expect(getPlanModelTier("free")).toBe("haiku");
    expect(getPlanModelTier("starter")).toBe("haiku");
    expect(getPlanModelTier("growth")).toBe("sonnet");
    expect(getPlanModelTier("employee")).toBe("opus");
  });

  it("gates feature flags by plan", () => {
    expect(getPlanFeatures("free").canUseOutputs).toBe(true);
    expect(getPlanFeatures("free").canAnalyze).toBe(true);
    expect(getPlanFeatures("starter").urlBootstrap).toBe(false);
    expect(getPlanFeatures("pro").urlBootstrap).toBe(true);
    expect(getPlanFeatures("pro").iterateReport).toBe(false);
    expect(getPlanFeatures("growth").iterateReport).toBe(true);
    expect(getPlanFeatures("employee").proactiveMonitoring).toBe(true);
    expect(getPlanFeatures("growth").proactiveMonitoring).toBe(false);
  });
});
