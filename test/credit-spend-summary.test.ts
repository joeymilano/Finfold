import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => false,
  persistenceUnavailableMessage: (feature: string) => `${feature} unavailable`
}));

import {
  getCreditSpendSummary,
  summarizeCreditSpendTransactions
} from "@/lib/payment/credits";

describe("summarizeCreditSpendTransactions", () => {
  it("keeps gross action activity while making a full refund net to zero", () => {
    expect(
      summarizeCreditSpendTransactions([
        { action: "contentKitBase", delta: -15 },
        { action: "refund", delta: 15 }
      ])
    ).toEqual({
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 15,
      netCharged: 0,
      manualCredits: 0,
      manualDebits: 0,
      expiredCredits: 0
    });
  });

  it("keeps positive/negative adjustments separate from attempts and refunds", () => {
    expect(
      summarizeCreditSpendTransactions([
        { action: "contentKitBase", delta: -15 },
        { action: "refund", delta: 5 },
        { action: "adjustment", delta: 20 },
        { action: "adjustment", delta: -3 },
        { action: "expire", delta: -40 },
        { action: "grant", delta: 300 },
        { action: "purchase", delta: 500 }
      ])
    ).toEqual({
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 5,
      netCharged: 10,
      manualCredits: 20,
      manualDebits: 3,
      expiredCredits: 40
    });
  });

  it("floors net charged at zero without hiding the actual refund total", () => {
    expect(
      summarizeCreditSpendTransactions([
        { action: "contentKitBase", delta: -5 },
        { action: "refund", delta: 8 }
      ])
    ).toMatchObject({ grossReserved: 5, refunded: 8, netCharged: 0 });
  });

  it.each([null, true, false, "-15", "0", "15"]) (
    "rejects non-number runtime delta %j",
    (delta) => {
      expect(
        summarizeCreditSpendTransactions([{ action: "contentKitBase", delta }])
      ).toBeNull();
    }
  );

  it("rejects malformed actions and non-integer numbers", () => {
    expect(summarizeCreditSpendTransactions([{ action: "", delta: -1 }])).toBeNull();
    expect(summarizeCreditSpendTransactions([{ action: "refund", delta: 1.5 }])).toBeNull();
  });
});

describe("getCreditSpendSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the complete aggregate through one explicitly bounded RPC", async () => {
    const summary = {
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 5,
      netCharged: 10,
      manualCredits: 20,
      manualDebits: 3,
      expiredCredits: 4
    };
    mocks.rpc.mockResolvedValue({ data: summary, error: null });

    await expect(
      getCreditSpendSummary(
        "user-1",
        "2026-08-01T00:00:00Z",
        "2026-09-01T00:00:00Z"
      )
    ).resolves.toEqual(summary);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_credit_spend_summary_snapshot", {
      p_user_id: "user-1",
      p_period_start: "2026-08-01T00:00:00Z",
      p_period_end: "2026-09-01T00:00:00Z"
    });
  });

  it("rejects malformed RPC numbers instead of coercing them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({
      data: {
        items: [{ action: "contentKitBase", credits: 15 }],
        grossReserved: "15",
        refunded: false,
        netCharged: null,
        manualCredits: 0,
        manualDebits: 0,
        expiredCredits: 0
      },
      error: null
    });

    await expect(
      getCreditSpendSummary(
        "user-1",
        "2026-08-01T00:00:00Z",
        "2026-09-01T00:00:00Z"
      )
    ).resolves.toBeNull();
  });

  it("rejects inconsistent or unbounded cycles before calling the RPC", async () => {
    await expect(
      getCreditSpendSummary(
        "user-1",
        "2026-09-01T00:00:00Z",
        "2026-08-01T00:00:00Z"
      )
    ).resolves.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
