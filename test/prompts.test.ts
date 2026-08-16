import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "@/lib/prompts";
import { brandBrainSchema } from "@/lib/brand-brain";

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

  it("builds Zhihu answers around evidence, reader questions, and required AI disclosure", () => {
    const prompt = buildGenerationPrompt({
      ideaText: "Finfold helps a small product team turn one release note into channel-specific drafts while preserving its real facts and brand voice.",
      goal: "audience-growth",
      persona: "ai-saas",
      platforms: ["zhihu"],
      mediaAssets: [],
      language: "zh"
    });

    expect(prompt).toContain("ZHIHU FORMAT AND COMMUNITY RULES");
    expect(prompt).toContain("answer it immediately");
    expect(prompt).toContain("NEVER invent first-person experience");
    expect(prompt).toContain("包含 AI 辅助创作");
    expect(prompt).toContain("disclose the author's relationship to the product");
  });

  it("requires X output to be a paste-ready numbered thread with a media plan", () => {
    const prompt = buildGenerationPrompt({
      ideaText: "Finfold helps founders turn product updates into concrete, platform-native content packages.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["x"],
      mediaAssets: [],
      language: "en"
    });

    expect(prompt).toContain('literal "1/", "2/"');
    expect(prompt).toContain("compact media plan");
    expect(prompt).toContain("lead card only");
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

  it("injects proven-high-performer examples only for platforms that have them", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Finfold helps founders turn one product idea into content for every platform without sounding generic.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["reddit", "xiaohongshu"],
      mediaAssets: [],
      language: "auto",
      perfExamples: {
        reddit: [{ title: "I built a thing", body: "Here's what I learned", likes: 42, comments: 9 }]
      }
    });

    expect(prompt).toContain("PROVEN HIGH PERFORMERS");
    expect(prompt).toContain("42 likes, 9 comments");
    expect(prompt).toContain("I built a thing");

    // Xiaohongshu had no examples in perfExamples — its block must stay clean.
    const xhsBlockStart = prompt.indexOf('id: "xiaohongshu"');
    const xhsBlock = prompt.slice(xhsBlockStart, xhsBlockStart + 800);
    expect(xhsBlock).not.toContain("PROVEN HIGH PERFORMERS");
  });

  it("omits the proven-high-performer section entirely when no examples are provided", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Finfold helps founders turn one product idea into content for every platform without sounding generic.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["reddit"],
      mediaAssets: [],
      language: "auto"
    });

    expect(prompt).not.toContain("PROVEN HIGH PERFORMERS");
  });

  it("injects human-writing rules without asking for Markdown emphasis", () => {
    const prompt = buildGenerationPrompt({
      ideaText:
        "Launch OS helps B2B AI teams turn product updates into platform-native launch content with stronger hooks and clearer positioning.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["wechat", "linkedin"],
      mediaAssets: [],
      language: "bilingual"
    });

    expect(prompt).toContain("HUMAN WRITING RULES");
    expect(prompt).toContain("Never invent a founder experience");
    expect(prompt).toContain("NEVER output literal Markdown emphasis markers");
    expect(prompt).toContain("Put key sentences on their own short line");
    expect(prompt).not.toContain("Bold key sentences on their own line");
  });

  it("injects platform memory only for selected output platforms", () => {
    const prompt = buildGenerationPrompt({
      ideaText: "Launch OS helps B2B teams turn release notes into useful content.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["wechat"],
      mediaAssets: [],
      language: "zh",
      brandBrain: brandBrainSchema.parse({
        platformMemory: [
          {
            id: "x-memory",
            platform: "x",
            kind: "preference",
            value: "Lead with a concrete trade-off.",
            source: "manual",
            confidence: "high",
            createdAt: "2026-08-06T10:00:00.000Z"
          },
          {
            id: "wechat-memory",
            platform: "wechat",
            kind: "fact",
            value: "The account publishes long-form product essays.",
            source: "manual",
            confidence: "high",
            createdAt: "2026-08-06T10:00:00.000Z"
          }
        ]
      })
    });

    expect(prompt).toContain("The account publishes long-form product essays.");
    expect(prompt).not.toContain("Lead with a concrete trade-off.");
  });
});
