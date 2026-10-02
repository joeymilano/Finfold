import { describe, expect, it } from "vitest";
import { checkPublishCadence, getCadenceRule } from "@/lib/publish-cadence";

describe("checkPublishCadence", () => {
  it("returns null when there is no publish history", () => {
    expect(checkPublishCadence("xiaohongshu", [])).toBeNull();
  });

  it("returns null when the most recent post is older than the min spacing and under the window cap", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    // xiaohongshu: minHoursBetweenPosts = 4
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
    expect(checkPublishCadence("xiaohongshu", [fiveHoursAgo], now)).toBeNull();
  });

  it("flags a 'spacing' violation when the most recent post is too recent", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const warning = checkPublishCadence("xiaohongshu", [oneHourAgo], now);
    expect(warning?.reason).toBe("spacing");
    expect(warning?.hoursUntilSafe).toBe(3); // minHoursBetweenPosts(4) - 1
  });

  it("flags a 'window' violation when the rolling-window post cap is already reached", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    // xiaohongshu: maxPostsPerWindow = 2 within 24h, minHoursBetweenPosts = 4.
    // Two posts spaced 10h apart satisfy spacing but hit the window cap.
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString();
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const warning = checkPublishCadence("xiaohongshu", [tenHoursAgo, twentyHoursAgo], now);
    expect(warning?.reason).toBe("window");
    expect(warning?.postsInWindow).toBe(2);
  });

  it("uses the default rule for a platform without a custom override", () => {
    const rule = getCadenceRule("x");
    expect(rule.maxPostsPerWindow).toBeGreaterThan(0);
  });

  it("ignores posts outside the rolling window", () => {
    const now = new Date("2026-07-20T12:00:00Z");
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(checkPublishCadence("xiaohongshu", [eightDaysAgo], now)).toBeNull();
  });
});
