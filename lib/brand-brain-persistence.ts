import { brandBrainSchema, type BrandBrain } from "@/lib/brand-brain";

export type BrandBrainRow = {
  brand_name?: string | null;
  product_description?: string | null;
  target_audience?: string | null;
  tone_keywords?: unknown;
  banned_phrases?: unknown;
  approved_examples?: unknown;
  competitors?: unknown;
  positioning_statement?: string | null;
};

export function mapBrandBrainToRow(brain: BrandBrain): Record<string, unknown> {
  return {
    brand_name: brain.brandName,
    product_description: brain.productDescription,
    target_audience: brain.targetAudience,
    tone_keywords: brain.toneKeywords,
    banned_phrases: brain.bannedPhrases,
    approved_examples: brain.approvedExamples,
    competitors: brain.competitors,
    positioning_statement: brain.positioningStatement
  };
}

export function mapBrandBrainFromRow(row: BrandBrainRow | null | undefined): BrandBrain {
  return brandBrainSchema.parse({
    brandName: row?.brand_name ?? "",
    productDescription: row?.product_description ?? "",
    targetAudience: row?.target_audience ?? "",
    toneKeywords: normalizeStringArray(row?.tone_keywords),
    bannedPhrases: normalizeStringArray(row?.banned_phrases),
    approvedExamples: normalizeStringArray(row?.approved_examples),
    competitors: normalizeStringArray(row?.competitors),
    positioningStatement: row?.positioning_statement ?? ""
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
