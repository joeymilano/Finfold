import { describe, expect, it } from "vitest";
import {
  buildXhsAnalyticsReport,
  importedRowsToGrowthSamples,
  normalizeXhsEvidenceAccountUrl,
  normalizeXhsMetricTable,
  parseCsvTable,
  parseXhsTabularText,
  xhsImportAccountAssociation,
  xhsImportStorageId
} from "@/lib/agent/xhs-data-import";

const now = new Date("2026-07-29T00:00:00.000Z");

function sample(overrides: Record<string, unknown> = {}) {
  return {
    kitId: crypto.randomUUID(),
    platform: "xiaohongshu" as const,
    title: "测试笔记",
    scope: "post" as const,
    measuredAt: "2026-07-10T00:00:00.000Z",
    impressions: 1000,
    views: 100,
    clicks: 0,
    coverClickRate: 10,
    averageViewSeconds: 10,
    likes: 10,
    comments: 2,
    saves: 3,
    shares: 2,
    followerGrowth: 1,
    profileVisits: 5,
    leads: 0,
    signups: 0,
    revenue: 0,
    ...overrides
  };
}

describe("Xiaohongshu private data import", () => {
  it("binds imported evidence to a canonical HTTPS account identity", () => {
    expect(normalizeXhsEvidenceAccountUrl("https://www.xiaohongshu.com/user/profile/abc/?xsec=tracking#top")).toBe(
      "https://www.xiaohongshu.com/user/profile/abc"
    );
    expect(normalizeXhsEvidenceAccountUrl("http://www.xiaohongshu.com/user/profile/abc")).toBeNull();
    expect(xhsImportAccountAssociation(
      { accountUrl: "https://www.xiaohongshu.com/user/profile/a?share=1" },
      "https://www.xiaohongshu.com/user/profile/a"
    )).toBe("match");
    expect(xhsImportAccountAssociation(
      { accountUrl: "https://www.xiaohongshu.com/user/profile/a" },
      "https://www.xiaohongshu.com/user/profile/b"
    )).toBe("mismatch");
    expect(xhsImportAccountAssociation({}, "https://www.xiaohongshu.com/user/profile/a")).toBe("legacy_unbound");
  });
  it("uses a tenant-scoped deterministic UUID for concurrent duplicates", async () => {
    const first = await xhsImportStorageId("user-1", "workflow-1", "fingerprint-a");
    const duplicate = await xhsImportStorageId("user-1", "workflow-1", "fingerprint-a");
    const otherTenant = await xhsImportStorageId("user-2", "workflow-1", "fingerprint-a");

    expect(first).toBe(duplicate);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(otherTenant).not.toBe(first);
  });

  it("parses quoted CSV cells and normalizes Chinese metric headers", () => {
    const table = parseCsvTable(
      "标题,发布日期,曝光量,阅读量,封面点击率,收藏数\n\"标题里有,逗号\",2026-07-10,1000,120,12%,8"
    );
    const normalized = normalizeXhsMetricTable(table);
    expect(normalized.rows).toHaveLength(1);
    expect(normalized.rows[0]).toMatchObject({
      title: "标题里有,逗号",
      impressions: 1000,
      views: 120,
      coverClickRate: 12,
      saves: 8
    });
    expect(importedRowsToGrowthSamples(normalized.rows, "import-1")[0].platform).toBe("xiaohongshu");
  });

  it("accepts Creator Center tabular paste, Chinese units, durations, and all-zero rows", () => {
    const normalized = normalizeXhsMetricTable(parseXhsTabularText(
      "标题\t发布日期\t曝光量\t阅读量\t平均观看时长\t收藏数\n零值笔记\t2026-07-10\t0\t0\t00:18\t0\n万级笔记\t2026-07-11\t1.2万\t3千\t01:05\t8"
    ));
    expect(normalized.rows).toHaveLength(2);
    expect(normalized.rows[0]).toMatchObject({ impressions: 0, views: 0, averageViewSeconds: 18, saves: 0 });
    expect(normalized.rows[0].observedMetrics).toContain("impressions");
    expect(normalized.rows[1]).toMatchObject({ impressions: 12_000, views: 3_000, averageViewSeconds: 65 });
  });

  it("keeps blank metric cells unknown instead of converting them to observed zero", () => {
    const normalized = normalizeXhsMetricTable(parseCsvTable(
      "标题,发布日期,曝光量,阅读量,收藏数\n部分字段,2026-07-10,0,,0"
    ));
    expect(normalized.rows[0].observedMetrics).toContain("impressions");
    expect(normalized.rows[0].observedMetrics).toContain("saves");
    expect(normalized.rows[0].observedMetrics).not.toContain("views");
  });

  it("excludes posts younger than seven days and refuses a trend below five mature posts", () => {
    const report = buildXhsAnalyticsReport([
      sample(),
      sample({ measuredAt: "2026-07-27T00:00:00.000Z" })
    ], "zh", now);
    expect(report.sampleSize).toBe(2);
    expect(report.matureSampleSize).toBe(1);
    expect(report.youngExcluded).toBe(1);
    expect(report.trendEligible).toBe(false);
    expect(report.limitations.join(" ")).toContain("发布不足 7 天");
    expect(report.limitations.join(" ")).toContain("不总结长期趋势");
  });

  it("uses quartiles and routes to the earliest measurable break", () => {
    const click = buildXhsAnalyticsReport([
      sample({ coverClickRate: 3 }),
      sample({ coverClickRate: 4 }),
      sample({ coverClickRate: 2 }),
      sample({ coverClickRate: 5 }),
      sample({ coverClickRate: 6 })
    ], "zh", now);
    expect(click.bottleneck).toBe("click");
    expect(click.distributions.coverClickRate).toEqual({
      count: 5,
      p25: 3,
      median: 4,
      p75: 5
    });

    const retention = buildXhsAnalyticsReport([
      sample({ averageViewSeconds: 3 }),
      sample({ averageViewSeconds: 4 }),
      sample({ averageViewSeconds: 5 }),
      sample({ averageViewSeconds: 5 }),
      sample({ averageViewSeconds: 5 })
    ], "zh", now);
    expect(retention.bottleneck).toBe("retention");
  });

  it("stops without inventing a downstream cause when the legacy sample cannot distinguish missing from zero", () => {
    const report = buildXhsAnalyticsReport([
      sample({ views: 0, coverClickRate: 0, averageViewSeconds: 0 })
    ], "zh", now);
    expect(report.bottleneck).toBe("measurement");
    expect(report.summary).toContain("不足以归因");
    expect(report.confidence).toBe("measured");
    expect(report.limitations.join(" ")).toContain("不是已证实的因果关系");
  });
});
