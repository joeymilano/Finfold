import { describe, expect, it } from "vitest";
import { buildContentSkillPlan } from "@/lib/content-skills";
import { buildVisualIntelligencePlan } from "@/lib/visual-intelligence";

const output = {
  platform: "xiaohongshu" as const,
  title: "设计师焦虑的真相",
  body: "我最近重新看了自己的工作流。\n\n真正的问题不是不会设计，而是不知道怎么讲清楚价值。",
  cta: "关注这个系列，下一篇会给出完整检查表。"
};

describe("content skills", () => {
  it("turns a cover-click mission into a visual-first single-variable plan", () => {
    const plan = buildContentSkillPlan(output, "zh", {
      primaryMetricKey: "cover_click_rate",
      primaryMetric: "封面点击率",
      hypothesis: "更具体的封面承诺会增加打开"
    });
    expect(plan.id).toBe("xhs-native-carousel");
    expect(plan.strategy).toBe("visual-first");
    expect(plan.layout).toBe("sparse");
    expect(plan.outcome).toBe("封面点击率");
    expect(plan.steps.join(" ")).toContain("保持正文基本不变");
  });

  it("selects a WeChat publishing package with an editorial handoff", () => {
    const plan = buildContentSkillPlan({ ...output, platform: "wechat" }, "zh");
    expect(plan.id).toBe("wechat-editorial-package");
    expect(plan.primaryAction).toBe("publication");
    expect(plan.steps.join(" ")).toContain("公众号兼容 HTML");
  });

  it("selects an X thread package and a matching media-story handoff", () => {
    const xOutput = { ...output, platform: "x" as const };
    const plan = buildContentSkillPlan(xOutput, "zh");
    const visual = buildVisualIntelligencePlan(xOutput, "zh");

    expect(plan.id).toBe("x-thread-media-package");
    expect(plan.primaryAction).toBe("story");
    expect(plan.steps.join(" ")).toContain("5–12 条");
    expect(visual.assetKind).toBe("thread-media");
    expect(visual.primaryStudio).toBe("story");
    expect(visual.formatId).toBe("square-1x1");
  });
});
