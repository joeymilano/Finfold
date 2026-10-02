import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostHogInit } from "@/components/analytics/PostHogInit";
import { AuthUserProvider } from "@/components/auth/AuthUserProvider";

const mocks = vi.hoisted(() => ({
  pathname: "/operations/account-health",
  capture: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  clear: vi.fn(),
  consume: vi.fn(),
  read: vi.fn()
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/posthog", () => ({
  captureEvent: mocks.capture,
  clearAnalyticsIdentity: mocks.clear,
  identifyAnalyticsUser: mocks.identify,
  initPostHog: mocks.init
}));
vi.mock("@/lib/auth-funnel", () => ({
  consumePendingSignupFlow: mocks.consume,
  readPendingSignupFlow: mocks.read
}));
vi.mock("@/lib/supabase-client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    }
  })
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("PostHog signup destination handoff", () => {
  it("joins the authenticated destination to the anonymous signup flow once", async () => {
    mocks.read.mockReturnValue({
      version: 1,
      flowId: "flow-123",
      authMethod: "google",
      returnTo: "/operations/account-health",
      startedAt: Date.now() - 2_000
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          id: "user-123",
          email: "founder@example.com",
          avatarUrl: null,
          plan: "free",
          locale: "en"
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthUserProvider>
        <PostHogInit />
      </AuthUserProvider>
    );

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith("signup_destination_reached", expect.objectContaining({
      signup_flow_id: "flow-123",
      auth_method: "google",
      reached_path: "/operations/account-health",
      destination_matches: true
    })));
    expect(mocks.identify).toHaveBeenCalledWith(expect.objectContaining({ id: "user-123", plan: "free", locale: "en" }));
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
