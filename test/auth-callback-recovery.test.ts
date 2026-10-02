import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  sendFounderWelcome: vi.fn().mockResolvedValue(true),
  from: vi.fn(),
  capture: vi.fn().mockResolvedValue(undefined),
  attributeReferral: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: mocks.exchange }
  })),
  createSupabaseAdminClient: vi.fn(() => ({ from: mocks.from }))
}));
vi.mock("@/lib/founder-email", () => ({ sendFounderWelcome: mocks.sendFounderWelcome }));
vi.mock("@/lib/referrals", () => ({
  attributeReferral: mocks.attributeReferral,
  readReferralCode: vi.fn(() => null),
  REFERRAL_COOKIE: "finfold-referral"
}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.capture }));

import { GET } from "@/app/(auth)/auth/callback/route";

function adminFromWithProfile(profile: Record<string, unknown> | null) {
  const chain: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
  } = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: async () => ({ data: profile })
  };
  mocks.from.mockImplementation(() => chain);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth callback password recovery", () => {
  it("lands the user on the reset form and never sends the founder welcome email", async () => {
    adminFromWithProfile({ locale: "zh", founder_email_sent_at: null });
    mocks.exchange.mockResolvedValue({
      data: { user: { id: "user-123", email: "person@example.com", created_at: "2025-01-01T00:00:00.000Z" } },
      error: null
    });

    const response = await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Freset-password"
    ));

    expect(response.headers.get("location")).toBe("https://www.finfold.app/reset-password");
    expect(mocks.sendFounderWelcome).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("still sends the founder welcome on a regular first login (control case)", async () => {
    adminFromWithProfile({ locale: "zh", founder_email_sent_at: null });
    mocks.exchange.mockResolvedValue({
      data: { user: { id: "user-123", email: "person@example.com", created_at: "2025-01-01T00:00:00.000Z" } },
      error: null
    });

    await GET(new Request(
      "https://www.finfold.app/auth/callback?code=ok&next=%2Fdashboard"
    ));

    expect(mocks.sendFounderWelcome).toHaveBeenCalledTimes(1);
  });

  it("routes an expired or already-used recovery link back to the email request form", async () => {
    mocks.exchange.mockResolvedValue({
      data: {},
      error: { message: "invalid request: both auth code and code verifier should be non-empty" }
    });

    const response = await GET(new Request(
      "https://www.finfold.app/auth/callback?next=%2Freset-password"
    ));

    expect(response.headers.get("location")).toBe("https://www.finfold.app/forgot-password?error=expired");
  });
});
