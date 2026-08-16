import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import { mapBrandBrainFromRow, mapBrandBrainToRow, type BrandBrainRow } from "@/lib/brand-brain-persistence";

describe("brand brain persistence mapping", () => {
  it("maps a Brand Brain into database columns", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      productDescription: "Turns one idea into platform-native content.",
      targetAudience: "global founders going global",
      toneKeywords: ["clear", "founder-led"],
      bannedPhrases: ["game-changing"],
      approvedExamples: ["A concise founder note"],
      competitors: ["Generic AI writers"],
      positioningStatement: "Content growth OS"
    });

    expect(mapBrandBrainToRow(brain)).toMatchObject({
      identity_type: "personal",
      brand_name: "Finfold",
      product_description: "Turns one idea into platform-native content.",
      target_audience: "global founders going global",
      tone_keywords: ["clear", "founder-led"],
      banned_phrases: ["game-changing"],
      approved_examples: ["A concise founder note"],
      competitors: ["Generic AI writers"],
      positioning_statement: "Content growth OS"
    });
  });

  it("normalizes nullable database rows into a complete Brand Brain", () => {
    const brain = mapBrandBrainFromRow({
      brand_name: "Finfold",
      product_description: null,
      target_audience: null,
      tone_keywords: null,
      banned_phrases: ["spam"],
      approved_examples: null,
      competitors: null,
      positioning_statement: null
    });

    expect(brain).toEqual({
      identityType: "brand",
      brandName: "Finfold",
      productDescription: "",
      targetAudience: "",
      toneKeywords: [],
      bannedPhrases: ["spam"],
      approvedExamples: [],
      competitors: [],
      positioningStatement: "",
      sourceUrl: "",
      socialProfiles: [],
      autoExtracted: false,
      enrichedAt: undefined,
      learnedStyle: [],
      learnedNegative: [],
      performanceRules: [],
      platformMemory: [],
      visualIdentity: {
        preferredTheme: "auto",
        styleKeywords: [],
        avoidStyles: [],
        palette: { primary: "", accent: "", background: "" },
        referenceImageUrls: [],
        learnedPreferences: []
      }
    });
  });

  it("round-trips personal IP identity and optional social profiles (migration 036)", () => {
    const brain = brandBrainSchema.parse({
      identityType: "personal",
      brandName: "开发者老王",
      socialProfiles: [
        {
          id: "profile-1",
          platform: "xiaohongshu",
          url: "https://www.xiaohongshu.com/user/profile/creatorwang",
          handle: "creatorwang"
        }
      ]
    });

    expect(mapBrandBrainToRow(brain)).toMatchObject({
      identity_type: "personal",
      social_profiles: brain.socialProfiles
    });

    const roundTripped = mapBrandBrainFromRow(mapBrandBrainToRow(brain) as BrandBrainRow);
    expect(roundTripped.identityType).toBe("personal");
    expect(roundTripped.socialProfiles).toEqual(brain.socialProfiles);
  });

  it("round-trips URL bootstrap metadata (migration 016)", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      sourceUrl: "https://finfold.app",
      autoExtracted: true,
      enrichedAt: "2026-07-03T00:00:00.000Z"
    });

    expect(mapBrandBrainToRow(brain)).toMatchObject({
      source_url: "https://finfold.app",
      auto_extracted: true,
      enriched_at: "2026-07-03T00:00:00.000Z"
    });

    const roundTripped = mapBrandBrainFromRow(mapBrandBrainToRow(brain) as BrandBrainRow);
    expect(roundTripped.sourceUrl).toBe("https://finfold.app");
    expect(roundTripped.autoExtracted).toBe(true);
  });

  it("round-trips learned style rules (migration 019)", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      learnedStyle: ["Use short, punchy sentences.", "Avoid exclamation points."]
    });

    expect(mapBrandBrainToRow(brain)).toMatchObject({
      learned_style: ["Use short, punchy sentences.", "Avoid exclamation points."]
    });

    const roundTripped = mapBrandBrainFromRow(mapBrandBrainToRow(brain) as BrandBrainRow);
    expect(roundTripped.learnedStyle).toEqual(["Use short, punchy sentences.", "Avoid exclamation points."]);
  });

  it("round-trips negative rules and adopted performance rules (migration 025)", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      learnedNegative: ["Avoid opening with a generic greeting."],
      performanceRules: ["Promote channels that create signups into the next default launch set."]
    });

    expect(mapBrandBrainToRow(brain)).toMatchObject({
      learned_negative: ["Avoid opening with a generic greeting."],
      performance_rules: ["Promote channels that create signups into the next default launch set."]
    });

    const roundTripped = mapBrandBrainFromRow(mapBrandBrainToRow(brain) as BrandBrainRow);
    expect(roundTripped.learnedNegative).toEqual(["Avoid opening with a generic greeting."]);
    expect(roundTripped.performanceRules).toEqual(["Promote channels that create signups into the next default launch set."]);
  });

  it("round-trips optional visual identity memory (migration 037)", () => {
    const brain = brandBrainSchema.parse({
      brandName: "Finfold",
      visualIdentity: {
        preferredTheme: "signal",
        styleKeywords: ["editorial data", "precise"],
        avoidStyles: ["glossy 3D"],
        palette: { primary: "#171714", accent: "#f05a2a", background: "#f3efe3" },
        referenceImageUrls: ["https://example.com/reference.jpg"],
        learnedPreferences: []
      }
    });

    const row = mapBrandBrainToRow(brain) as BrandBrainRow;
    expect(row.visual_identity).toEqual(brain.visualIdentity);
    expect(mapBrandBrainFromRow(row).visualIdentity).toEqual(brain.visualIdentity);
  });

  it("round-trips typed platform-specific memory (migration 071)", () => {
    const brain = brandBrainSchema.parse({
      platformMemory: [{
        id: "platform-memory-1",
        platform: "x",
        kind: "preference",
        value: "Lead with a concrete trade-off.",
        source: "manual",
        confidence: "high",
        createdAt: "2026-08-06T10:00:00.000Z"
      }]
    });

    const row = mapBrandBrainToRow(brain) as BrandBrainRow;
    expect(row.platform_memory).toEqual(brain.platformMemory);
    expect(mapBrandBrainFromRow(row).platformMemory).toEqual(brain.platformMemory);
  });
});
