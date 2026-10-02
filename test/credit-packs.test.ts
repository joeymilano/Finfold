// Unit coverage for the §10.4 top-up purchase chain:
//
//   CREDIT_PACKS pricing ─▶ getCreditPack ─▶ createCreditsCheckout (Creem)
//                                          ─▶ createPendingPurchase (DB row)
//                          webhook ─▶ grantPurchaseCredits (DB RPC)
//
// The HTTP handler shells (checkout route, webhook route) and HMAC verification
// are deliberately not unit-tested here, matching the project's existing
// convention (see creem-checkout.test.ts / creem-webhook.test.ts, which cover
// lib-layer helpers, not route handlers). Everything below is the pure /
// mockable business logic those handlers delegate to.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CREDIT_PACKS, getCreditPack } from "@/lib/payment/types";
import {
  createCreditsCheckout,
  hasCreditPackCheckoutTarget,
  isAnyCreditPackConfigured,
  resolveCreditPackByProductId
} from "@/lib/payment/creem";
import { createPendingPurchase, grantPurchaseCredits } from "@/lib/payment/credits";

// --- module-level mock for the Supabase admin client ----------------------
// credits.ts calls createSupabaseAdminClient() and then chains .from()/.rpc().
// vi.hoisted keeps the mock object reference stable across hoisting so the
// vi.mock factory can close over it.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn(), rpc: vi.fn() }
}));
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => supabaseMock
}));

// All Creem env knobs touched by the credit-pack paths. Each pack now has a
// CN-locale and a Global-locale product (plus payment-link fallbacks), matching
// lib/payment/constants.ts CREEM_CREDIT_PACK_*_ENV_MAP.
const CREEM_ENV_KEYS = [
  "CREEM_API_KEY",
  // Product ids — CN + Global locale products per pack.
  "CREEM_CREDIT_PACK_CN_STARTER_PRODUCT_ID",
  "CREEM_CREDIT_PACK_CN_STANDARD_PRODUCT_ID",
  "CREEM_CREDIT_PACK_CN_PLUS_PRODUCT_ID",
  "CREEM_CREDIT_PACK_CN_PRO_PRODUCT_ID",
  "CREEM_CREDIT_PACK_GLOBAL_STARTER_PRODUCT_ID",
  "CREEM_CREDIT_PACK_GLOBAL_STANDARD_PRODUCT_ID",
  "CREEM_CREDIT_PACK_GLOBAL_PLUS_PRODUCT_ID",
  "CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID",
  // Hosted payment links — CN + Global fallbacks.
  "CREEM_CREDIT_PACK_CN_STARTER_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_CN_STANDARD_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_CN_PLUS_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_CN_PRO_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_GLOBAL_STARTER_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_GLOBAL_STANDARD_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_GLOBAL_PLUS_PAYMENT_LINK",
  "CREEM_CREDIT_PACK_GLOBAL_PRO_PAYMENT_LINK"
];

describe("CREDIT_PACKS pricing table", () => {
  it("exposes exactly the four packs in ladder order with unique ids", () => {
    const ids = CREDIT_PACKS.map((p) => p.id);
    expect(ids).toEqual(["starter_pack", "standard_pack", "plus_pack", "pro_pack"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("grants strictly more credits up the ladder", () => {
    const credits = CREDIT_PACKS.map((p) => p.credits);
    expect([...credits].sort((a, b) => a - b)).toEqual(credits);
    expect(new Set(credits).size).toBe(credits.length); // strictly increasing
  });

  it("prices monotonically increase up the ladder", () => {
    const prices = CREDIT_PACKS.map((p) => p.priceCNY);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("lowers the per-credit price up the ladder (volume discount)", () => {
    // ¥ per 100 credits must strictly decrease pack-over-pack — this is the
    // commercial promise the top-up store is designed around, so lock it down.
    const perHundred = CREDIT_PACKS.map((p) => (p.priceCNY / p.credits) * 100);
    for (let i = 1; i < perHundred.length; i++) {
      expect(perHundred[i]).toBeLessThan(perHundred[i - 1]);
    }
  });

  it("keeps prices in whole yuan so amount_cents = round(priceCNY*100) is lossless", () => {
    for (const p of CREDIT_PACKS) {
      expect(Number.isInteger(p.priceCNY)).toBe(true);
      expect(Math.round(p.priceCNY * 100)).toBe(p.priceCNY * 100);
    }
  });

  it("badges only the largest pack as best value", () => {
    const badged = CREDIT_PACKS.filter((p) => p.badge);
    expect(badged).toHaveLength(1);
    expect(badged[0].id).toBe("pro_pack");
  });
});

describe("getCreditPack", () => {
  it("returns the matching pack for a known id", () => {
    expect(getCreditPack("pro_pack")?.credits).toBe(10_000);
    expect(getCreditPack("starter_pack")?.priceCNY).toBe(49);
  });

  it("returns undefined for an unknown or empty id", () => {
    expect(getCreditPack("mega_pack")).toBeUndefined();
    expect(getCreditPack("")).toBeUndefined();
  });
});

describe("credit-pack Creem resolution", () => {
  afterEach(() => {
    for (const key of CREEM_ENV_KEYS) delete process.env[key];
  });

  it("resolves a configured product id back to its pack (searches both markets)", () => {
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    expect(resolveCreditPackByProductId("prod_pro_pack")).toBe("pro_pack");
    // A CN-locale product resolves too.
    delete process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID;
    process.env.CREEM_CREDIT_PACK_CN_STARTER_PRODUCT_ID = "prod_cn_starter";
    expect(resolveCreditPackByProductId("prod_cn_starter")).toBe("starter_pack");
  });

  it("returns undefined for an unknown / empty / null product id", () => {
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    expect(resolveCreditPackByProductId("prod_other")).toBeUndefined();
    expect(resolveCreditPackByProductId(undefined)).toBeUndefined();
    expect(resolveCreditPackByProductId(null)).toBeUndefined();
    expect(resolveCreditPackByProductId("")).toBeUndefined();
  });

  it("gates a pack target by market when market is given, else any market", () => {
    expect(hasCreditPackCheckoutTarget("pro_pack")).toBe(false);
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    // No market → true if configured in EITHER market.
    expect(hasCreditPackCheckoutTarget("pro_pack")).toBe(true);
    // Explicit market narrows the check.
    expect(hasCreditPackCheckoutTarget("pro_pack", "global")).toBe(true);
    expect(hasCreditPackCheckoutTarget("pro_pack", "cn")).toBe(false);
    expect(hasCreditPackCheckoutTarget("starter_pack", "global")).toBe(false);
  });

  it("reports the store configured once at least one market product exists", () => {
    expect(isAnyCreditPackConfigured()).toBe(false);
    process.env.CREEM_CREDIT_PACK_CN_STARTER_PRODUCT_ID = "prod_cn_starter";
    expect(isAnyCreditPackConfigured()).toBe(true);
  });
});

describe("createCreditsCheckout", () => {
  afterEach(() => {
    for (const key of CREEM_ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
  });

  it("posts a one-time checkout for the buyer's market product with credits metadata + email", async () => {
    process.env.CREEM_API_KEY = "creem_live_xxx";
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ checkout_url: "https://checkout.creem.io/c/abc" })
    } as Response);

    const result = await createCreditsCheckout({
      userId: "user_1",
      packId: "pro_pack",
      purchaseId: "purc_1",
      market: "global",
      email: "buyer@example.com",
      successUrl: "https://finfold.app/billing?purchased=credits"
    });

    expect(result).toEqual({ url: "https://checkout.creem.io/c/abc", provider: "creem" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/checkouts$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.product_id).toBe("prod_pro_pack");
    expect(body.success_url).toBe("https://finfold.app/billing?purchased=credits");
    expect(body.metadata).toMatchObject({
      user_id: "user_1",
      type: "credits",
      package_id: "pro_pack",
      purchase_id: "purc_1"
    });
    expect(body.customer).toEqual({ email: "buyer@example.com" });
  });

  it("uses the CN-locale product id when market is cn", async () => {
    process.env.CREEM_API_KEY = "creem_live_xxx";
    process.env.CREEM_CREDIT_PACK_CN_PRO_PRODUCT_ID = "prod_cn_pro";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ checkout_url: "https://checkout.creem.io/c/cn" })
    } as Response);

    await createCreditsCheckout({
      userId: "user_1",
      packId: "pro_pack",
      purchaseId: "purc_cn",
      market: "cn",
      successUrl: "x"
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.product_id).toBe("prod_cn_pro");
  });

  it("uses a hosted payment link with credits metadata when no API key is set", async () => {
    delete process.env.CREEM_API_KEY;
    process.env.CREEM_CREDIT_PACK_GLOBAL_STARTER_PAYMENT_LINK = "https://creem.io/payment/pack_starter";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await createCreditsCheckout({
      userId: "user_1",
      packId: "starter_pack",
      purchaseId: "purc_2",
      market: "global",
      successUrl: "https://finfold.app/billing?purchased=credits"
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    const u = new URL(result.url);
    expect(u.origin + u.pathname).toBe("https://creem.io/payment/pack_starter");
    expect(u.searchParams.get("metadata[type]")).toBe("credits");
    expect(u.searchParams.get("metadata[purchase_id]")).toBe("purc_2");
    expect(u.searchParams.get("metadata[package_id]")).toBe("starter_pack");
    expect(u.searchParams.get("metadata[user_id]")).toBe("user_1");
  });

  it("throws when the API key is set but the market product id is missing", async () => {
    process.env.CREEM_API_KEY = "creem_live_xxx";
    // Global configured, CN not — asking for cn must throw.
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    await expect(
      createCreditsCheckout({
        userId: "user_1",
        packId: "pro_pack",
        purchaseId: "purc_3",
        market: "cn",
        successUrl: "x"
      })
    ).rejects.toThrow(/not configured/i);
  });

  it("surfaces a failed checkout response as an error", async () => {
    process.env.CREEM_API_KEY = "creem_live_xxx";
    process.env.CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID = "prod_pro_pack";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "product inactive" } })
    } as Response);

    await expect(
      createCreditsCheckout({
        userId: "user_1",
        packId: "pro_pack",
        purchaseId: "purc_4",
        market: "global",
        successUrl: "x"
      })
    ).rejects.toThrow("product inactive");
  });
});

describe("createPendingPurchase", () => {
  beforeEach(() => {
    supabaseMock.from.mockReset();
    supabaseMock.rpc.mockReset();
  });

  it("records a Creem pending order in the USD amount actually settled", async () => {
    let inserted: Record<string, unknown> | undefined;
    supabaseMock.from.mockReturnValue({
      insert: vi.fn((row: Record<string, unknown>) => {
        inserted = row;
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: "purc_xyz" }, error: null }))
          }))
        };
      })
    });

    const id = await createPendingPurchase("user_1", getCreditPack("standard_pack")!);

    expect(id).toBe("purc_xyz");
    // The webhook grants credits by reading them back out of this row, so the
    // amount/credits here must match the pack exactly — tampering with the
    // checkout payload can never inflate what gets granted.
    expect(inserted).toMatchObject({
      user_id: "user_1",
      credits: 1_500,
      amount_cents: 1_800, // $18.00
      currency: "usd",
      provider: "creem",
      status: "pending"
    });
  });

  it("keeps an Alipay QR order in CNY with its exact fen amount", async () => {
    let inserted: Record<string, unknown> | undefined;
    supabaseMock.from.mockReturnValue({
      insert: vi.fn((row: Record<string, unknown>) => {
        inserted = row;
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: "purc_qr" }, error: null }))
          }))
        };
      })
    });

    await createPendingPurchase("user_1", getCreditPack("standard_pack")!, {
      provider: "alipay_qrcode",
      amountCents: 12_937
    });

    expect(inserted).toMatchObject({
      amount_cents: 12_937,
      currency: "cny",
      provider: "alipay_qrcode"
    });
  });

  it("throws when the insert fails", async () => {
    supabaseMock.from.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: "rls blocked" } }))
        }))
      }))
    });

    await expect(createPendingPurchase("user_1", getCreditPack("starter_pack")!)).rejects.toThrow();
  });
});

describe("grantPurchaseCredits", () => {
  beforeEach(() => {
    supabaseMock.from.mockReset();
    supabaseMock.rpc.mockReset();
  });

  it("calls grant_purchase_credits with the purchase id + checkout id and returns the balance id", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: "bal_1", error: null });

    const out = await grantPurchaseCredits("purc_1", "cko_1");

    expect(supabaseMock.rpc).toHaveBeenCalledWith("grant_purchase_credits", {
      p_purchase_id: "purc_1",
      p_provider_checkout_id: "cko_1"
    });
    expect(out).toBe("bal_1");
  });

  it("passes null for the checkout id when none is supplied", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: "bal_2", error: null });
    await grantPurchaseCredits("purc_2");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("grant_purchase_credits", {
      p_purchase_id: "purc_2",
      p_provider_checkout_id: null
    });
  });

  it("returns null without throwing on an RPC error (so a replayed webhook can ack)", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "not pending" } });
    await expect(grantPurchaseCredits("purc_3")).resolves.toBeNull();
  });

  it("returns null when the RPC yields no balance id (unknown / already-paid)", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    await expect(grantPurchaseCredits("purc_4")).resolves.toBeNull();
  });
});
