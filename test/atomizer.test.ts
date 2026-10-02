import { describe, expect, it } from "vitest";
import { atomizeContent } from "@/lib/atomizer";

describe("content atomizer", () => {
  it("turns one source into ten reusable content assets", () => {
    const kit = atomizeContent({
      sourceText:
        "Finfold helps global solo founders and AI SaaS teams turn one product idea into native content for Xiaohongshu, WeChat, X, LinkedIn, Reddit, and Product Hunt without hiring a marketing team.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["xiaohongshu", "wechat", "x"],
      language: "en"
    });

    expect(kit.assets).toHaveLength(10);
    expect(kit.assets.map((asset) => asset.format)).toEqual([
      "short-post",
      "long-post",
      "faq",
      "video-script",
      "email",
      "thread",
      "case-study",
      "comparison",
      "checklist",
      "founder-note"
    ]);
  });

  it("rotates selected platforms across atomized assets", () => {
    const kit = atomizeContent({
      sourceText:
        "A founder content operating system that helps small global teams turn product positioning into platform-native content workflows.",
      goal: "product-launch",
      persona: "global-team",
      platforms: ["linkedin", "reddit"],
      language: "zh"
    });

    expect(new Set(kit.assets.map((asset) => asset.platform))).toEqual(new Set(["linkedin", "reddit"]));
  });

  it("keeps every asset copy-ready with a title body and CTA", () => {
    const kit = atomizeContent({
      sourceText:
        "A content workflow for consultants that repackages one strong insight into authority-building posts, FAQs, scripts, and email follow-ups.",
      goal: "audience-growth",
      persona: "consultant",
      platforms: ["wechat"],
      language: "en"
    });

    for (const asset of kit.assets) {
      expect(asset.title.length).toBeGreaterThan(0);
      expect(asset.body.length).toBeGreaterThan(20);
      expect(asset.cta.length).toBeGreaterThan(0);
    }
  });
});
