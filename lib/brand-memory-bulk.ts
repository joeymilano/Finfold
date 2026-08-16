import { z } from "zod";
import { brandBrainSchema, type BrandBrain } from "@/lib/brand-brain";

export const brandMemoryRuleFields = ["learnedStyle", "learnedNegative", "performanceRules"] as const;
export type BrandMemoryRuleField = (typeof brandMemoryRuleFields)[number];

export const brandMemoryBulkRemovalSchema = z.object({
  remove: z.object({
    learnedStyle: z.array(z.string().min(1).max(200)).max(10).default([]),
    learnedNegative: z.array(z.string().min(1).max(200)).max(5).default([]),
    performanceRules: z.array(z.string().min(1).max(200)).max(5).default([])
  }).refine(
    (value) => brandMemoryRuleFields.some((field) => value[field].length > 0),
    "Select at least one learned rule to remove."
  )
});

export type BrandMemoryBulkRemoval = z.infer<typeof brandMemoryBulkRemovalSchema>;

export function removeLearnedBrandMemoryRules(
  brain: BrandBrain,
  removal: BrandMemoryBulkRemoval
): { brain: BrandBrain; removedCount: number } {
  const remove = removal.remove;
  const next = brandBrainSchema.parse({
    ...brain,
    learnedStyle: removeValues(brain.learnedStyle, remove.learnedStyle),
    learnedNegative: removeValues(brain.learnedNegative, remove.learnedNegative),
    performanceRules: removeValues(brain.performanceRules, remove.performanceRules)
  });
  const remaining = next.learnedStyle.length + next.learnedNegative.length + next.performanceRules.length;
  const previous = brain.learnedStyle.length + brain.learnedNegative.length + brain.performanceRules.length;
  return { brain: next, removedCount: previous - remaining };
}

function removeValues(current: string[], selected: string[]): string[] {
  const selectedValues = new Set(selected);
  return current.filter((value) => !selectedValues.has(value));
}