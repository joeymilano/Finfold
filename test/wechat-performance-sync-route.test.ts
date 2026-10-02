import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getWechatComponentConfig: vi.fn(),
  syncWechatUserSummary: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/wechat-component", () => ({ getWechatComponentConfig: mocks.getWechatComponentConfig }));
vi.mock("@/lib/wechat-connections", () => ({ syncWechatUserSummary: mocks.syncWechatUserSummary }));

import { POST } from "@/app/api/performance/sync-social/route";

describe("WeChat social performance sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue("a1c85540-4316-4b0f-acf0-714a8dfc89ce");
    mocks.createSupabaseAdminClient.mockReturnValue({ marker: "admin" });
    mocks.getWechatComponentConfig.mockReturnValue({ appId: "wx_component" });
  });

  it("synchronizes only server-authorized aggregate WeChat user data", async () => {
    mocks.syncWechatUserSummary.mockResolvedValue({
      beginDate: "2026-08-24",
      endDate: "2026-08-24",
      rows: 2,
      followerCount: 1200,
      periodFollowerGrowth: 8,
      newUsers: 11,
      cancelledUsers: 3,
      measuredAt: "2026-08-24T04:00:00.000Z"
    });

    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "wechat", connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce" })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      imported: 2,
      followerCount: 1200,
      newUsers: 11,
      cancelledUsers: 3
    });
    expect(mocks.syncWechatUserSummary).toHaveBeenCalledWith(
      { marker: "admin" },
      "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
      {
        connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        beginDate: undefined,
        endDate: undefined
      }
    );
  });

  it("fails closed when the WeChat component is disabled", async () => {
    mocks.getWechatComponentConfig.mockReturnValue(null);
    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "wechat", connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce" })
    }));
    expect(response.status).toBe(503);
    expect(mocks.syncWechatUserSummary).not.toHaveBeenCalled();
  });
});
