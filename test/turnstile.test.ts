import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedTurnstileHostnames, verifyTurnstileRequest } from "@/lib/turnstile";

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "server-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.finfold.app");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Turnstile server verification", () => {
  it("requires success, the native lead action, and the production hostname", async () => {
    const idempotencyKey = crypto.randomUUID();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
      success: true,
      action: "native_lead",
      hostname: "www.finfold.app"
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstileRequest(
      new Request("https://www.finfold.app/api/leads/abc123def456", {
        headers: { "cf-connecting-ip": "203.0.113.7" }
      }),
      {
        token: "single-use-token",
        action: "native_lead",
        idempotencyKey
      }
    )).resolves.toEqual({ valid: true });

    const init = fetchMock.mock.calls[0][1];
    expect(String(init?.body)).toContain("response=single-use-token");
    expect(String(init?.body)).toContain("remoteip=203.0.113.7");
    expect(String(init?.body)).toContain(`idempotency_key=${idempotencyKey}`);
  });

  it("fails closed when action or hostname is wrong", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      success: true,
      action: "signup",
      hostname: "attacker.example"
    })));
    await expect(verifyTurnstileRequest(
      new Request("https://www.finfold.app/api/leads/abc123def456"),
      { token: "token", action: "native_lead", idempotencyKey: crypto.randomUUID() }
    )).resolves.toEqual({ valid: false, reason: "rejected" });
  });

  it("does not silently accept a missing production configuration", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(allowedTurnstileHostnames()).toEqual(new Set(["www.finfold.app"]));
    await expect(verifyTurnstileRequest(
      new Request("https://www.finfold.app/api/leads/abc123def456"),
      { token: "token", action: "native_lead", idempotencyKey: crypto.randomUUID() }
    )).resolves.toEqual({ valid: false, reason: "not_configured" });
  });
});
