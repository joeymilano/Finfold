import { describe, expect, it } from "vitest";
import { brandBrainSchema } from "@/lib/brand-brain";
import { brandMemoryBulkRemovalSchema, removeLearnedBrandMemoryRules } from "@/lib/brand-memory-bulk";

describe("Brand Memory bulk management", () => {
  it("removes only explicitly selected learned rules", () => {
    const result = removeLearnedBrandMemoryRules(
      brandBrainSchema.parse({
        learnedStyle: ["Use short paragraphs.", "Lead with a detail."],
        learnedNegative: ["Avoid vague claims."],
        performanceRules: ["Keep one CTA."]
      }),
      brandMemoryBulkRemovalSchema.parse({
        remove: { learnedStyle: ["Lead with a detail."], learnedNegative: [], performanceRules: ["Keep one CTA."] }
      })
    );

    expect(result).toMatchObject({
      removedCount: 2,
      brain: {
        learnedStyle: ["Use short paragraphs."],
        learnedNegative: ["Avoid vague claims."],
        performanceRules: []
      }
    });
  });

  it("requires at least one selected rule", () => {
    expect(() => brandMemoryBulkRemovalSchema.parse({
      remove: { learnedStyle: [], learnedNegative: [], performanceRules: [] }
    })).toThrow("Select at least one learned rule");
  });
});