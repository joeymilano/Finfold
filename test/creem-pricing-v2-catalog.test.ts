import { describe, expect, it } from "vitest";
import { CREEM_PRICING_V2_PRODUCTS } from "../scripts/creem-pricing-v2-catalog.mjs";
import { SUPPORTED_PLATFORM_COUNT } from "@/lib/platforms";

describe("Creem Pricing V2 product catalog", () => {
  it("contains one localized monthly product for every paid plan and market", () => {
    expect(CREEM_PRICING_V2_PRODUCTS).toHaveLength(8);
    expect(CREEM_PRICING_V2_PRODUCTS.map((product) => product.envKey)).toEqual([
      "BILLING_CN_STARTER_PRICE_ID",
      "BILLING_CN_CREATOR_PRICE_ID",
      "BILLING_CN_GROWTH_PRICE_ID",
      "BILLING_CN_DIGITAL_EMPLOYEE_PRICE_ID",
      "BILLING_GLOBAL_STARTER_PRICE_ID",
      "BILLING_GLOBAL_CREATOR_PRICE_ID",
      "BILLING_GLOBAL_GROWTH_PRICE_ID",
      "BILLING_GLOBAL_DIGITAL_EMPLOYEE_PRICE_ID"
    ]);
    expect(CREEM_PRICING_V2_PRODUCTS.every((product) => product.billingType === "recurring")).toBe(true);
    expect(CREEM_PRICING_V2_PRODUCTS.every((product) => product.billingPeriod === "every-month")).toBe(true);
    expect(CREEM_PRICING_V2_PRODUCTS.every((product) => product.taxMode === "inclusive")).toBe(true);
  });

  it("keeps Creem minor-unit prices aligned with the public Pricing V2 ladder", () => {
    expect(CREEM_PRICING_V2_PRODUCTS.map((product) => [product.currency, product.price])).toEqual([
      ["USD", 1_200],
      ["USD", 2_900],
      ["USD", 14_900],
      ["USD", 39_900],
      ["USD", 1_200],
      ["USD", 2_900],
      ["USD", 14_900],
      ["USD", 39_900]
    ]);
    expect(CREEM_PRICING_V2_PRODUCTS.every((product) => product.description.length >= 40)).toBe(true);
  });

  it("keeps Starter checkout copy aligned with the supported platform library", () => {
    const starterProducts = CREEM_PRICING_V2_PRODUCTS.filter((product) => product.planKey === "starter");

    expect(starterProducts).toHaveLength(2);
    expect(starterProducts.every((product) => product.description.includes(String(SUPPORTED_PLATFORM_COUNT)))).toBe(true);
  });
});
