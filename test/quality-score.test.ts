import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import type { KitOutput } from "@/lib/content-schema";
import { computeQualityScore, QUALITY_SCORE_VERSION } from "@/lib/quality-score";

function output(overrides: Partial<KitOutput> = {}): KitOutput {
  return {
    platform: "linkedin",
    title: "A specific release lesson",
    body: "We moved review before publish. The release owner now sees the blocked field before a customer does.",
    cta: "Read the release notes",
    notes: "Open with the change.",
    strategy: "Lead with the observed workflow.",
    locked: false,
    publishStatus: "draft",
    userEdited: false,
    ...overrides
  };
}

describe("quality score", () => {
  it("versions the human-voice scoring model separately from legacy rows", () => {
    expect(QUALITY_SCORE_VERSION).toBe(2);
  });

  it("includes a human-voice dimension for every scored output", () => {
    const score = computeQualityScore(output(), brandBrainSchema.parse({}));
    const humanVoice = score.dimensions.find((dimension) => dimension.key === "human_voice");

    expect(humanVoice).toMatchObject({
      labelZh: "真人感",
      labelEn: "Human Voice",
      score: 100
    });
  });

  it("lowers the human-voice score when explicit model phrasing remains", () => {
    const score = computeQualityScore(output({
      body: "In today's fast-paced world, this game-changing workflow unlocks better launches."
    }), brandBrainSchema.parse({}));
    const humanVoice = score.dimensions.find((dimension) => dimension.key === "human_voice");

    expect(humanVoice?.score).toBeLessThan(100);
    expect(humanVoice?.reasonEn).toContain("templated");
  });
});