import { z } from "zod";

/**
 * Leaf module with zero internal deps — lib/guardrails.ts needs this id enum
 * for its own enabled_packs storage schema, and lib/industry-rules/types.ts
 * needs it too (plus lib/guardrails.ts's guardrailRuleSchema for pack rule
 * content). Splitting it out here avoids a guardrails.ts <-> types.ts import
 * cycle that broke edge-runtime bundling ("Cannot access before
 * initialization") in app/api/atomize/route.ts's dependency chain.
 */
export const industryPackIdSchema = z.enum(["medical", "legal", "advertising", "finance"]);
export type IndustryPackId = z.infer<typeof industryPackIdSchema>;
