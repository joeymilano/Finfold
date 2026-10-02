import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  saveTrendSourcePreferences: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/trends/source-preferences", () => ({
  saveTrendSourcePreferences: mocks.saveTrendSourcePreferences
}));

import { PUT } from "@/app/api/settings/trend-sources/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.createSupabaseAdminClient.mockReturnValue({ auth: { admin: {} } });
  mocks.saveTrendSourcePreferences.mockResolvedValue(new Set(["google_trends", "the_verge"]));
});

describe("Opportunity Radar source preference route", () => {
  it("saves a validated selection for the signed-in account", async () => {
    const response = await PUT(new Request("https://www.finfold.app/api/settings/trend-sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceKeys: ["google_trends", "the_verge"] })
    }));

    expect(response.status).toBe(200);
    expect(mocks.saveTrendSourcePreferences).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      ["google_trends", "the_verge"]
    );
  });

  it("requires at least one recognized source", async () => {
    const response = await PUT(new Request("https://www.finfold.app/api/settings/trend-sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceKeys: [] })
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请至少保留一个数据源。" });
    expect(mocks.saveTrendSourcePreferences).not.toHaveBeenCalled();
  });
});
