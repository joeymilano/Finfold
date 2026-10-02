import { describe, expect, it } from "vitest";
import {
  buildWeeklyGrowthReport,
  selectXhsImportComparisonPair,
  weeklyTotalsFromXhsRows,
  type WeeklyMetricTotals
} from "@/lib/agent/weekly-growth-report";

const now = new Date("2026-07-28T08:00:00.000Z");

function totals(overrides: Partial<WeeklyMetricTotals> = {}): WeeklyMetricTotals {
  return {
    samples: 3,
    impressions: 5000,
    views: 1000,
    coverClickRate: 20,
    averageViewSeconds: 8,
    likes: 50,
    comments: 10,
    saves: 30,
    shares: 10,
    followerGrowth: 5,
    profileVisits: 80,
    ...overrides
  };
}

describe("weekly growth report", () => {
  it("never compares imports across Xiaohongshu accounts or legacy workflows", () => {
    const snapshots = [
      { id: "new-a", created_at: "2026-07-28", workflow_id: "workflow-a", normalized_rows: [], provenance: { accountUrl: "https://www.xiaohongshu.com/user/profile/a?source=share" } },
      { id: "new-b", created_at: "2026-07-27", workflow_id: "workflow-b", normalized_rows: [], provenance: { accountUrl: "https://www.xiaohongshu.com/user/profile/b" } },
      { id: "old-a", created_at: "2026-07-21", workflow_id: "workflow-old", normalized_rows: [], provenance: { accountUrl: "https://www.xiaohongshu.com/user/profile/a" } }
    ];
    expect(selectXhsImportComparisonPair(snapshots)?.map((item) => item.id)).toEqual(["new-a", "old-a"]);

    expect(selectXhsImportComparisonPair([
      { id: "legacy-a", created_at: "2026-07-28", workflow_id: "workflow-a", normalized_rows: [] },
      { id: "legacy-b", created_at: "2026-07-21", workflow_id: "workflow-b", normalized_rows: [] }
    ])).toBeNull();
  });

  it("compares Creator Center imports as the user's own snapshots", () => {
    const rows = [{
      title: "笔记 A",
      impressions: 1000,
      views: 100,
      coverClickRate: 10,
      averageViewSeconds: 8,
      likes: 10,
      comments: 1,
      saves: 5,
      shares: 2,
      followerGrowth: 1,
      profileVisits: 8,
      observedMetrics: [
        "impressions", "views", "coverClickRate", "averageViewSeconds", "likes",
        "comments", "saves", "shares", "followerGrowth", "profileVisits"
      ] as const
    }];
    const imported = weeklyTotalsFromXhsRows(rows.map((row) => ({
      ...row,
      observedMetrics: [...row.observedMetrics]
    })));
    const report = buildWeeklyGrowthReport({
      platform: "xiaohongshu",
      mode: "creator_center_imports",
      current: imported,
      previous: { ...imported, impressions: 900 },
      currentKey: "import-2",
      previousKey: "import-1"
    }, "zh", now);

    expect(report.comparisonLabel).toBe("最近两次创作中心导入");
    expect(report.fingerprint).toContain("creator_center_imports");
  });

  it("detects a conversion anomaly from real before/after values without claiming causation", () => {
    const report = buildWeeklyGrowthReport({
      platform: "xiaohongshu",
      mode: "account_snapshots",
      current: totals({ followerGrowth: -2 }),
      previous: totals({ followerGrowth: 6 }),
      currentKey: "2026-07-28",
      previousKey: "2026-07-21"
    }, "zh", now);

    expect(report.anomalies[0]).toMatchObject({
      id: "conversion_drop",
      severity: "critical",
      stage: "conversion"
    });
    expect(report.headline).toContain("观看没有转成关注");
    expect(report.summary).toContain("需要验证的漏斗信号");
    expect(report.nextAction?.metric).toBe("每千次观看新增关注");
  });

  it("prioritizes a complete publishing gap over secondary metric declines", () => {
    const report = buildWeeklyGrowthReport({
      platform: "x",
      mode: "post_cohorts",
      current: totals({
        samples: 0,
        impressions: 0,
        views: 0,
        followerGrowth: 0
      }),
      previous: totals({ samples: 2 }),
      currentKey: "2026-07-28",
      previousKey: "2026-07-21"
    }, "zh", now);

    expect(report.anomalies[0]?.id).toBe("publishing_gap");
    expect(report.anomalies[0]?.metric).toBe("每周可测量发布数");
  });

  it("reports stable performance without inventing an alert", () => {
    const report = buildWeeklyGrowthReport({
      platform: "linkedin",
      mode: "post_cohorts",
      current: totals({ impressions: 5200, views: 1040, followerGrowth: 6 }),
      previous: totals(),
      currentKey: "2026-07-28",
      previousKey: "2026-07-21"
    }, "zh", now);

    expect(report.anomalies).toEqual([]);
    expect(report.headline).toContain("没有显著下滑");
    expect(report.nextAction).toBeNull();
  });
});
