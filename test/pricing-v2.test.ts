import { afterEach, describe, expect, it } from "vitest";
import {
  ENTERPRISE_SECTION,
  PRICING_PLAN_ORDER,
  PRICING_PLANS,
  buildEnterpriseContactHref,
  entitlementPlanName,
  formatPlanPrice,
  marketForLocale
} from "@/lib/pricing";
import { PLAN_CREDITS, PLAN_MONTHLY_LIMITS, PLAN_PLATFORM_LIMITS } from "@/lib/payment/types";
import { creemProvider } from "@/lib/payment/creem";
import { resolveCreemPlanId } from "@/lib/payment/creem-webhook";
import { dashboardCopy } from "@/lib/i18n";
import { getFounderWelcomeBody } from "@/lib/founder-email";

const V2_ENV_KEYS = [
  "CREEM_API_KEY",
  "BILLING_CN_STARTER_PRICE_ID",
  "BILLING_CN_CREATOR_PRICE_ID",
  "BILLING_CN_GROWTH_PRICE_ID",
  "BILLING_CN_DIGITAL_EMPLOYEE_PRICE_ID",
  "BILLING_GLOBAL_STARTER_PRICE_ID",
  "BILLING_GLOBAL_CREATOR_PRICE_ID",
  "BILLING_GLOBAL_GROWTH_PRICE_ID",
  "BILLING_GLOBAL_DIGITAL_EMPLOYEE_PRICE_ID"
];

describe("Pricing V2", () => {
  afterEach(() => {
    for (const key of V2_ENV_KEYS) delete process.env[key];
  });

  it("keeps the five-plan ladder and independent localized prices", () => {
    expect(PRICING_PLAN_ORDER).toEqual(["free", "starter", "creator", "growth", "digital_employee"]);
    expect(PRICING_PLAN_ORDER.map((key) => formatPlanPrice(PRICING_PLANS[key], "cn")))
      .toEqual(["¥0", "¥79", "¥199", "¥999", "¥2,999"]);
    expect(PRICING_PLAN_ORDER.map((key) => formatPlanPrice(PRICING_PLANS[key], "global")))
      .toEqual(["$0", "$12", "$29", "$149", "$399"]);
    expect(marketForLocale("zh")).toBe("cn");
    expect(marketForLocale("en")).toBe("global");
  });

  it("uses AI Credits consistently as the public and internal usage unit", () => {
    expect(PRICING_PLANS.free.copy.en.allowance).toBe("50 AI Credits / month");
    expect(PRICING_PLANS.starter.copy.en.allowance).toBe("600 AI Credits / month");
    expect(PRICING_PLANS.creator.copy.zh.allowance).toBe("每月 3,000 创作点数");
    expect(PRICING_PLANS.growth.copy.zh.allowance).toBe("每月 7,500 创作点数");
    expect(PRICING_PLANS.digital_employee.copy.zh.allowance).toContain("50,000 创作点数");
    expect(PLAN_CREDITS.starter_v2).toBe(600);
    expect(PLAN_CREDITS.creator_v2).toBe(3_000);
    expect(PLAN_CREDITS.growth_v2).toBe(7_500);
    expect(PLAN_MONTHLY_LIMITS.starter_v2).toBe(20);
    expect(PLAN_PLATFORM_LIMITS.starter_v2).toBe(14);
    expect(dashboardCopy.zh.revenueItems.map((item) => item.price))
      .toEqual(["¥0/月", "¥79/月", "¥199/月", "¥999/月", "¥2,999/月"]);
    expect(dashboardCopy.en.revenueItems.map((item) => item.price))
      .toEqual(["$0/month", "$12/month", "$29/month", "$149/month", "$399/month"]);
  });

  it("keeps the welcome email aligned with the free-plan entitlement", () => {
    const zh = getFounderWelcomeBody("zh");
    const en = getFounderWelcomeBody("en");

    expect(zh).toContain("50 创作点数");
    expect(zh).toContain("3 个核心平台");
    expect(zh).not.toContain("3 份内容包");
    expect(en).toContain("50 AI Credits");
    expect(en).toContain("3 core platforms");
    expect(en).not.toContain("3 free content kits");
  });

  it("shows stored plan ids with current names instead of legacy badges", () => {
    expect(entitlementPlanName("starter", "zh")).toBe("入门版");
    expect(entitlementPlanName("pro", "zh")).toBe("创作者");
    expect(entitlementPlanName("growth", "zh")).toBe("增长引擎");
    expect(entitlementPlanName("employee", "zh")).toBe("数字员工");
    expect(entitlementPlanName("employee", "en")).toBe("Digital Employee");
  });

  it("uses separate CN and global checkout products with complete metadata", async () => {
    process.env.BILLING_CN_STARTER_PRICE_ID = "prod_cn_starter";
    process.env.BILLING_GLOBAL_STARTER_PRICE_ID = "prod_global_starter";

    const cn = await creemProvider.createCheckout({
      plan: "starter_v2",
      publicPlan: "starter",
      locale: "zh",
      market: "cn",
      currency: "CNY",
      price: 79,
      userId: "user_123",
      successUrl: "https://finfold.app/dashboard",
      cancelUrl: "https://finfold.app/billing"
    });
    const global = await creemProvider.createCheckout({
      plan: "starter_v2",
      publicPlan: "starter",
      locale: "en",
      market: "global",
      currency: "USD",
      price: 12,
      userId: "user_123",
      successUrl: "https://finfold.app/dashboard",
      cancelUrl: "https://finfold.app/billing"
    });

    const cnUrl = new URL(cn.url);
    const globalUrl = new URL(global.url);
    expect(cnUrl.pathname).toBe("/payment/prod_cn_starter");
    expect(globalUrl.pathname).toBe("/payment/prod_global_starter");
    expect(cnUrl.searchParams.get("metadata[market]")).toBe("cn");
    expect(globalUrl.searchParams.get("metadata[market]")).toBe("global");
    expect(cnUrl.searchParams.get("metadata[locale]")).toBe("zh");
    expect(globalUrl.searchParams.get("metadata[locale]")).toBe("en");
    expect(cnUrl.searchParams.get("metadata[plan]")).toBe("starter_v2");
    expect(cnUrl.searchParams.get("metadata[plan_key]")).toBe("starter");
    expect(cnUrl.searchParams.get("metadata[price]")).toBe("79");
  });

  it("maps market-specific webhook products to versioned entitlements", () => {
    process.env.BILLING_CN_CREATOR_PRICE_ID = "prod_cn_creator";
    process.env.BILLING_GLOBAL_CREATOR_PRICE_ID = "prod_global_creator";

    expect(resolveCreemPlanId({ productId: "prod_cn_creator" })).toBe("creator_v2");
    expect(resolveCreemPlanId({ productId: "prod_global_creator" })).toBe("creator_v2");
    expect(resolveCreemPlanId({ metadataPlan: "creator_v2" })).toBe("creator_v2");

    process.env.BILLING_CN_GROWTH_PRICE_ID = "prod_cn_growth";
    expect(resolveCreemPlanId({ productId: "prod_cn_growth" })).toBe("growth_v2");
  });

  it("keeps the enterprise section sales-led and out of the paid plan ladder", () => {
    for (const locale of ["zh", "en"] as const) {
      const copy = ENTERPRISE_SECTION[locale];
      expect(copy.eyebrow.length).toBeGreaterThan(0);
      expect(copy.title).not.toMatch(/[。.]/);
      expect(copy.subtitle).not.toMatch(/[。.]/);
      expect(copy.features.length).toBe(8);
      expect(copy.cta.length).toBeGreaterThan(0);
    }
    expect(ENTERPRISE_SECTION.zh.cta).toBe("联系销售");
    expect(ENTERPRISE_SECTION.en.cta).toBe("Contact Sales");
    expect(ENTERPRISE_SECTION.en.features).toContain("Performance-based pricing available");
    expect(PRICING_PLAN_ORDER).not.toContain("enterprise");
    expect(buildEnterpriseContactHref("en")).toContain("mailto:support@finfold.app");
    expect(buildEnterpriseContactHref("en")).toContain("Enterprise%20inquiry");
    expect(buildEnterpriseContactHref("zh")).toContain(encodeURIComponent("企业版咨询"));
  });
});
