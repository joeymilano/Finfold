import { afterEach, describe, expect, it } from "vitest";
import { creemProvider, hasCreemCheckoutTarget, isCreemFoundingMemberCheckoutConfigured } from "@/lib/payment/creem";

const CREEM_ENV_KEYS = [
  "CREEM_API_KEY",
  "CREEM_STARTER_PRODUCT_ID",
  "CREEM_PRO_PRODUCT_ID",
  "CREEM_GROWTH_PRODUCT_ID",
  "CREEM_EMPLOYEE_PRODUCT_ID",
  "CREEM_FOUNDING_MEMBER_PRODUCT_ID",
  "CREEM_STARTER_PAYMENT_LINK",
  "CREEM_PRO_PAYMENT_LINK",
  "CREEM_GROWTH_PAYMENT_LINK",
  "CREEM_EMPLOYEE_PAYMENT_LINK",
  "CREEM_FOUNDING_MEMBER_PAYMENT_LINK",
  "CREEM_STARTER_CHECKOUT_URL",
  "CREEM_PRO_CHECKOUT_URL",
  "CREEM_GROWTH_CHECKOUT_URL",
  "CREEM_EMPLOYEE_CHECKOUT_URL",
  "CREEM_FOUNDING_MEMBER_CHECKOUT_URL"
];

describe("Creem checkout provider", () => {
  afterEach(() => {
    for (const key of CREEM_ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("uses a hosted payment link when the API key is not configured", async () => {
    process.env.CREEM_PRO_PAYMENT_LINK = "https://creem.io/payment/pro_123?theme=dark";

    expect(creemProvider.isConfigured()).toBe(true);
    expect(hasCreemCheckoutTarget("pro")).toBe(true);

    const result = await creemProvider.createCheckout({
      plan: "pro",
      userId: "user_123",
      successUrl: "https://finfold.app/dashboard?upgraded=true",
      cancelUrl: "https://finfold.app/billing?cancelled=true"
    });

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://creem.io/payment/pro_123");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("metadata[user_id]")).toBe("user_123");
    expect(url.searchParams.get("metadata[plan]")).toBe("pro");
  });

  it("derives the hosted payment link from a Creem product id", async () => {
    process.env.CREEM_GROWTH_PRODUCT_ID = "prod_growth";

    expect(creemProvider.isConfigured()).toBe(true);
    expect(hasCreemCheckoutTarget("growth")).toBe(true);

    const result = await creemProvider.createCheckout({
      plan: "growth",
      userId: "user_123",
      successUrl: "https://finfold.app/dashboard?upgraded=true",
      cancelUrl: "https://finfold.app/billing?cancelled=true"
    });

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe("https://creem.io/payment/prod_growth");
    expect(url.searchParams.get("metadata[user_id]")).toBe("user_123");
    expect(url.searchParams.get("metadata[plan]")).toBe("growth");
  });

  it("detects the founding-member checkout target independently", async () => {
    expect(isCreemFoundingMemberCheckoutConfigured()).toBe(false);

    process.env.CREEM_FOUNDING_MEMBER_CHECKOUT_URL = "https://creem.io/payment/founding_123";

    expect(isCreemFoundingMemberCheckoutConfigured()).toBe(true);

    const result = await creemProvider.createCheckout({
      plan: "employee",
      userId: "user_123",
      foundingMember: true,
      successUrl: "https://finfold.app/dashboard?upgraded=true",
      cancelUrl: "https://finfold.app/billing?cancelled=true"
    });

    const url = new URL(result.url);
    expect(url.searchParams.get("metadata[user_id]")).toBe("user_123");
    expect(url.searchParams.get("metadata[plan]")).toBe("employee");
    expect(url.searchParams.get("metadata[founding_member]")).toBe("true");
  });
});
