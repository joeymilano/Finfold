import type { IndustryPack, IndustryPackId } from "@/lib/industry-rules/types";
import { medicalPack } from "@/lib/industry-rules/medical";
import { legalPack } from "@/lib/industry-rules/legal";
import { advertisingPack } from "@/lib/industry-rules/advertising";
import { financePack } from "@/lib/industry-rules/finance";

export { industryPackIdSchema, industryPackSchema, type IndustryPack, type IndustryPackId } from "@/lib/industry-rules/types";
export { baseSystemRules } from "@/lib/industry-rules/base";

export const INDUSTRY_PACKS: IndustryPack[] = [medicalPack, legalPack, advertisingPack, financePack];

export function getIndustryPack(id: IndustryPackId): IndustryPack | undefined {
  return INDUSTRY_PACKS.find((pack) => pack.id === id);
}

export function getIndustryPacks(ids: IndustryPackId[]): IndustryPack[] {
  return ids.map(getIndustryPack).filter((pack): pack is IndustryPack => Boolean(pack));
}

/** Builds the prompt section for a user's enabled industry packs — mirrors
 * the "CUSTOM BRAND GUARDRAILS" section shape in lib/prompts.ts, kept as its
 * own block so compliance rules read as non-negotiable, not user preference. */
export function buildIndustryRulesPromptSection(packIds: IndustryPackId[]): string {
  const packs = getIndustryPacks(packIds);
  if (packs.length === 0) return "";

  const body = packs
    .map((pack) => {
      const rulesStr = pack.rules
        .map((rule, i) => `  [${i + 1}] ${rule.title}: ${rule.detail}`)
        .join("\n");
      return `-- ${pack.label} (${pack.labelEn}) --\n${rulesStr}`;
    })
    .join("\n\n");

  return `
=== INDUSTRY COMPLIANCE RULES (LEGALLY REQUIRED — NON-NEGOTIABLE) ===
The user operates in a regulated industry. These rules come from real advertising/industry regulations. Violating them is not a style problem, it is a compliance risk. Follow every rule below exactly, even if it makes the copy less punchy:
${body}
`;
}

/** All banned-pattern regex source strings across the given packs, compiled
 * lazily by the caller (lib/quality-score.ts) since RegExp isn't serializable. */
export function getIndustryBannedPatterns(packIds: IndustryPackId[]): string[] {
  return getIndustryPacks(packIds).flatMap((pack) => pack.bannedPatterns);
}
