import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(async () => "user_123"), create: vi.fn(), qrcode: vi.fn(),
  retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn(),
  rows: [] as Array<Record<string, unknown>>, dbError: null as { message: string } | null
}));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.user,
  createSupabaseAdminClient: () => ({ from: () => ({
    select: () => ({ eq: async () => ({ data: mocks.rows, error: mocks.dbError }) }),
    update: (patch: unknown) => { mocks.update(patch); return { eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; }
  }) })
}));
vi.mock("@/lib/payment", () => ({
  resolveBillingPreferenceFromRequest: () => ({ region: "CN", market: "cn", preferredPaymentMethod: "alipay_qrcode" }),
  getProviderForRegion: () => ({ id: "creem", isConfigured: () => true, createCheckout: mocks.create }),
  getProvider: () => ({ id: "creem", isConfigured: () => true, createCheckout: mocks.create })
}));
vi.mock("@/lib/payment/qrcode-orders", () => ({ createQrcodePlanOrder: mocks.qrcode }));
vi.mock("@/lib/payment/creem-management", () => ({ retrieveCreemSubscription: mocks.retrieve, cancelCreemSubscription: mocks.cancel }));

import { POST as checkout } from "@/app/api/checkout/route";
import { POST as qrCreditsCheckout } from "@/app/api/credits/checkout-qrcode/route";
import { POST as qrCheckout } from "@/app/api/checkout-qrcode/route";
import { POST as cancel } from "@/app/api/subscriptions/cancel-renewal/route";

function request(body: unknown) { return new Request("https://finfold.app/api/checkout", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue("user_123");
  mocks.rows = [];
  mocks.dbError = null;
  mocks.create.mockResolvedValue({ url: "https://creem.io/test-checkout", provider: "creem" });
  mocks.qrcode.mockResolvedValue({ id: "order_123" });
});
afterEach(() => vi.restoreAllMocks());

describe("renewal checkout consent", () => {
  it.each([undefined, false, "true", 1])("rejects missing or invalid consent: %j", async (autoRenew) => {
    expect((await checkout(request({ plan: "starter", autoRenew }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("computes discounted amount on the server instead of trusting browser prices", async () => {
    expect((await checkout(request({ plan: "creator", autoRenew: true, price: 0.01, discount: 99 }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ price: 26.1, currency: "USD", autoRenew: true }));
  });
  it("does not risk duplicate subscriptions when subscription lookup fails", async () => {
    mocks.dbError = { message: "database unavailable" };
    expect((await checkout(request({ plan: "starter", autoRenew: true }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not create a second subscription for a current subscriber", async () => {
    mocks.rows = [{ status: "active", payment_provider: "creem" }];
    expect((await checkout(request({ plan: "starter", autoRenew: true }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("lets scan-to-pay subscribers start a card subscription (no renewal conflict)", async () => {
    mocks.rows = [{ status: "active", payment_provider: "zcwpay", current_period_end: "2099-01-01T00:00:00.000Z" }];
    expect((await checkout(request({ plan: "starter", autoRenew: true }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalled();
  });
  it("blocks both retired QR order endpoints, including cached clients", async () => {
    for (const handler of [qrCheckout, qrCreditsCheckout]) {
      for (const autoRenew of [false, true]) {
        const response = await handler(request({ plan: "starter_v2", packageId: "starter_pack", autoRenew }));
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: "PAYMENT_CHANNEL_UNAVAILABLE" });
      }
    }
    expect(mocks.qrcode).not.toHaveBeenCalled();
  });
});

describe("cancel monthly renewal", () => {
  const end = "2099-01-01T00:00:00.000Z";
  beforeEach(() => {
    mocks.rows = [{ provider_subscription_id: "sub_owned", payment_provider: "creem", status: "active", current_period_end: end }];
    mocks.retrieve.mockResolvedValue({ id: "sub_owned", status: "active" });
    mocks.cancel.mockResolvedValue({ id: "sub_owned", status: "scheduled_cancel", current_period_end_date: end });
  });
  it("schedules cancellation for the owned subscription without immediately revoking access", async () => {
    expect((await cancel()).status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith("sub_owned", "scheduled");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled_cancel", current_period_end: end }));
  });
  it("is safe to retry when Creem has already accepted cancellation", async () => {
    mocks.retrieve.mockResolvedValue({ id: "sub_owned", status: "scheduled_cancel", current_period_end_date: end });
    expect((await cancel()).status).toBe(200);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("does not claim success when cancellation is unconfirmed", async () => {
    mocks.cancel.mockResolvedValue({ id: "sub_owned", status: "active" });
    expect((await cancel()).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.user.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await cancel()).status).toBe(401);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("never attempts cancellation for an Alipay purchase", async () => {
    mocks.rows[0].payment_provider = "alipay_qrcode";
    expect((await cancel()).status).toBe(409);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
