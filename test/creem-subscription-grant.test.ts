import { describe, expect, it, vi } from "vitest";
import { grantPlanFromSubscription } from "@/lib/payment/creem-subscription-grant";

describe("Creem subscription entitlement grant", () => {
  it("applies Growth profile and credit allowance through one atomic RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { creditsAdded: 4500 }, error: null }));
    const supabase = { rpc } as never;

    const plan = await grantPlanFromSubscription(supabase, "user_123", {
      metadata: { plan: "growth_v2" }
    });

    expect(plan).toBe("growth_v2");
    expect(rpc).toHaveBeenCalledWith("apply_plan_entitlement", expect.objectContaining({
      p_user_id: "user_123",
      p_plan: "growth_v2",
      p_monthly_limit: 250,
      p_credits: 7500,
      p_founding_member: false
    }));
  });

  it("preserves the Digital Employee fair-use credit ceiling", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    const supabase = { rpc } as never;

    await grantPlanFromSubscription(supabase, "user_123", {
      metadata: { plan: "digital_employee_v2" }
    });

    expect(rpc).toHaveBeenCalledWith("apply_plan_entitlement", expect.objectContaining({
      p_plan: "digital_employee_v2",
      p_credits: 50_000
    }));
  });
});
