import { describe, expect, it } from "vitest";
import { parseXhsScreenshotExtraction } from "@/lib/agent/xhs-screenshot-import";

describe("Xiaohongshu Creator Center screenshot extraction", () => {
  it("normalizes only visible metrics and preserves confirmed zero", () => {
    const result = parseXhsScreenshotExtraction(JSON.stringify({
      rows: [{
        title: "截图笔记",
        publishedAt: "2026-08-01",
        impressions: 0,
        views: 120,
        saves: 0
      }],
      warnings: ["封面点击率被遮挡"]
    }));
    expect(result.rows[0]).toMatchObject({
      title: "截图笔记",
      impressions: 0,
      views: 120,
      saves: 0
    });
    expect(result.rows[0].observedMetrics).toEqual(["impressions", "views", "saves"]);
    expect(result.warnings).toContain("封面点击率被遮挡");
  });

  it("drops metric-free hallucinated rows and flags an invalid date", () => {
    const result = parseXhsScreenshotExtraction(`\`\`\`json
      {"rows":[{"title":"空行"},{"title":"有效行","publishedAt":"看不清","likes":2}],"warnings":[]}
    \`\`\``);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe("有效行");
    expect(result.rows[0].publishedAt).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("成熟度");
  });
});
