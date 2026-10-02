import { describe, it, expect } from "vitest";
import { buildOrderViews, orderRefundTarget, type PurchaseRow, type RefundRequestRow } from "../lib/payment/orders";

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now" so assertions are deterministic.
const NOW = new Date("2026-09-22T12:00:00Z").getTime();

function purchaseRow(overrides: Partial<PurchaseRow> = {}): PurchaseRow {
  return {
    id: "order-1",
    user_id: "user-1",
    credits: 500,
    amount_cents: 4900,
    currency: "cny",
    provider: "zcwpay",
    status: "paid",
    order_code: "FF-ABCD1234",
    plan: null,
    balance_id: "balance-1",
    created_at: new Date(NOW - DAY).toISOString(),
    confirmed_at: new Date(NOW - DAY).toISOString(),
    expires_at: new Date(NOW - DAY + 30 * 60_000).toISOString(),
    ...overrides
  };
}

function refundRow(overrides: Partial<RefundRequestRow> = {}): RefundRequestRow {
  return {
    provider_order_id: "FF-ABCD1234",
    provider_subscription_id: null,
    status: "pending",
    requested_at: new Date(NOW - 3600_000).toISOString(),
    ...overrides
  };
}

describe("orderRefundTarget", () => {
  it("uses the order code when present", () => {
    expect(orderRefundTarget({ id: "x", order_code: "FF-1" })).toBe("FF-1");
  });

  it("falls back to the row id for legacy rows without a code", () => {
    expect(orderRefundTarget({ id: "legacy-id", order_code: null })).toBe("legacy-id");
  });
});

describe("buildOrderViews", () => {
  it("marks a fresh paid order refundable", () => {
    const [view] = buildOrderViews([purchaseRow()], [], new Set(), null, NOW);
    expect(view?.refundable).toBe(true);
    expect(view?.refundBlock).toBeNull();
    expect(view?.kind).toBe("credits");
    expect(view?.amountCents).toBe(4900);
    expect(view?.currency).toBe("cny");
  });

  it("blocks refunds outside the 3-day window", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ confirmed_at: new Date(NOW - 4 * DAY).toISOString() })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundable).toBe(false);
    expect(view?.refundBlock).toBe("outside_window");
  });

  it("falls back to created_at when confirmed_at is missing", () => {
    const [inside] = buildOrderViews(
      [purchaseRow({ confirmed_at: null, created_at: new Date(NOW - 2 * DAY).toISOString() })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(inside?.refundable).toBe(true);

    const [outside] = buildOrderViews(
      [purchaseRow({ confirmed_at: null, created_at: new Date(NOW - 5 * DAY).toISOString() })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(outside?.refundBlock).toBe("outside_window");
  });

  it("fail-closes the window when both timestamps are missing", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ confirmed_at: null, created_at: "" })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundBlock).toBe("outside_window");
  });

  it("only paid orders are refundable", () => {
    const views = buildOrderViews(
      [
        purchaseRow({ id: "a", order_code: "FF-A", status: "pending" }),
        purchaseRow({ id: "b", order_code: "FF-B", status: "failed" }),
        purchaseRow({ id: "c", order_code: "FF-C", status: "refunded" })
      ],
      [],
      new Set(),
      null,
      NOW
    );
    expect(views.every((v) => !v.refundable)).toBe(true);
  });

  it("surfaces an open refund request and blocks a repeat", () => {
    const [view] = buildOrderViews([purchaseRow()], [refundRow()], new Set(), null, NOW);
    expect(view?.refundStatus).toBe("pending");
    expect(view?.refundable).toBe(false);
  });

  it("a completed refund blocks re-requesting", () => {
    const [view] = buildOrderViews(
      [purchaseRow()],
      [refundRow({ status: "completed" })],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundStatus).toBe("completed");
    expect(view?.refundable).toBe(false);
  });

  it("a rejected refund may be re-requested", () => {
    const [view] = buildOrderViews(
      [purchaseRow()],
      [refundRow({ status: "rejected" })],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundStatus).toBe("rejected");
    expect(view?.refundable).toBe(true);
  });

  it("matches refund requests by the newest first", () => {
    const [view] = buildOrderViews(
      [purchaseRow()],
      [refundRow({ status: "rejected", requested_at: new Date(NOW - 2 * DAY).toISOString() }), refundRow()],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundStatus).toBe("pending");
  });

  it("a partially spent credit pack cannot be self-refunded", () => {
    const [view] = buildOrderViews([purchaseRow()], [], new Set(["balance-1"]), null, NOW);
    expect(view?.refundable).toBe(false);
    expect(view?.refundBlock).toBe("consumed");
  });

  it("an untouched pack with no linked balance stays refundable (manual reconciliation)", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ balance_id: null })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.refundable).toBe(true);
  });

  it("a plan month blocks the refund once the user's plan moved on", () => {
    const row = purchaseRow({ plan: "creator_v2", balance_id: null });
    const [blocked] = buildOrderViews([row], [], new Set(), "growth_v2", NOW);
    expect(blocked?.refundBlock).toBe("plan_changed");

    const [open] = buildOrderViews([row], [], new Set(), "creator_v2", NOW);
    expect(open?.refundBlock).toBeNull();
    expect(open?.kind).toBe("plan");
  });

  it("maps unknown statuses defensively", () => {
    const [view] = buildOrderViews([purchaseRow({ status: "weird" })], [], new Set(), null, NOW);
    expect(view?.status).toBe("pending");
  });

  it("a pending ZCW order inside its window is payable", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ status: "pending", confirmed_at: null, expires_at: new Date(NOW + 10 * 60_000).toISOString() })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.payable).toBe(true);
  });

  it("a pending ZCW order past its expiry is no longer payable", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ status: "pending", confirmed_at: null, expires_at: new Date(NOW - 60_000).toISOString() })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.payable).toBe(false);
  });

  it("legacy 经营码 pending orders never offer continue-payment", () => {
    const [view] = buildOrderViews(
      [purchaseRow({ provider: "alipay_qrcode", status: "pending", confirmed_at: null })],
      [],
      new Set(),
      null,
      NOW
    );
    expect(view?.payable).toBe(false);
  });

  it("paid orders are never payable", () => {
    const [view] = buildOrderViews([purchaseRow()], [], new Set(), null, NOW);
    expect(view?.payable).toBe(false);
  });
});
