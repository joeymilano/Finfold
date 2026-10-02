import { describe, expect, it } from "vitest";
import {
  buildPlanApplicationHref,
  getBillingPlanAcquisition,
  getGrowthCheckoutMode
} from "@/lib/billing-plan-acquisition";

describe("billing plan acquisition", () => {
  it("keeps Starter, Creator, and Growth on direct checkout", () => {
    expect(getBillingPlanAcquisition("starter", "zh")).toEqual({
      kind: "checkout",
      cta: "开始使用",
      availabilityNote: null
    });
    expect(getBillingPlanAcquisition("creator", "en")).toEqual({
      kind: "checkout",
      cta: "Upgrade to Creator",
      availabilityNote: null
    });
    expect(getBillingPlanAcquisition("growth", "zh")).toEqual({
      kind: "checkout",
      cta: "升级增长引擎",
      availabilityNote: null
    });
  });

  it("keeps Digital Employee on an explicit application instead of checkout", () => {
    const employee = getBillingPlanAcquisition("digital_employee", "en");

    expect(employee.kind).toBe("application");
    expect(employee.cta).toBe("Apply for access");
    expect(employee.availabilityNote).toContain("before activation");
  });

  it("only uses the in-place Growth upgrade for Creem subscriptions", () => {
    expect(getGrowthCheckoutMode("free", null)).toBe("new_checkout");
    expect(getGrowthCheckoutMode("creator_v2", "creem")).toBe("creem_upgrade");
    expect(getGrowthCheckoutMode("creator_v2", "alipay_qrcode")).toBe("assisted_migration");
    expect(getGrowthCheckoutMode("starter_v2", null)).toBe("assisted_migration");
  });

  it("builds a reviewable support request without starting payment", () => {
    const href = buildPlanApplicationHref("digital_employee", "en");

    expect(href).toMatch(/^mailto:support@finfold\.app\?/);
    expect(decodeURIComponent(href)).toContain("Digital Employee access request");
    expect(decodeURIComponent(href)).toContain("confirm the model, allowance, and billing");
  });
});
