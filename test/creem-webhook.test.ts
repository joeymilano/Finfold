import { describe, expect, it } from "vitest";
import { buildCreemSubscriptionUpsert, resolveCreemPlanId } from "@/lib/payment/creem-webhook";

describe("Creem webhook helpers", () => {
  it("resolves plan from Creem product environment mapping", () => {
    process.env.CREEM_CREATOR_PRODUCT_ID = "prod_creator";

    expect(resolveCreemPlanId({ productId: "prod_creator" })).toBe("creator");
  });

  it("falls back to trusted metadata plan when product mapping is unavailable", () => {
    expect(resolveCreemPlanId({ metadataPlan: "pro" })).toBe("pro");
    expect(resolveCreemPlanId({ metadataPlan: "free" })).toBeNull();
  });

  it("builds subscription upsert data with metadata user fallback", () => {
    const upsert = buildCreemSubscriptionUpsert({
      status: "active",
      subscriptionId: "sub_123",
      customerId: "cus_123",
      existingUserId: null,
      metadataUserId: "user_123",
      currentPeriodEnd: "2099-01-01T00:00:00.000Z"
    });

    expect(upsert.userId).toBe("user_123");
    expect(upsert.data).toMatchObject({
      user_id: "user_123",
      payment_provider: "creem",
      provider_customer_id: "cus_123",
      provider_subscription_id: "sub_123",
      status: "active",
      current_period_end: "2099-01-01T00:00:00.000Z"
    });
  });

  it("refuses to build an upsert without a user id", () => {
    expect(() =>
      buildCreemSubscriptionUpsert({
        status: "active",
        subscriptionId: "sub_123",
        customerId: "cus_123",
        existingUserId: null,
        metadataUserId: undefined
      })
    ).toThrow("Cannot upsert Creem subscription without a user_id.");
  });
});
