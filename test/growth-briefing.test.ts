import { describe, expect, it } from "vitest";
import { buildGrowthBriefing, type GrowthMetricSample } from "@/lib/agent/growth-briefing";

function sample(overrides: Partial<GrowthMetricSample> = {}): GrowthMetricSample {
  return {
    kitId: "kit-1",
    platform: "xiaohongshu",
    title: "设计师焦虑的真相",
    ideaText: "Finfold 如何帮助设计师把专业经验变成有传播力的内容",
    measuredAt: "2026-07-28T00:00:00.000Z",
    impressions: 571,
    views: 31,
    clicks: 0,
    coverClickRate: 5.1,
    averageViewSeconds: 5.9,
    likes: 2,
    comments: 0,
    saves: 0,
    shares: 0,
    followerGrowth: 0,
    profileVisits: 0,
    leads: 0,
    signups: 0,
    revenue: 0,
    ...overrides
  };
}

describe("buildGrowthBriefing", () => {
  it("refuses to invent growth advice before real outcomes exist", () => {
    const briefing = buildGrowthBriefing([], "zh");
    expect(briefing.sampleSize).toBe(0);
    expect(briefing.platform).toBeNull();
    expect(briefing.priorities[0].stage).toBe("measurement");
    expect(briefing.experiment).toBeNull();
    expect(briefing.missingData.length).toBeGreaterThan(0);
  });

  it("turns account results into one controlled three-variant experiment", () => {
    const briefing = buildGrowthBriefing([
      sample({
        kitId: "kit-1",
        title: "99%的设计师只会做不会说",
        impressions: 286,
        views: 19,
        coverClickRate: 5.6,
        averageViewSeconds: 14.5,
        likes: 2
      }),
      sample({
        kitId: "kit-2",
        title: "设计师焦虑的真相，可能搞反了",
        impressions: 571,
        views: 31,
        coverClickRate: 5.1,
        averageViewSeconds: 5.9,
        likes: 2
      })
    ], "zh");

    expect(briefing.platform).toBe("xiaohongshu");
    expect(briefing.sampleSize).toBe(2);
    expect(briefing.priorities[0].stage).toBe("value");
    expect(briefing.experiment?.variants).toHaveLength(3);
    expect(briefing.experiment?.primaryMetricKey).toBe("save_share_per_thousand");
    expect(briefing.experiment?.baselineValue).toBe(0);
    expect(briefing.experiment?.successThreshold).toBe(5);
    expect(briefing.experiment?.workbenchIdea).toContain("3:4");
    expect(briefing.experiment?.workbenchIdea).toContain("每页一个结论");
  });

  it("detects profile-to-follow conversion as the bottleneck from account analytics", () => {
    const briefing = buildGrowthBriefing([
      sample({
        impressions: 4771,
        views: 984,
        coverClickRate: 20.6,
        averageViewSeconds: 9.2,
        likes: 8,
        comments: 2,
        saves: 1,
        shares: 5,
        profileVisits: 45,
        followerGrowth: -2
      })
    ], "zh");

    expect(briefing.priorities.some((priority) => priority.stage === "conversion")).toBe(true);
    expect(briefing.northStar.value).toBe("-2.0");
    expect(briefing.summary).toContain("不要同时重写所有环节");
  });
});
