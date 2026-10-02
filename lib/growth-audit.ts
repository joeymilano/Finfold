import { z } from "zod";

export const growthAuditObjectiveSchema = z.enum(["leads", "signups", "purchases"]);
export type GrowthAuditObjective = z.infer<typeof growthAuditObjectiveSchema>;

export const growthAuditPlatformSchema = z.enum(["xiaohongshu", "linkedin", "wechat"]);
export type GrowthAuditPlatform = z.infer<typeof growthAuditPlatformSchema>;

export const growthAuditRequestSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  objective: growthAuditObjectiveSchema
});

export const growthAuditModelResultSchema = z.object({
  summary: z.string().trim().min(20).max(600),
  business: z.object({
    name: z.string().trim().max(80).default(""),
    offer: z.string().trim().max(500).default(""),
    audience: z.string().trim().max(350).default("")
  }),
  signals: z.array(z.object({
    finding: z.string().trim().min(10).max(240),
    evidence: z.string().trim().min(10).max(360),
    confidence: z.enum(["high", "medium", "low"])
  })).min(2).max(5),
  opportunities: z.array(z.object({
    title: z.string().trim().min(8).max(120),
    evidence: z.string().trim().min(20).max(420),
    rationale: z.string().trim().min(20).max(420),
    missionBrief: z.string().trim().min(40).max(900),
    recommendedPlatform: growthAuditPlatformSchema,
    confidence: z.enum(["high", "medium", "low"])
  })).length(3)
});

export type GrowthAuditModelResult = z.infer<typeof growthAuditModelResultSchema>;

export type GrowthOpportunity = GrowthAuditModelResult["opportunities"][number] & {
  id: string;
  rank: number;
  status: "proposed" | "accepted" | "dismissed";
  objective: GrowthAuditObjective;
  missionId: string | null;
};

export type GrowthAudit = Omit<GrowthAuditModelResult, "opportunities"> & {
  id: string;
  sourceUrl: string;
  objective: GrowthAuditObjective;
  opportunities: GrowthOpportunity[];
  createdAt: string;
};

export function parseGrowthAuditModelResult(raw: string): GrowthAuditModelResult {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return growthAuditModelResultSchema.parse(JSON.parse(cleaned));
}
export function growthMissionMetricForObjective(objective: GrowthAuditObjective): {
  key: "leads" | "signups" | "revenue";
  zh: string;
  en: string;
} {
  if (objective === "signups") return { key: "signups", zh: "新增注册", en: "New signups" };
  if (objective === "purchases") return { key: "revenue", zh: "购买收入", en: "Purchase revenue" };
  return { key: "leads", zh: "合格线索", en: "Qualified leads" };
}

export function buildOpportunityWorkbenchIdea(input: {
  business: GrowthAuditModelResult["business"];
  opportunity: GrowthAuditModelResult["opportunities"][number];
  objective: GrowthAuditObjective;
  sourceUrl: string;
  locale: "zh" | "en";
}): string {
  const { business, opportunity, objective, sourceUrl, locale } = input;
  if (locale === "en") {
    return [
      `Business: ${business.name || "the product at the source URL"}`,
      `Offer: ${business.offer || "Use only facts supported by the source page."}`,
      `Audience: ${business.audience || "Use only the audience supported by the source page."}`,
      `Growth objective: ${objective}`,
      `Mission: ${opportunity.missionBrief}`,
      `Evidence: ${opportunity.evidence}`,
      `Source: ${sourceUrl}`,
      "Create one focused, reviewable execution draft. Do not invent customer results, traffic, revenue, or endorsements."
    ].join("\n");
  }
  return [
    `业务：${business.name || "来源网址中的产品"}`,
    `销售内容：${business.offer || "只使用来源页面能够支持的事实"}`,
    `目标受众：${business.audience || "只使用来源页面能够支持的受众信息"}`,
    `增长目标：${objective === "leads" ? "合格线索" : objective === "signups" ? "新增注册" : "购买"}`,
    `本次任务：${opportunity.missionBrief}`,
    `证据：${opportunity.evidence}`,
    `来源：${sourceUrl}`,
    "生成一份聚焦、可审核的执行草稿；不得编造客户结果、流量、收入或背书。"
  ].join("\n");
}
