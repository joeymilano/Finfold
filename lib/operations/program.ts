import { z } from "zod";

export const operatingPlatformSchema = z.enum(["xiaohongshu", "linkedin", "wechat"]);
export type OperatingPlatform = z.infer<typeof operatingPlatformSchema>;

export const operatingProgramStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
export type OperatingProgramStatus = z.infer<typeof operatingProgramStatusSchema>;

export const qualifiedLeadTemplateSchema = z.enum([
  "professional_services",
  "local_business",
  "small_brand",
  "custom"
]);
export type QualifiedLeadTemplate = z.infer<typeof qualifiedLeadTemplateSchema>;

export const conversionActionSchema = z.enum([
  "lead_form",
  "direct_message",
  "phone_call",
  "appointment",
  "purchase",
  "other"
]);
export type ConversionAction = z.infer<typeof conversionActionSchema>;

const shortText = z.string().trim().max(120);
const longText = z.string().trim().max(800);
const stringList = z.array(z.string().trim().min(1).max(160)).max(10);

export const qualifiedLeadRuleSchema = z.object({
  template: qualifiedLeadTemplateSchema,
  requiresContact: z.boolean(),
  requiresExplicitNeed: z.boolean(),
  matchConditions: z.array(z.string().trim().min(1).max(160)).max(8),
  customNotes: z.string().trim().max(500)
});
export type QualifiedLeadRule = z.infer<typeof qualifiedLeadRuleSchema>;

export const operatingProgramInputSchema = z.object({
  platform: operatingPlatformSchema.default("xiaohongshu"),
  status: operatingProgramStatusSchema.default("draft"),
  offer: z.object({
    name: shortText,
    summary: longText,
    priceRange: shortText,
    serviceArea: shortText
  }),
  audience: z.object({
    description: longText,
    primaryNeed: longText,
    purchaseBarriers: stringList
  }),
  objective: z.object({
    monthlyGoal: longText,
    conversionAction: conversionActionSchema
  }),
  qualifiedLeadRule: qualifiedLeadRuleSchema,
  watchlist: z.object({
    competitors: stringList,
    keywords: stringList
  }),
  cadencePerWeek: z.number().int().min(2).max(5),
  baseline: z.object({
    publishedPosts: z.number().int().min(0).max(10000),
    qualifiedLeads: z.number().int().min(0).max(100000),
    wonRevenue: z.number().min(0).max(1_000_000_000)
  })
}).superRefine((value, context) => {
  if (value.watchlist.competitors.length + value.watchlist.keywords.length > 10) {
    context.addIssue({
      code: "custom",
      path: ["watchlist"],
      message: "Competitors and keywords may contain at most 10 items in total."
    });
  }
});

export type OperatingProgramInput = z.infer<typeof operatingProgramInputSchema>;

export type OperatingProgram = OperatingProgramInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_QUALIFIED_LEAD_RULES: Record<QualifiedLeadTemplate, QualifiedLeadRule> = {
  professional_services: {
    template: "professional_services",
    requiresContact: true,
    requiresExplicitNeed: true,
    matchConditions: ["服务需求明确", "预算或决策时间基本匹配"],
    customNotes: ""
  },
  local_business: {
    template: "local_business",
    requiresContact: true,
    requiresExplicitNeed: true,
    matchConditions: ["在可服务地区", "有到店、预约或咨询意向"],
    customNotes: ""
  },
  small_brand: {
    template: "small_brand",
    requiresContact: true,
    requiresExplicitNeed: true,
    matchConditions: ["目标产品匹配", "有购买、试用或合作意向"],
    customNotes: ""
  },
  custom: {
    template: "custom",
    requiresContact: true,
    requiresExplicitNeed: true,
    matchConditions: [],
    customNotes: ""
  }
};

export const EMPTY_OPERATING_PROGRAM: OperatingProgramInput = {
  platform: "xiaohongshu",
  status: "draft",
  offer: { name: "", summary: "", priceRange: "", serviceArea: "" },
  audience: { description: "", primaryNeed: "", purchaseBarriers: [] },
  objective: { monthlyGoal: "", conversionAction: "lead_form" },
  qualifiedLeadRule: DEFAULT_QUALIFIED_LEAD_RULES.professional_services,
  watchlist: { competitors: [], keywords: [] },
  cadencePerWeek: 3,
  baseline: { publishedPosts: 0, qualifiedLeads: 0, wonRevenue: 0 }
};

function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function normalizeOperatingProgramInput(input: unknown): OperatingProgramInput {
  const parsed = operatingProgramInputSchema.parse(input);
  return {
    ...parsed,
    audience: {
      ...parsed.audience,
      purchaseBarriers: normalizeList(parsed.audience.purchaseBarriers)
    },
    qualifiedLeadRule: {
      ...parsed.qualifiedLeadRule,
      matchConditions: normalizeList(parsed.qualifiedLeadRule.matchConditions)
    },
    watchlist: {
      competitors: normalizeList(parsed.watchlist.competitors),
      keywords: normalizeList(parsed.watchlist.keywords)
    }
  };
}

export type OperatingProgramRequirement =
  | "offer"
  | "audience"
  | "objective"
  | "qualified_lead_rule"
  | "watchlist";

export function getOperatingProgramMissingRequirements(
  input: OperatingProgramInput
): OperatingProgramRequirement[] {
  const missing: OperatingProgramRequirement[] = [];
  if (!input.offer.name || !input.offer.summary) missing.push("offer");
  if (!input.audience.description || !input.audience.primaryNeed) missing.push("audience");
  if (!input.objective.monthlyGoal) missing.push("objective");
  if (
    input.qualifiedLeadRule.matchConditions.length === 0 &&
    !input.qualifiedLeadRule.customNotes
  ) {
    missing.push("qualified_lead_rule");
  }
  if (input.watchlist.competitors.length + input.watchlist.keywords.length < 3) {
    missing.push("watchlist");
  }
  return missing;
}

export function assertOperatingProgramCanActivate(input: OperatingProgramInput): void {
  if (input.status !== "active") return;
  const missing = getOperatingProgramMissingRequirements(input);
  if (missing.length > 0) {
    throw new Error(`Operating program is missing required sections: ${missing.join(", ")}`);
  }
}

type OperatingProgramRow = {
  id: string;
  platform: OperatingPlatform;
  status: OperatingProgramStatus;
  offer: OperatingProgramInput["offer"];
  audience: OperatingProgramInput["audience"];
  objective: OperatingProgramInput["objective"];
  qualified_lead_rule: QualifiedLeadRule;
  watchlist: OperatingProgramInput["watchlist"];
  cadence_per_week: number;
  baseline: OperatingProgramInput["baseline"];
  created_at: string;
  updated_at: string;
};

export function mapOperatingProgram(row: OperatingProgramRow): OperatingProgram {
  const input = normalizeOperatingProgramInput({
    platform: row.platform,
    status: row.status,
    offer: row.offer,
    audience: row.audience,
    objective: row.objective,
    qualifiedLeadRule: row.qualified_lead_rule,
    watchlist: row.watchlist,
    cadencePerWeek: row.cadence_per_week,
    baseline: row.baseline
  });
  return { ...input, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function toOperatingProgramRow(input: OperatingProgramInput, userId: string) {
  return {
    user_id: userId,
    platform: input.platform,
    status: input.status,
    offer: input.offer,
    audience: input.audience,
    objective: input.objective,
    qualified_lead_rule: input.qualifiedLeadRule,
    watchlist: input.watchlist,
    cadence_per_week: input.cadencePerWeek,
    baseline: input.baseline,
    updated_at: new Date().toISOString()
  };
}

export const OPERATING_PROGRAM_FIELDS =
  "id, platform, status, offer, audience, objective, qualified_lead_rule, watchlist, cadence_per_week, baseline, created_at, updated_at";
