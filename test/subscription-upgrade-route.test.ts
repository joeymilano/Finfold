import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(async () => "user_123"),
  retrieve: vi.fn(),
  upgrade: vi.fn(),
  capture: vi.fn(async () => undefined),
  profilePlan: "creator_v2",
  subscription: {
    provider_subscription_id: "sub_123",
    status: "active",
    current_period_end: "2099-01-01T00:00:00.000Z",
    payment_provider: "creem",
    entitlement_id: "creator_v2",
    market: "global"
  }
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { plan: mocks.profilePlan }, error: null })
            })
          })
        };
      }
      return {
        select: () => ({
          eq: async () => ({ data: [mocks.subscription], error: null })
        })
      };
    }
  })
}));
vi.mock("@/lib/payment/creem-management", () => ({
  retrieveCreemSubscription: mocks.retrieve,
  upgradeCreemSubscription: mocks.upgrade
}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.capture }));

import { POST } from "@/app/api/subscriptions/upgrade/route";

beforeEach(() => {
  process.env.BILLING_GLOBAL_GROWTH_PRICE_ID = "prod_growth";
  mocks.profilePlan = "creator_v2";
  mocks.retrieve.mockResolvedValue({ id: "sub_123", status: "active", product: { id: "prod_creator" } });
  mocks.upgrade.mockResolvedValue({ id: "sub_123", status: "active", product: { id: "prod_growth" } });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.BILLING_GLOBAL_GROWTH_PRICE_ID;
});

function request(body: unknown) {
  return new Request("https://finfold.app/api/subscriptions/upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Growth subscription upgrade route", () => {
  it("asks Creem for an immediate-proration Growth upgrade and waits for webhook entitlement", async () => {
    const response = await POST(request({ plan: "growth", market: "global", locale: "en" }));
    const body = await response.json() as { pending?: boolean };

    expect(response.status).toBe(200);
    expect(body.pending).toBe(true);
    expect(mocks.retrieve).toHaveBeenCalledWith("sub_123");
    expect(mocks.upgrade).toHaveBeenCalledWith("sub_123", "prod_growth");
    expect(mocks.capture).toHaveBeenCalledWith("user_123", "subscription_upgrade_started", expect.objectContaining({
      from_plan: "creator_v2",
      to_plan: "growth_v2"
    }));
  });

  it("does not submit a second charge while the signed webhook is pending", async () => {
    mocks.retrieve.mockResolvedValue({ id: "sub_123", status: "active", product: { id: "prod_growth" } });

    const response = await POST(request({ plan: "growth", market: "global", locale: "en" }));

    expect(response.status).toBe(200);
    expect(mocks.upgrade).not.toHaveBeenCalled();
  });

  it("rejects plans outside the intentionally narrow Growth path", async () => {
    const response = await POST(request({ plan: "digital_employee" }));

    expect(response.status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});
