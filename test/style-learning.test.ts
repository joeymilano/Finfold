import { describe, expect, it } from "vitest";
import { mergeLearnedStyle } from "@/lib/style-learning";

describe("mergeLearnedStyle", () => {
  it("appends a new rule to an empty list", () => {
    expect(mergeLearnedStyle([], "Use short sentences.")).toEqual(["Use short sentences."]);
  });

  it("dedupes a rule that already exists (case-insensitive)", () => {
    const existing = ["Use short sentences.", "Avoid exclamation points."];
    expect(mergeLearnedStyle(existing, "use short sentences.")).toEqual([
      "Avoid exclamation points.",
      "use short sentences."
    ]);
  });

  it("caps the list at 10 rules, dropping the oldest", () => {
    const existing = Array.from({ length: 10 }, (_, i) => `Rule ${i}`);
    const merged = mergeLearnedStyle(existing, "Rule 10");

    expect(merged).toHaveLength(10);
    expect(merged[0]).toBe("Rule 1");
    expect(merged[merged.length - 1]).toBe("Rule 10");
    expect(merged).not.toContain("Rule 0");
  });
});
