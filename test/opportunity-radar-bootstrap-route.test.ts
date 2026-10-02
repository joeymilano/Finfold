import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TrendCollectionUnavailableError extends Error {}
  return {
    enforceApiRateLimit: vi.fn(),
    getCurrentUserId: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    syncTrendSources: vi.fn(),
    TrendCollectionUnavailableError
  };
});

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/trends/service", () => ({
  syncTrendSources: mocks.syncTrendSources,
  TrendCollectionUnavailableError: mocks.TrendCollectionUnavailableError
}));

import { POST } from "@/app/api/operations/topic-opportunities/bootstrap/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceApiRateLimit.mockReturnValue(null);
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
  mocks.syncTrendSources.mockResolvedValue({ status: "succeeded", skipped: undefined });
});

describe("Opportunity Radar bootstrap route", () => {
  it("starts an authenticated, user-attributed idempotent collection", async () => {
    const response = await POST(new Request("https://www.finfold.app/api/operations/topic-opportunities/bootstrap?locale=zh", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.syncTrendSources).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      { trigger: "bootstrap", requestedBy: "user-1", minIntervalMs: 5 * 60_000 }
    );
  });

  it("returns accepted while another collector owns the global lease", async () => {
    mocks.syncTrendSources.mockResolvedValue({ status: "skipped", skipped: "in_progress" });
    const response = await POST(new Request("https://www.finfold.app/api/operations/topic-opportunities/bootstrap", { method: "POST" }));
    expect(response.status).toBe(202);
  });

  it("reports real source failure instead of a successful empty collection", async () => {
    mocks.syncTrendSources.mockRejectedValue(new mocks.TrendCollectionUnavailableError());
    const response = await POST(new Request("https://www.finfold.app/api/operations/topic-opportunities/bootstrap?locale=zh", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "真实信号来源暂时不可用，请稍后重新采集。" });
  });

  it("requires a signed-in user before a bootstrap can run", async () => {
    mocks.getCurrentUserId.mockRejectedValue(new Error("Unauthorized"));
    const response = await POST(new Request("https://www.finfold.app/api/operations/topic-opportunities/bootstrap", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.syncTrendSources).not.toHaveBeenCalled();
  });
});
