import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TREND_SOURCE_KEYS,
  isTrendSourceEnabled,
  loadTrendSourcePreferences,
  saveTrendSourcePreferences,
  trendSourcePreferenceKey
} from "@/lib/trends/source-preferences";

describe("Opportunity Radar source preferences", () => {
  it("maps shared RSS labels to stable per-user preference keys", () => {
    expect(trendSourcePreferenceKey("rss", "The Verge")).toBe("the_verge");
    expect(trendSourcePreferenceKey("rss", "百度热搜趋势")).toBe("baidu_hot_search");
    expect(trendSourcePreferenceKey("social_post", "Reddit · r/SaaS")).toBe("reddit");
    expect(isTrendSourceEnabled("rss", "The Verge", new Set(["google_trends"]))).toBe(false);
    expect(isTrendSourceEnabled("rss", "用户自己的 RSS", new Set(["google_trends"]))).toBe(true);
  });

  it("defaults every known source on before the user customizes the radar", async () => {
    const admin = { auth: { admin: {} } } as never;
    const enabled = await loadTrendSourcePreferences(admin, "user-1");
    expect([...enabled]).toEqual(DEFAULT_TREND_SOURCE_KEYS);
  });

  it("merges a saved source selection into existing account metadata", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { user_metadata: { locale: "zh", plan: "creator" } } },
            error: null
          }),
          updateUserById
        }
      }
    } as never;

    const enabled = await saveTrendSourcePreferences(admin, "user-1", ["google_trends", "the_verge"]);
    expect([...enabled]).toEqual(["google_trends", "the_verge"]);
    expect(updateUserById).toHaveBeenCalledWith("user-1", {
      user_metadata: expect.objectContaining({
        locale: "zh",
        plan: "creator",
        trend_source_preferences: expect.objectContaining({
          enabled: ["google_trends", "the_verge"]
        })
      })
    });
  });

  it("refuses to save an empty selection", async () => {
    const admin = { auth: { admin: {} } } as never;
    await expect(saveTrendSourcePreferences(admin, "user-1", [])).rejects.toThrow("At least one");
  });
});
