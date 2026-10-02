import { describe, expect, it } from "vitest";
import { assessContentReadiness } from "@/lib/content-readiness";

describe("content readiness", () => {
  it("blocks a vague Xiaohongshu draft and names the weakest publishing dimension", () => {
    const report = assessContentReadiness({
      platform: "xiaohongshu",
      title: "一些想法",
      body: "今天分享一点感受。",
      cta: "关注吧"
    }, "zh");
    expect(report.status).toBe("blocked");
    expect(report.score).toBeLessThan(55);
    expect(report.primaryBlocker.action.length).toBeGreaterThan(8);
  });

  it("weights the active mission metric when choosing the first improvement", () => {
    const report = assessContentReadiness({
      platform: "xiaohongshu",
      title: "设计师只会做不会说？我把 7 天复盘变成一张检查表",
      body: "先说结论：问题不是能力，而是表达顺序。\n\n1. 先写真实场景\n2. 给出过程截图\n3. 用检查表收束\n\n这次我用自己的页面和复盘数据做了验证。",
      cta: "关注这个系列，下一篇继续公开真实复盘。"
    }, "zh", {
      primaryMetricKey: "followers_per_thousand",
      primaryMetric: "每千次观看新增关注",
      hypothesis: "持续栏目承诺会改善关注转化"
    });
    expect(report.skillPlan.outcome).toBe("每千次观看新增关注");
    expect(report.skillPlan.strategy).toBe("story-driven");
    expect(report.primaryBlocker.key).toBe("conversion");
  });

  it("asks the user to verify factual numbers instead of rewarding them as evidence", () => {
    const report = assessContentReadiness({
      platform: "linkedin",
      title: "How our launch changed",
      body: "We helped 120 customers increase signups by 80% in 2 weeks.\n\nHere is the workflow we used.",
      cta: "Reply if you want the checklist."
    }, "en");

    expect(report.publishability.status).toBe("verify-facts");
    expect(report.publishability.label).toContain("Verify facts");
    expect(report.publishability.findings.join(" ")).toContain("source check");
  });

  it("blocks obvious guarantee and absolute-safety language", () => {
    const report = assessContentReadiness({
      platform: "xiaohongshu",
      title: "百分之百有效的方法",
      body: "这个方案保证成功，而且零风险。",
      cta: "现在开始"
    }, "zh");

    expect(report.status).toBe("blocked");
    expect(report.publishability.status).toBe("platform-risk");
    expect(report.publishability.label).toBe("不符合发布要求");
  });
});
