import { describe, expect, it } from "vitest";
import { buildVisualIntelligencePlan } from "@/lib/visual-intelligence";

function output(platform: Parameters<typeof buildVisualIntelligencePlan>[0]["platform"], body: string) {
  return {
    platform,
    title: "同一条内容，不该手工重做七遍",
    body,
    cta: "保存这套方法，下次发布前直接复用。"
  };
}

describe("visual intelligence", () => {
  it("prepares a save-worthy Xiaohongshu carousel without asking the user to choose a skill", () => {
    const plan = buildVisualIntelligencePlan(output("xiaohongshu", "先保留核心观点。\n- 重写开头\n- 调整结构\n- 检查事实\n- 加入行动\n- 适配标签"), "zh");
    expect(plan.assetKind).toBe("carousel");
    expect(plan.primaryStudio).toBe("story");
    expect(plan.formatId).toBe("portrait-3x4");
    expect(plan.pageCount).toBe(7);
    expect(plan.title).toContain("平台原生图文");
    expect(plan.skillId).toBe("xhs-native-carousel");
    expect(plan.strategy).toBe("information-dense");
    expect(plan.layout).toBe("checklist");
  });

  it("prioritizes the article entry image for WeChat", () => {
    const plan = buildVisualIntelligencePlan(output("wechat", "这是一篇完整的品牌文章，解释问题、方法和下一步。"), "zh");
    expect(plan.assetKind).toBe("article-cover");
    expect(plan.primaryStudio).toBe("cover");
    expect(plan.formatId).toBe("wechat-2.35x1");
    expect(plan.skillId).toBe("wechat-editorial-package");
  });

  it("treats Zhihu as an evidence-led answer package", () => {
    const plan = buildVisualIntelligencePlan(output("zhihu", "先回答问题，再交代证据、适用范围和发布前披露。"), "zh");
    expect(plan.assetKind).toBe("article-cover");
    expect(plan.primaryStudio).toBe("cover");
    expect(plan.skillId).toBe("zhihu-answer-package");
    expect(plan.formatId).toBe("social-preview");
  });

  it("uses a technical visual system when the source contains product and data signals", () => {
    const plan = buildVisualIntelligencePlan(output("linkedin", "Our API workflow turns product data into a measurable automation system."), "en");
    expect(plan.theme).toBe("signal");
    expect(plan.formatSummary).toBe("1080×1350 · 4:5");
  });

  it("scales a dense launch narrative into a nine-page gallery", () => {
    const denseBody = Array.from({ length: 9 }, (_, index) => `${index + 1}. Proof point ${index + 1}`).join("\n") + " value".repeat(600);
    const plan = buildVisualIntelligencePlan(output("product-hunt", denseBody), "en");
    expect(plan.assetKind).toBe("launch-gallery");
    expect(plan.pageCount).toBe(9);
    expect(plan.formatId).toBe("product-hunt-gallery");
  });

  it("lets explicit brand visual memory override content-level theme inference", () => {
    const plan = buildVisualIntelligencePlan(output("linkedin", "Our API and data workflow is deeply technical."), "en", {
      toneKeywords: [],
      visualIdentity: {
        preferredTheme: "field-notes",
        styleKeywords: ["human"],
        avoidStyles: [],
        palette: { primary: "", accent: "", background: "" },
        referenceImageUrls: [],
        learnedPreferences: []
      }
    });
    expect(plan.theme).toBe("field-notes");
    expect(plan.brandAligned).toBe(true);
    expect(plan.paletteOverride).toBeUndefined();
  });

  it("maps stored brand colors into carousel rendering tokens", () => {
    const plan = buildVisualIntelligencePlan(output("xiaohongshu", "A calm founder story."), "en", {
      toneKeywords: [],
      visualIdentity: {
        preferredTheme: "auto",
        styleKeywords: [],
        avoidStyles: [],
        palette: { primary: "#112233", accent: "#ff5500", background: "#fffaf0" },
        referenceImageUrls: [],
        learnedPreferences: []
      }
    });
    expect(plan.paletteOverride).toEqual({ paper: "#fffaf0", ink: "#112233", accent: "#ff5500" });
  });

  it("uses a sufficiently evidenced platform preference while visual memory remains automatic", () => {
    const plan = buildVisualIntelligencePlan(output("linkedin", "A calm founder reflection."), "en", {
      toneKeywords: [],
      visualIdentity: {
        preferredTheme: "auto",
        styleKeywords: [],
        avoidStyles: [],
        palette: { primary: "", accent: "", background: "" },
        referenceImageUrls: [],
        learnedPreferences: [{ platform: "linkedin", theme: "editorial", sampleSize: 8, liftPercent: 38, updatedAt: "2026-07-15" }]
      }
    });
    expect(plan.theme).toBe("editorial");
    expect(plan.brandAligned).toBe(true);
  });
});
