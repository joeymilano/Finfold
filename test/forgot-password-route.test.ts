import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ hasSupabaseConfig: () => true, createSupabaseServerClient: async () => ({ auth: m }) }));
vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: () => null }));
import { POST } from "@/app/api/auth/forgot-password/route";
function request(body: Record<string, unknown>) {
  return new Request("https://www.finfold.app/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
beforeEach(() => vi.clearAllMocks());
describe("forgot password request", () => {
  it("sends a recovery email that lands on the reset form via the shared auth callback", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await POST(request({ email: "Person@Example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(m.resetPasswordForEmail.mock.calls[0][0]).toBe("person@example.com");
    const callback = new URL(m.resetPasswordForEmail.mock.calls[0][1].redirectTo);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/reset-password");
    expect(callback.searchParams.get("auth_mode")).toBe("login");
    expect(callback.searchParams.get("auth_method")).toBe("email");
  });
  it("returns the same success response for unknown addresses (anti-enumeration)", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: { message: "user not found", code: "user_not_found" } });
    const response = await POST(request({ email: "nobody@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("surfaces a machine-readable cooldown for provider delivery limits", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" } });
    const response = await POST(request({ email: "person@example.com" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({ retryAfter: 60 });
  });
  it("rejects a missing or malformed address before touching the provider", async () => {
    const missing = await POST(request({}));
    expect(missing.status).toBe(400);
    const malformed = await POST(request({ email: "not-an-address" }));
    expect(malformed.status).toBe(400);
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
