import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  currentPeriodKey: vi.fn(),
  periodKeyExpiry: vi.fn(),
  getCreditSpendSummary: vi.fn(),
  hasSupabaseConfig: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn()
}));

vi.mock("@/lib/payment", () => ({
  currentPeriodKey: mocks.currentPeriodKey,
  periodKeyStart: (periodKey: string) => `${periodKey}-01T00:00:00Z`,
  periodKeyExpiry: mocks.periodKeyExpiry,
  getCreditSpendSummary: mocks.getCreditSpendSummary
}));

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: mocks.hasSupabaseConfig,
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import { GET } from "@/app/api/credits/spend-summary/route";

describe("GET /api/credits/spend-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseConfig.mockReturnValue(true);
    mocks.currentPeriodKey.mockReturnValue("2026-08");
    mocks.periodKeyExpiry.mockReturnValue("2026-09-01T00:00:00Z");
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser }
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null
    });
  });

  it("returns explicit semantics from one lower/upper bounded cycle", async () => {
    mocks.getCreditSpendSummary.mockResolvedValue({
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 5,
      netCharged: 10,
      manualCredits: 20,
      manualDebits: 3,
      expiredCredits: 4
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ action: "contentKitBase", credits: 15 }],
      grossReserved: 15,
      refunded: 5,
      netCharged: 10,
      manualCredits: 20,
      manualDebits: 3,
      expiredCredits: 4,
      cycleStart: "2026-08-01T00:00:00Z",
      cycleEnd: "2026-09-01T00:00:00Z"
    });
    expect(mocks.currentPeriodKey).toHaveBeenCalledOnce();
    expect(mocks.currentPeriodKey).toHaveBeenCalledWith(expect.any(Date));
    expect(mocks.periodKeyExpiry).toHaveBeenCalledWith("2026-08");
    expect(mocks.getCreditSpendSummary).toHaveBeenCalledWith(
      "user-1",
      "2026-08-01T00:00:00Z",
      "2026-09-01T00:00:00Z"
    );
  });

  it("returns 401 for a confirmed unauthenticated request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getCreditSpendSummary).not.toHaveBeenCalled();
  });

  it("returns 401 when Supabase reports that the auth session is missing", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError()
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getCreditSpendSummary).not.toHaveBeenCalled();
  });

  it("fails closed when authentication returns a read error", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "auth service unavailable" }
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication is temporarily unavailable."
    });
    expect(mocks.getCreditSpendSummary).not.toHaveBeenCalled();
  });

  it("fails closed when authentication throws", async () => {
    mocks.getUser.mockRejectedValue(new Error("network failure"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.getCreditSpendSummary).not.toHaveBeenCalled();
  });

  it("fails closed when the authoritative ledger read is unavailable", async () => {
    mocks.getCreditSpendSummary.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Credits activity is temporarily unavailable."
    });
  });
});
