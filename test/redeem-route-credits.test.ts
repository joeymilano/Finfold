import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensurePlanCredits: vi.fn(),
  redeemActivationCode: vi.fn()
}));

vi.mock("@/lib/payment/credits", () => ({
  ensurePlanCredits: mocks.ensurePlanCredits
}));

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: () => true,
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } })
    }
  }),
  createSupabaseAdminClient: () => ({
    rpc: mocks.redeemActivationCode
  })
}));

import { POST } from "@/app/api/redeem/route";

describe("activation-code credit grant", () => {
  beforeEach(() => {
    mocks.ensurePlanCredits.mockReset();
    mocks.redeemActivationCode.mockReset();
    mocks.redeemActivationCode.mockResolvedValue({
      data: "ok:employee:30",
      error: null
    });
  });

  it("eagerly establishes the redeemed plan's current credit batch", async () => {
    const response = await POST(new Request("https://finfold.test/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "EMPLOYEE-TEST" })
    }));

    expect(response.status).toBe(200);
    expect(mocks.ensurePlanCredits).toHaveBeenCalledWith("user-1", "employee");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      plan: "employee",
      days: 30
    });
  });

  it("keeps a committed redemption successful when the eager grant is transiently unavailable", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.ensurePlanCredits.mockRejectedValueOnce(new Error("temporary"));

    const response = await POST(new Request("https://finfold.test/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "EMPLOYEE-TEST" })
    }));

    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[redeem] Activation succeeded but the eager credit grant failed:",
      "Error"
    );
    consoleSpy.mockRestore();
  });
});
