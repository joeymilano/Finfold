import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "@/lib/prompts";

describe("generation prompts", () => {
  it("captures platform voice differences for Reddit and Xiaohongshu", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Finfold helps founders turn one product idea into content for every platform without sounding generic.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["reddit", "xiaohongshu"],
      mediaAssets: [],
      language: "auto"
    });

    expect(prompt).toContain("Reddit");
    expect(prompt).toContain("not a marketer");
    expect(prompt).toContain("小红书");
    expect(prompt).toContain("痛点");
  });

  it("requires structured output fields", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Finfold helps founders turn one product idea into content for every platform without sounding generic.",
      goal: "product-launch",
      persona: "indie-builder",
      platforms: ["product-hunt"],
      mediaAssets: [],
      language: "auto"
    });

    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"body"');
    expect(prompt).toContain('"cta"');
    expect(prompt).toContain('"notes"');
    expect(prompt).toContain('"strategy"');
  });

  it("forbids generic house-brand filler when the input is about another product", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Launch OS helps B2B AI teams turn release notes into founder-native LinkedIn and Xiaohongshu posts.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["linkedin"],
      mediaAssets: [],
      language: "en"
    });

    expect(prompt).toContain('Every output must directly reflect the user\'s product');
    expect(prompt).toContain('at least 2 concrete details from Product / Idea');
    expect(prompt).toContain('NEVER mention "Finfold" or "Finfold"');
  });
});
