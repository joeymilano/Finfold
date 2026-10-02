import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: () => true,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { GET } from "@/app/api/auth/user/route";

function profileQueryThatWaitsForAbort() {
  let signal: AbortSignal | null = null;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    abortSignal: vi.fn((nextSignal: AbortSignal) => {
      signal = nextSignal;
      return query;
    }),
    maybeSingle: vi.fn(() => new Promise((resolve) => {
      if (signal?.aborted) {
        resolve({ data: null, error: { message: "aborted" } });
        return;
      }
      signal?.addEventListener("abort", () => {
        resolve({ data: null, error: { message: "aborted" } });
      }, { once: true });
    })),
  };
  return query;
}

describe("GET /api/auth/user resilience", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims }
    });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-123",
          email: "founder@example.com",
          user_metadata: {
            avatar_url: "https://images.example/avatar.png",
            plan: "creator",
            locale: "en",
          },
        },
      },
      error: null,
    });
  });

  it("returns trusted token metadata when the profile database times out", async () => {
    vi.useFakeTimers();
    const query = profileQueryThatWaitsForAbort();
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(2_500);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-123",
        email: "founder@example.com",
        avatarUrl: "https://images.example/avatar.png",
        plan: "creator",
        locale: "en",
      },
    });
    expect(query.abortSignal).toHaveBeenCalledTimes(1);
  });
});
