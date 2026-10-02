import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import { buildArticleIllustrationPlan } from "@/lib/article-illustrations";

const output = {
  title: "一套内容系统如何减少重复劳动",
  body: [
    "每次发布新品，团队都会把同一个核心信息重新改写多次。这不是创意问题，而是流程没有形成系统。",
    "首先保留事实与核心观点，然后按照平台阅读习惯调整开头、结构和行动号召。",
    "以前每个平台需要从空白开始，现在只需要审核差异和风险。",
    "在一次完整发布中，修改次数从十二次降到四次，但这个数字只属于本次项目。",
    "最后把表现数据带回下一轮，让系统逐渐知道什么值得继续使用。"
  ].join("\n\n")
};

describe("article illustration planning", () => {
  it("finds evidence-bound illustration positions for long-form channels", () => {
    const plan = buildArticleIllustrationPlan(output, "wechat", "zh", { theme: "editorial" });
    expect(plan.eligible).toBe(true);
    expect(plan.briefs.length).toBeGreaterThanOrEqual(2);
    expect(plan.briefs[0].placementHint).toContain("放在这段内容之后");
    expect(plan.briefs.every((brief) => brief.prompt.includes(brief.sourceExcerpt))).toBe(true);
    expect(plan.briefs.every((brief) => brief.prompt.includes("never invent charts, numbers, or UI") || brief.role !== "evidence")).toBe(true);
  });

  it("does not add article illustrations to short social formats", () => {
    const plan = buildArticleIllustrationPlan(output, "x", "zh", { theme: "signal" });
    expect(plan).toMatchObject({ eligible: false, briefs: [] });
  });

  it("carries visual memory into a consistent multi-image direction", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      visualIdentity: {
        preferredTheme: "signal",
        styleKeywords: ["ink diagrams"],
        avoidStyles: ["glossy 3D"],
        palette: { primary: "#171714", accent: "#f05a2a", background: "#f3efe3" },
        referenceImageUrls: [],
        learnedPreferences: []
      }
    });
    const plan = buildArticleIllustrationPlan(output, "medium-substack", "en", { theme: "signal" }, brain);
    expect(plan.continuityDirection).toContain("ink diagrams");
    expect(plan.continuityDirection).toContain("#f05a2a");
    expect(plan.briefs.every((brief) => brief.prompt.includes("glossy 3D"))).toBe(true);
  });
});
