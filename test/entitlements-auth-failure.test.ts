import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/payment/entitlements", () => ({
  getActiveSubscription: vi.fn(),
  getPlanFeatures: () => ({ canAnalyze: true }),
  getPlanPlatformLimit: () => 3,
  resolveEffectivePlan: () => "free"
}));

vi.mock("@/lib/payment", () => ({
  PLAN_CREDITS: { free: 1_500 },
  ensurePlanCredits: vi.fn(),
  getCreditAllowanceSnapshot: vi.fn()
}));

vi.mock("@/lib/runtime-mode", () => ({ isLocalMockMode: () => false }));

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: () => true,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

import { POST } from "@/app/api/entitlements/check/route";

describe("POST /api/entitlements/check auth failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser }
    });
  });

  it("keeps a confirmed no-user response as the unauthenticated free entitlement", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ authenticated: false, plan: "free", trialAvailable: false });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("treats Supabase's missing-session result as a signed-out visitor", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError()
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: false,
      plan: "free",
      trialAvailable: false
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("fails closed instead of turning an auth read error into a free entitlement", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "auth backend unavailable" }
    });

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Account authentication is temporarily unavailable."
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("fails closed when the auth read throws", async () => {
    mocks.getUser.mockRejectedValue(new Error("network failure"));

    const response = await POST();

    expect(response.status).toBe(503);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
