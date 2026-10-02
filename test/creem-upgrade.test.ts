import { afterEach, describe, expect, it, vi } from "vitest";
import {
  retrieveCreemTransaction,
  upgradeCreemSubscription
} from "@/lib/payment/creem-management";

const originalApiKey = process.env.CREEM_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.CREEM_API_KEY;
  else process.env.CREEM_API_KEY = originalApiKey;
});

describe("Creem subscription upgrade", () => {
  it("uses the official immediate-proration upgrade endpoint", async () => {
    process.env.CREEM_API_KEY = "creem_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "sub_123",
      status: "active",
      product: { id: "prod_growth" }
    }), { status: 200 }));

    const upgraded = await upgradeCreemSubscription("sub_123", "prod_growth");

    expect(upgraded.product?.id).toBe("prod_growth");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://test-api.creem.io/v1/subscriptions/sub_123/upgrade",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          product_id: "prod_growth",
          update_behavior: "proration-charge-immediately"
        })
      })
    );
  });

  it("does not hide provider upgrade failures", async () => {
    process.env.CREEM_API_KEY = "creem_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: "Payment method declined"
    }), { status: 402 }));

    await expect(upgradeCreemSubscription("sub_123", "prod_growth"))
      .rejects.toThrow("Payment method declined");
  });
});

describe("Creem transaction retrieval", () => {
  it("uses the official transaction lookup with the server API key", async () => {
    process.env.CREEM_API_KEY = "creem_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "txn_123",
      status: "paid",
      amount_paid: 1299,
      currency: "USD"
    }), { status: 200 }));

    const transaction = await retrieveCreemTransaction("txn_123");

    expect(transaction.amount_paid).toBe(1299);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://test-api.creem.io/v1/transactions?transaction_id=txn_123",
      expect.objectContaining({ headers: { "x-api-key": "creem_test_key" } })
    );
  });
});
