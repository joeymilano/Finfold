import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  recordSignup: vi.fn().mockResolvedValue({ attributed: true }),
  attributeReferral: vi.fn().mockResolvedValue(undefined),
  admin: { rpc: vi.fn() }
}));

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: vi.fn(() => true),
  createSupabaseServerClient: vi.fn(async () => ({ auth: { signUp: mocks.signUp } })),
  createSupabaseAdminClient: vi.fn(() => mocks.admin)
}));
vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/password-policy", () => ({
  analyzePassword: vi.fn(() => ({ valid: true }))
}));
vi.mock("@/lib/referrals", () => ({
  attributeReferral: mocks.attributeReferral,
  readReferralCode: vi.fn(() => null),
  REFERRAL_COOKIE: "finfold-referral"
}));
vi.mock("@/lib/auth-callback-url", () => ({
  getAuthCallbackUrl: vi.fn(() => "https://www.finfold.app/auth/callback")
}));
vi.mock("@/lib/signup-error", () => ({ mapSignupError: vi.fn() }));
vi.mock("@/lib/native-outcome-attribution", () => ({
  NATIVE_VISITOR_COOKIE: "finfold_visitor_id",
  recordNativeSignupOutcome: mocks.recordSignup
}));

import { POST } from "@/app/api/auth/signup/route";

function signupRequest(trafficClass: "production" | "qa" = "production") {
  return new Request("https://www.finfold.app/api/auth/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "finfold_visitor_id=f9e2f2ae-ed69-4da9-9dd0-89abf89ce530"
    },
    body: JSON.stringify({
      email: "new@example.com",
      password: "Strong-password-123",
      trafficClass
    })
  });
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad",
    email: "new@example.com",
    created_at: "2026-08-26T10:00:00.000Z",
    confirmed_at: "2026-08-26T10:00:00.000Z",
    identities: [{ id: "identity-1" }],
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("email signup native outcome bridge", () => {
  it("records a completed first-party signup when a session is issued", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: user(), session: { access_token: "token" } },
      error: null
    });

    const response = await POST(signupRequest());

    expect(response.status).toBe(200);
    expect(mocks.recordSignup).toHaveBeenCalledWith(mocks.admin, expect.objectContaining({
      subjectUserId: "0f4f4b36-1348-4e26-9d62-74d24bfa84ad"
    }));
  });

  it("waits for the confirmation callback before counting signup", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: user({ confirmed_at: null }), session: null },
      error: null
    });

    await POST(signupRequest());

    expect(mocks.recordSignup).not.toHaveBeenCalled();
  });

  it("does not count Supabase's duplicate-email anti-enumeration response", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: user({ identities: [] }), session: { access_token: "token" } },
      error: null
    });

    await POST(signupRequest());

    expect(mocks.recordSignup).not.toHaveBeenCalled();
  });

  it("keeps QA traffic out of commercial outcomes", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: user(), session: { access_token: "token" } },
      error: null
    });

    await POST(signupRequest("qa"));

    expect(mocks.recordSignup).not.toHaveBeenCalled();
  });
});
