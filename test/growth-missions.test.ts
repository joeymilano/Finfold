import { describe, expect, it } from "vitest";
import { performanceMetricsSchema } from "@/lib/content-schema";
import {
  assessMissionOutcome,
  hasMissionEvidence,
  metricValueForMission
} from "@/lib/agent/growth-missions";

function metrics(overrides: Record<string, unknown> = {}) {
  return performanceMetricsSchema.parse({
    platform: "xiaohongshu",
    impressions: 1000,
    views: 200,
    coverClickRate: 20,
    averageViewSeconds: 8,
    saves: 12,
    shares: 8,
    followerGrowth: 3,
    ...overrides
  });
}

describe("Growth Mission evaluation", () => {
  it("calculates the exact metric selected by the diagnosis", () => {
    const sample = metrics();

    expect(metricValueForMission("impressions", sample)).toBe(1000);
    expect(metricValueForMission("cover_click_rate", sample)).toBe(20);
    expect(metricValueForMission("average_view_seconds", sample)).toBe(8);
    expect(metricValueForMission("save_share_per_thousand", sample)).toBe(100);
    expect(metricValueForMission("followers_per_thousand", sample)).toBe(15);
    expect(metricValueForMission("leads", sample)).toBe(sample.leads);
    expect(metricValueForMission("signups", sample)).toBe(sample.signups);
    expect(metricValueForMission("revenue", sample)).toBe(sample.revenue);
  });

  it("derives cover CTR from views when the platform does not provide it", () => {
    expect(
      metricValueForMission(
        "cover_click_rate",
        metrics({ coverClickRate: 0, impressions: 500, views: 50 })
      )
    ).toBe(10);
  });

  it("returns won, lost, or inconclusive from baseline and target", () => {
    expect(assessMissionOutcome(10, 12, 13)).toBe("won");
    expect(assessMissionOutcome(10, 12, 7)).toBe("lost");
    expect(assessMissionOutcome(10, 12, 11)).toBe("inconclusive");
    expect(assessMissionOutcome(0, 5, 0)).toBe("inconclusive");
  });

  it("waits for the selected metric to have enough evidence", () => {
    const empty = metrics({
      impressions: 0,
      views: 0,
      clicks: 0,
      averageViewSeconds: 0
    });
    expect(hasMissionEvidence("impressions", empty)).toBe(false);
    expect(hasMissionEvidence("cover_click_rate", empty)).toBe(false);
    expect(hasMissionEvidence("average_view_seconds", empty)).toBe(false);
    expect(hasMissionEvidence("save_share_per_thousand", empty)).toBe(false);
    expect(hasMissionEvidence("followers_per_thousand", empty)).toBe(false);
    expect(hasMissionEvidence("leads", empty)).toBe(false);

    const viewed = metrics({ views: 200, followerGrowth: 0, saves: 0, shares: 0 });
    expect(hasMissionEvidence("save_share_per_thousand", viewed)).toBe(true);
    expect(hasMissionEvidence("followers_per_thousand", viewed)).toBe(true);
    expect(hasMissionEvidence("leads", { ...viewed, measuredAt: new Date().toISOString() })).toBe(true);
  });
});
