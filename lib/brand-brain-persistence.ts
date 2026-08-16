import { brandBrainSchema, platformMemorySchema, type BrandBrain } from "@/lib/brand-brain";

/** Keep every Brand Memory reader on the same projection so identity type and
 * optional source context cannot silently disappear in agents, MCP, refine,
 * regeneration, or undo flows. */
export const BRAND_BRAIN_COLUMNS =
  "*";

export type BrandBrainRow = {
  identity_type?: string | null;
  brand_name?: string | null;
  product_description?: string | null;
  target_audience?: string | null;
  tone_keywords?: unknown;
  banned_phrases?: unknown;
  approved_examples?: unknown;
  competitors?: unknown;
  positioning_statement?: string | null;
  source_url?: string | null;
  social_profiles?: unknown;
  visual_identity?: unknown;
  platform_memory?: unknown;
  auto_extracted?: boolean | null;
  enriched_at?: string | null;
  learned_style?: unknown;
  learned_negative?: unknown;
  performance_rules?: unknown;
};

export function mapBrandBrainToRow(brain: BrandBrain): Record<string, unknown> {
  return {
    identity_type: brain.identityType,
    brand_name: brain.brandName,
    product_description: brain.productDescription,
    target_audience: brain.targetAudience,
    tone_keywords: brain.toneKeywords,
    banned_phrases: brain.bannedPhrases,
    approved_examples: brain.approvedExamples,
    competitors: brain.competitors,
    positioning_statement: brain.positioningStatement,
    source_url: brain.sourceUrl || null,
    social_profiles: brain.socialProfiles,
    visual_identity: brain.visualIdentity,
    platform_memory: brain.platformMemory,
    auto_extracted: brain.autoExtracted,
    enriched_at: brain.enrichedAt || null,
    learned_style: brain.learnedStyle,
    learned_negative: brain.learnedNegative,
    performance_rules: brain.performanceRules
  };
}

export function mapBrandBrainFromRow(row: BrandBrainRow | null | undefined): BrandBrain {
  return brandBrainSchema.parse({
    identityType: row?.identity_type ?? inferLegacyIdentityType(row),
    brandName: row?.brand_name ?? "",
    productDescription: row?.product_description ?? "",
    targetAudience: row?.target_audience ?? "",
    toneKeywords: normalizeStringArray(row?.tone_keywords),
    bannedPhrases: normalizeStringArray(row?.banned_phrases),
    approvedExamples: normalizeStringArray(row?.approved_examples),
    competitors: normalizeStringArray(row?.competitors),
    positioningStatement: row?.positioning_statement ?? "",
    sourceUrl: row?.source_url ?? "",
    socialProfiles: normalizeSocialProfiles(row?.social_profiles),
    visualIdentity: normalizeVisualIdentity(row?.visual_identity),
    platformMemory: normalizePlatformMemory(row?.platform_memory),
    autoExtracted: row?.auto_extracted ?? false,
    enrichedAt: row?.enriched_at ?? undefined,
    learnedStyle: normalizeStringArray(row?.learned_style),
    learnedNegative: normalizeStringArray(row?.learned_negative),
    performanceRules: normalizeStringArray(row?.performance_rules)
  });
}

function inferLegacyIdentityType(row: BrandBrainRow | null | undefined): "personal" | "brand" {
  return row?.brand_name || row?.product_description ? "brand" : "personal";
}

function normalizeSocialProfiles(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeVisualIdentity(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizePlatformMemory(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = platformMemorySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
