import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ hasSupabaseConfig: () => true, createSupabaseServerClient: async () => ({ auth: m }), createSupabaseAdminClient: () => null }));
vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: () => null }));
vi.mock("@/lib/referrals", () => ({ attributeReferral: vi.fn(), readReferralCode: () => null, REFERRAL_COOKIE: "ref" }));
vi.mock("@/lib/native-outcome-attribution", () => ({ NATIVE_VISITOR_COOKIE: "visit", recordNativeSignupOutcome: vi.fn() }));
import { POST } from "@/app/api/auth/signup/route";
function request() { return new Request("https://www.finfold.app/api/auth/signup", { method: "POST", body: JSON.stringify({ intent: "resend", email: "person@example.com", next: "/workbench?start=1&draft=dcd384a8-49ac-4d0e-ac59-6f71db5197ef" }) }); }
beforeEach(() => vi.clearAllMocks());
describe("confirmation resend", () => {
  it("resends without re-creating the account or requiring a password, preserving the task destination", async () => {
    m.resend.mockResolvedValue({ error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needsConfirmation: true, retryAfter: 60 });
    expect(m.signUp).not.toHaveBeenCalled();
    expect(m.resend.mock.calls[0][0]).toMatchObject({ type: "signup", email: "person@example.com" });
    const callback = new URL(m.resend.mock.calls[0][0].options.emailRedirectTo);
    expect(callback.searchParams.get("next")).toContain("/workbench?start=1");
  });
  it("returns a machine-readable cooldown for provider delivery limits", async () => {
    m.resend.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" } });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({ code: "confirmation_email_rate_limited", retryAfter: 60 });
  });
});
