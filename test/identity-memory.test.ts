import { describe, expect, it } from "vitest";
import { brandBrainSchema, buildBrainPromptSection, getBrainCompleteness } from "@/lib/brand-brain";

describe("identity memory", () => {
  it("treats websites and social profiles as optional for completeness", () => {
    const personal = brandBrainSchema.parse({
      identityType: "personal",
      brandName: "开发者老王",
      productDescription: "Helps independent creators build durable content systems.",
      targetAudience: "Independent creators",
      positioningStatement: "Creator systems without the hustle theatre",
      toneKeywords: ["direct"],
      bannedPhrases: ["game-changing"]
    });

    expect(personal.sourceUrl).toBeUndefined();
    expect(personal.socialProfiles).toEqual([]);
    expect(personal.visualIdentity.preferredTheme).toBe("auto");
    expect(getBrainCompleteness(personal)).toBe(100);
  });

  it("describes a personal IP without forcing product language", () => {
    const prompt = buildBrainPromptSection(brandBrainSchema.parse({
      identityType: "personal",
      brandName: "开发者老王",
      productDescription: "Design and product strategy",
      targetAudience: "Early-stage founders",
      socialProfiles: [{ id: "x-1", platform: "x", url: "https://x.com/creatorwang", handle: "creatorwang" }]
    }));

    expect(prompt).toContain("Identity Type: Personal creator / expert");
    expect(prompt).toContain("Creator / IP Name: 开发者老王");
    expect(prompt).toContain("Expertise and Value: Design and product strategy");
    expect(prompt).not.toContain("Product: Design and product strategy");
    expect(prompt).toContain("https://x.com/creatorwang");
  });

  it("keeps platform-specific memory scoped to the named platform in prompts", () => {
    const prompt = buildBrainPromptSection(brandBrainSchema.parse({
      brandName: "Finfold",
      platformMemory: [{
        id: "platform-memory-1",
        platform: "x",
        kind: "preference",
        value: "Lead with a concrete trade-off.",
        source: "manual",
        confidence: "high",
        createdAt: "2026-08-06T10:00:00.000Z"
      }]
    }));

    expect(prompt).toContain("apply each rule ONLY to its named platform");
    expect(prompt).toContain("x [preference; high confidence]: Lead with a concrete trade-off.");
  });

  it("omits an otherwise empty memory section when no platform rule applies", () => {
    const prompt = buildBrainPromptSection(brandBrainSchema.parse({
      platformMemory: [{
        id: "platform-memory-1",
        platform: "x",
        kind: "preference",
        value: "Lead with a concrete trade-off.",
        source: "manual",
        confidence: "high",
        createdAt: "2026-08-06T10:00:00.000Z"
      }]
    }), ["wechat"]);

    expect(prompt).toBe("");
  });
});
