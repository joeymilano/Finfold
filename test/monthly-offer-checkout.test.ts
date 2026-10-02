import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creemProvider } from "@/lib/payment/creem";
import { MONTHLY_OFFER, monthlyOfferPrice } from "@/lib/payment/monthly-offer";

const product = { id: "prod_starter", status: "active", price: 1200, currency: "USD", billing_type: "recurring", billing_period: "every-month", tax_mode: "inclusive" };
const discount = { code: MONTHLY_OFFER.code, status: "active", type: "percentage", percentage: 10, duration: "forever", applies_to_products: [product.id] };
const params = { plan: "starter_v2" as const, publicPlan: "starter" as const, market: "cn" as const, autoRenew: true, userId: "user_123", successUrl: "https://finfold.app/dashboard", cancelUrl: "https://finfold.app/billing" };
let remoteProduct: Record<string, unknown>;
let remoteDiscount: Record<string, unknown>;

beforeEach(() => {
  vi.stubEnv("CREEM_API_KEY", "creem_test_fake");
  vi.stubEnv("BILLING_CN_STARTER_PRICE_ID", product.id);
  remoteProduct = { ...product };
  remoteDiscount = { ...discount };
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes("/products?") ? remoteProduct : String(url).includes("/discounts?") ? remoteDiscount : { checkout_url: "https://creem.io/test-checkout" } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("recurring discount checkout", () => {
  it("applies the continuing 10% offer to the real checkout and records consent", async () => {
    await creemProvider.createCheckout(params);
    const calls = vi.mocked(fetch).mock.calls;
    const post = calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ product_id: product.id, discount_code: MONTHLY_OFFER.code,
      metadata: { auto_renew: "true", price: "10.8", renewal_consent_version: "2026-09-07" } });
    expect(body).not.toHaveProperty("custom_price");
    expect(monthlyOfferPrice(29)).toBe(26.1);
    expect(monthlyOfferPrice(149)).toBe(134.1);
  });

  it.each([
    { duration: "once" }, { percentage: 20 }, { applies_to_products: ["prod_other"] },
    { status: "inactive" }, { expiry_date: "2020-01-01" }, { max_redemptions: 1, redeem_count: 1 }
  ])("refuses a mismatched or unusable offer: %j", async (patch) => {
    Object.assign(remoteDiscount, patch);
    await expect(creemProvider.createCheckout(params)).rejects.toThrow("configuration");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it.each([{ price: 1500 }, { billing_type: "onetime" }, { billing_period: "every-year" }, { currency: "EUR" }, { tax_mode: "exclusive" }, { trial_period_days: 7 }])("rejects a product inconsistent with the price disclosure: %j", async (patch) => {
    Object.assign(remoteProduct, patch);
    await expect(creemProvider.createCheckout(params)).rejects.toThrow("configuration");
  });

  it("does not fall back to a full-price payment link without an API key", async () => {
    vi.stubEnv("CREEM_API_KEY", "");
    await expect(creemProvider.createCheckout(params)).rejects.toThrow("unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an explicit opt-out", async () => {
    await expect(creemProvider.createCheckout({ ...params, autoRenew: false })).rejects.toThrow("select monthly");
    expect(fetch).not.toHaveBeenCalled();
  });
});
