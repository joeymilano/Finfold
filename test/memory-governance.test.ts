import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import { inspectMemoryConflicts } from "@/lib/memory-governance";

describe("Brand Memory governance", () => {
  it("reports only direct contradictions across memory sources", () => {
    const report = inspectMemoryConflicts(brandBrainSchema.parse({
      toneKeywords: ["Direct", "precise"],
      bannedPhrases: ["direct", "game-changing"],
      approvedExamples: ["This is a game-changing workflow."],
      learnedStyle: ["Use direct language"],
      performanceRules: ["direct"],
      positioningStatement: "A game-changing content system",
      visualIdentity: {
        styleKeywords: ["editorial"],
        avoidStyles: ["Editorial"],
        learnedPreferences: [
          { platform: "x", theme: "signal", sampleSize: 4, liftPercent: 25, updatedAt: "2026-08-05T00:00:00.000Z" },
          { platform: "X", theme: "editorial", sampleSize: 5, liftPercent: 30, updatedAt: "2026-08-05T00:00:00.000Z" }
        ]
      }
    }));

    expect(report.status).toBe("needs_review");
    expect(report.conflicts.map((conflict) => conflict.id)).toEqual(expect.arrayContaining([
      "tone-banned:direct",
      "rule-banned:direct",
      "visual-style:editorial",
      "positioning-banned:game-changing",
      "visual-theme:x"
    ]));
    expect(report.conflicts.some((conflict) => conflict.id.startsWith("example-banned:game-changing:"))).toBe(true);
  });

  it("returns clear when no direct contradiction exists", () => {
    const report = inspectMemoryConflicts(brandBrainSchema.parse({
      toneKeywords: ["concrete"],
      bannedPhrases: ["game-changing"],
      approvedExamples: ["Show the exact workflow step before asking for a reply."],
      visualIdentity: {
        styleKeywords: ["editorial"],
        avoidStyles: ["glossy 3d"],
        learnedPreferences: [
          { platform: "x", theme: "signal", sampleSize: 4, liftPercent: 25, updatedAt: "2026-08-05T00:00:00.000Z" }
        ]
      }
    }));

    expect(report).toMatchObject({
      status: "clear",
      conflicts: [],
      checked: { toneKeywords: 1, bannedPhrases: 1, approvedExamples: 1, visualPreferences: 1 }
    });
  });

  it("reports an exact platform preference that conflicts with avoided visual style", () => {
    const report = inspectMemoryConflicts(brandBrainSchema.parse({
      visualIdentity: { avoidStyles: ["editorial"] },
      platformMemory: [{
        id: "platform-memory-1",
        platform: "wechat",
        kind: "preference",
        value: "editorial",
        source: "manual",
        confidence: "high",
        createdAt: "2026-08-06T10:00:00.000Z"
      }]
    }));

    expect(report.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "platform-memory-visual:wechat:editorial" })
    ]));
  });
});