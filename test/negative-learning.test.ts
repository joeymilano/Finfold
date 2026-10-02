import { describe, expect, it } from "vitest";
import { mergeNegativeRules } from "@/lib/negative-learning";

describe("mergeNegativeRules", () => {
  it("appends a new rule to an empty list", () => {
    expect(mergeNegativeRules([], "Avoid generic greetings.")).toEqual(["Avoid generic greetings."]);
  });

  it("dedupes a rule that already exists (case-insensitive)", () => {
    const existing = ["Avoid generic greetings.", "Avoid burying the ask."];
    expect(mergeNegativeRules(existing, "avoid generic greetings.")).toEqual([
      "Avoid burying the ask.",
      "avoid generic greetings."
    ]);
  });

  it("caps the list at 5 rules, dropping the oldest", () => {
    const existing = Array.from({ length: 5 }, (_, i) => `Rule ${i}`);
    const merged = mergeNegativeRules(existing, "Rule 5");

    expect(merged).toHaveLength(5);
    expect(merged[0]).toBe("Rule 1");
    expect(merged[merged.length - 1]).toBe("Rule 5");
    expect(merged).not.toContain("Rule 0");
  });
});
