import { describe, expect, it } from "vitest";
import { normalizeXhsAccountMetrics } from "@/lib/agent/xhs-diagnosis";

describe("normalizeXhsAccountMetrics", () => {
  it("normalizes the Creator Center labels used in account screenshots", () => {
    expect(normalizeXhsAccountMetrics({
      曝光数: "4,771",
      观看数: 984,
      封面点击率: "20.6%",
      平均观看时长: "9.2秒",
      点赞数: 8,
      评论数: 2,
      收藏数: 1,
      分享数: 5,
      净涨粉: -2,
      主页访客: 45
    })).toEqual({
      impressions: 4771,
      views: 984,
      coverClickRate: 20.6,
      averageViewSeconds: 9.2,
      likes: 8,
      comments: 2,
      saves: 1,
      shares: 5,
      followerGrowth: -2,
      profileVisits: 45
    });
  });

  it("supports compact Chinese quantities and clamps invalid rates", () => {
    const metrics = normalizeXhsAccountMetrics({
      impressions: "1.2万",
      views: "3.4k",
      coverClickRate: "140%"
    });
    expect(metrics.impressions).toBe(12000);
    expect(metrics.views).toBe(3400);
    expect(metrics.coverClickRate).toBe(100);
  });
});
