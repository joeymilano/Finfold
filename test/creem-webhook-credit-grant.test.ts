import { beforeEach, describe, expect, it, vi } from "vitest";

import { grantPlanFromSubscription } from "@/lib/payment/creem-subscription-grant";

describe("Creem subscription credit grant", () => {
  beforeEach(() => {
    process.env.CREEM_PRO_PRODUCT_ID = "prod_pro";
  });

  it("atomically applies the paid plan and current credit batch", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc
    };

    const plan = await grantPlanFromSubscription(
      supabase as never,
      "user-1",
      { product: { id: "prod_pro" } }
    );

    expect(plan).toBe("pro");
    expect(rpc).toHaveBeenCalledWith(
      "apply_plan_entitlement",
      expect.objectContaining({
        p_user_id: "user-1",
        p_plan: "pro",
        p_monthly_limit: 100,
        p_credits: 3000,
        p_period_key: expect.stringMatching(/^\d{4}-\d{2}$/),
        p_expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      })
    );
  });
});
