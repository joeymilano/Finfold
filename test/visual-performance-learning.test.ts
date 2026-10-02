import { describe, expect, it } from "vitest";
import { learnVisualPreference, mergeVisualPreference } from "@/lib/visual-performance-learning";

describe("visual performance learning", () => {
  it("learns only when one visual system has enough comparative evidence", () => {
    const preference = learnVisualPreference([
      { platform: "linkedin", theme: "signal", score: 24 },
      { platform: "linkedin", theme: "signal", score: 20 },
      { platform: "linkedin", theme: "editorial", score: 8 },
      { platform: "linkedin", theme: "editorial", score: 6 }
    ], "2026-07-15T00:00:00.000Z");
    expect(preference).toMatchObject({ platform: "linkedin", theme: "signal", sampleSize: 4 });
    expect(preference?.liftPercent).toBeGreaterThanOrEqual(25);
  });

  it("does not overfit from one sample or one visual system", () => {
    expect(learnVisualPreference([{ platform: "x", theme: "signal", score: 100 }])).toBeNull();
    expect(learnVisualPreference([
      { platform: "x", theme: "signal", score: 10 },
      { platform: "x", theme: "signal", score: 11 },
      { platform: "x", theme: "signal", score: 9 },
      { platform: "x", theme: "signal", score: 12 }
    ])).toBeNull();
  });

  it("replaces the preference for the same platform without erasing other platforms", () => {
    const existing = [{ platform: "x", theme: "signal" as const, sampleSize: 4, liftPercent: 30, updatedAt: "old" }];
    const merged = mergeVisualPreference(existing, { platform: "linkedin", theme: "editorial", sampleSize: 6, liftPercent: 42, updatedAt: "new" });
    expect(merged.map((item) => item.platform)).toEqual(["x", "linkedin"]);
  });
});
