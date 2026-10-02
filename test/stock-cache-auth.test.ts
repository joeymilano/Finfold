import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => true),
  getClientIp: vi.fn(() => "127.0.0.1")
}));

import { POST as cachePexels } from "@/app/api/stock/pexels/cache/route";
import { POST as cachePixabay } from "@/app/api/stock/pixabay/cache/route";

const originalPexelsKey = process.env.PEXELS_API_KEY;
const originalPixabayKey = process.env.PIXABAY_API_KEY;

describe("stock image cache authentication", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getCurrentUserId.mockReset();
    mocks.getCurrentUserId.mockRejectedValue(new Error("Unauthorized"));
    process.env.PEXELS_API_KEY = "pexels-test-key";
    process.env.PIXABAY_API_KEY = "pixabay-test-key";
  });

  afterEach(() => {
    if (originalPexelsKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = originalPexelsKey;
    if (originalPixabayKey === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = originalPixabayKey;
    vi.restoreAllMocks();
  });

  it.each([
    ["Pexels", cachePexels],
    ["Pixabay", cachePixabay]
  ])("rejects anonymous %s cache writes before provider access", async (_name, handler) => {
    const providerFetch = vi.spyOn(globalThis, "fetch");
    const response = await handler(
      new Request("https://www.finfold.app/api/stock/cache", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "123" })
      })
    );

    expect(response.status).toBe(401);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
