import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import { mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";

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
      brandName: "Finfold",
      productDescription: "",
      targetAudience: "",
      toneKeywords: [],
      bannedPhrases: ["spam"],
      approvedExamples: [],
      competitors: [],
      positioningStatement: ""
    });
  });
});
