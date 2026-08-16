import { z } from "zod";
import { guardrailRuleSchema } from "@/lib/guardrails";
import { industryPackIdSchema } from "@/lib/industry-rules/pack-id";

export { industryPackIdSchema };
export type { IndustryPackId } from "@/lib/industry-rules/pack-id";

export const industryPackSchema = z.object({
  id: industryPackIdSchema,
  label: z.string(),
  labelEn: z.string(),
  description: z.string(),
  descriptionEn: z.string(),
  /** Bump when rules content changes so future scripts/UI can show "v2 available". */
  version: z.number().int().positive(),
  /** Regulations / platform policies this pack was distilled from — shown to
   * the user as a credibility trail, not injected into prompts. */
  sources: z.array(z.string()),
  rules: z.array(guardrailRuleSchema),
  /** Regex source strings (no flags) matched against generated copy for hard
   * compliance scoring — see lib/quality-score.ts scoreIndustryCompliance. */
  bannedPatterns: z.array(z.string())
});

export type IndustryPack = z.infer<typeof industryPackSchema>;
