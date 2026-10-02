import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => false,
  persistenceUnavailableMessage: (feature: string) => `${feature} unavailable`
}));

import { getCreditAllowanceSnapshot } from "@/lib/payment/credits";

describe("getCreditAllowanceSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the complete allowance through one aggregate RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: { periodKey: "2026-08", used: 10, available: 115 },
      error: null
    });

    await expect(getCreditAllowanceSnapshot("user-1")).resolves.toEqual({
      used: 10,
      available: 115
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("get_credit_allowance_snapshot", {
      p_user_id: "user-1"
    });
  });

  it.each([
    null,
    { periodKey: "2026-08", used: "10", available: 115 },
    { periodKey: "2026-08", used: true, available: 115 },
    { periodKey: "2026-08", used: 10, available: null },
    { periodKey: "2026-13", used: 10, available: 115 },
    { periodKey: "2026-08", used: 10, available: 115, unexpected: 1 }
  ])("fails closed for malformed RPC shape %#", async (data) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(getCreditAllowanceSnapshot("user-1")).resolves.toBeNull();
  });

  it("fails closed when the aggregate RPC errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "temporary database failure" }
    });

    await expect(getCreditAllowanceSnapshot("user-1")).resolves.toBeNull();
  });
});
