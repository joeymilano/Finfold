import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn().mockResolvedValue(undefined),
  exchange: vi.fn().mockResolvedValue({
    data: {
      user: {
        id: "user-123",
        email: "founder@example.com",
        created_at: new Date().toISOString()
      }
    },
    error: null
  }),
  attributeReferral: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mocks.exchange }
  })),
  createSupabaseAdminClient: vi.fn(() => null)
}));
vi.mock("@/lib/founder-email", () => ({ sendFounderWelcome: vi.fn() }));
vi.mock("@/lib/referrals", () => ({
  attributeReferral: mocks.attributeReferral,
  readReferralCode: vi.fn(() => null),
  REFERRAL_COOKIE: "finfold-referral"
}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.capture }));

import { GET } from "@/app/(auth)/auth/callback/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth callback analytics", () => {
  it("preserves a ChatGPT authorization request when sign-in must be retried", async () => {
    const response = await GET(new Request(
      "https://www.finfold.app/auth/callback?next=%2Foauth%2Fconsent%3Fauthorization_id%3D12345678-1234-4234-8234-123456789012"
    ));

    expect(response.headers.get("location")).toBe(
      "https://www.finfold.app/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3D12345678-1234-4234-8234-123456789012&error=oauth"
    );
  });

  it("records OAuth signup completion before redirecting to the intended product entry", async () => {
    const response = await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Foperations%2Faccount-health&auth_mode=signup&auth_method=google&signup_flow_id=flow-12345678&traffic_class=production"
    ));

    expect(response.headers.get("location")).toBe("https://www.finfold.app/operations/account-health");
    expect(mocks.capture).toHaveBeenCalledWith("user-123", "auth_callback_completed", expect.objectContaining({
      auth_mode: "signup",
      auth_method: "google",
      return_to: "/operations/account-health",
      signup_flow_id: "flow-12345678",
      traffic_class: "production",
      is_test_traffic: "false"
    }));
    expect(mocks.capture).toHaveBeenCalledWith("user-123", "signup_completed", expect.objectContaining({
      completion_stage: "callback"
    }));
  });

  it("keeps QA completion filterable without trusting arbitrary callback values", async () => {
    await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Fdashboard&auth_mode=signup&auth_method=google&signup_flow_id=qa-flow-12345678&traffic_class=qa"
    ));

    expect(mocks.capture).toHaveBeenCalledWith("user-123", "signup_completed", expect.objectContaining({
      signup_flow_id: "qa-flow-12345678",
      traffic_class: "qa",
      is_test_traffic: "true"
    }));
  });

  it("does not turn a normal login callback into a signup completion", async () => {
    await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Fdashboard&auth_mode=login&auth_method=github"
    ));

    expect(mocks.capture).toHaveBeenCalledWith("user-123", "auth_callback_completed", expect.objectContaining({
      auth_mode: "login",
      auth_method: "github"
    }));
    expect(mocks.capture).not.toHaveBeenCalledWith("user-123", "signup_completed", expect.anything());
  });

  it("separates a returning OAuth user from a newly created signup", async () => {
    mocks.exchange.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-123",
          email: "founder@example.com",
          created_at: "2025-01-01T00:00:00.000Z"
        }
      },
      error: null
    });

    await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Fdashboard&auth_mode=signup&auth_method=google"
    ));

    expect(mocks.capture).toHaveBeenCalledWith("user-123", "signup_existing_account_resumed", expect.objectContaining({
      account_was_new: false
    }));
    expect(mocks.capture).not.toHaveBeenCalledWith("user-123", "signup_completed", expect.anything());
  });
});
