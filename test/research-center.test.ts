import { describe, expect, it } from "vitest";
import {
  assertDecisionEvidence,
  buildResearchDecisionPrompt,
  buildResearchGenerationContext,
  buildResearchWorkbenchIdea,
  parseResearchDecision,
  researchMissionCreateInputSchema,
  researchMissionInputSchema,
  type ResearchDecision,
  type ResearchEvidence
} from "@/lib/operations/research";

const evidence: ResearchEvidence[] = [{
  id: "E1",
  sourceType: "first_party_analytics",
  title: "近 30 天账号后台",
  observedAt: "2026-08-11T10:00:00.000Z",
  excerpt: "收藏率高于过去 30 天中位数，但主页访问没有增长。",
  reliability: "measured"
}];

const decision: ResearchDecision = {
  executiveSummary: "内容价值信号存在，但主页承接需要验证。",
  opportunities: [{ title: "强化收藏型内容的主页承接", rationale: "收藏信号已出现。", evidenceIds: ["E1"], confidence: "medium" }],
  risks: [{ title: "不能推断因果", mitigation: "使用两周对照测试。", evidenceIds: ["E1"] }],
  strategy: {
    thesis: "先复用有收藏信号的主题，再测试主页承接。",
    contentPillars: ["问题清单"],
    next14Days: ["发布两组 CTA 对照内容"],
    conversionPath: "笔记 → 主页 → 私信关键词 → 有效线索",
    successMetrics: ["主页访问率", "有效私信数"]
  },
  limitations: ["只有一个一方数据观察。"]
};

describe("evidence-first Research Center", () => {
  it("supports the four Hongcece-baseline mission types", () => {
    for (const missionType of ["account_diagnosis", "creator_scout", "category_opportunity", "product_competitor"]) {
      expect(researchMissionInputSchema.parse({
        missionType,
        title: "测试任务",
        question: "这个任务应该如何形成可验证的运营决策？",
        subjects: ["测试对象"],
        evidence: []
      }).missionType).toBe(missionType);
    }
  });

  it("keeps legacy creator scouting readable but blocks new creator collaboration missions", () => {
    const legacy = researchMissionInputSchema.parse({
      missionType: "creator_scout",
      title: "历史达人任务",
      question: "哪些历史候选记录需要保留供用户查看？",
      subjects: ["历史记录"],
      evidence: []
    });
    expect(legacy.missionType).toBe("creator_scout");
    expect(() => researchMissionCreateInputSchema.parse(legacy)).toThrow();
  });

  it("rejects a model decision that invents evidence identifiers", () => {
    expect(() => assertDecisionEvidence({
      ...decision,
      opportunities: [{ ...decision.opportunities[0], evidenceIds: ["E404"] }]
    }, evidence)).toThrow(/unknown evidence: E404/);
  });

  it("parses a grounded decision and preserves the strategy handoff", () => {
    const parsed = parseResearchDecision(`\n\`\`\`json\n${JSON.stringify(decision)}\n\`\`\``, evidence);
    expect(parsed.strategy.conversionPath).toContain("有效线索");
    expect(parsed.opportunities[0].evidenceIds).toEqual(["E1"]);
  });

  it("tells the model not to invent platform data", () => {
    const prompt = buildResearchDecisionPrompt({
      missionType: "category_opportunity",
      title: "品类研究",
      question: "哪些品类机会值得未来十四天优先验证？",
      subjects: ["AI 产品设计"],
      evidence
    }, null, "zh");
    expect(prompt).toContain("Do not invent metrics, creators, products, trends, or platform data");
    expect(prompt).toContain("14-day content and conversion strategy");
  });

  it("builds a bounded generation context from a ready decision", () => {
    const mission = {
      id: "1f34c0d0-3124-4ca7-b352-da298139cb74",
      operatingProgramId: null,
      missionType: "category_opportunity" as const,
      title: "AI 产品设计机会",
      question: "哪些内容机会值得未来十四天优先验证？",
      subjects: ["AI 产品设计"],
      evidence: [{ ...evidence[0], excerpt: "外部证据".repeat(500) }],
      status: "ready" as const,
      decision,
      createdAt: "2026-08-11T10:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.000Z"
    };
    const context = buildResearchGenerationContext(mission);
    expect(context.missionId).toBe(mission.id);
    expect(context.evidence[0].excerpt.length).toBe(700);
    expect(context.opportunities[0].evidenceIds).toEqual(["E1"]);

    const workbenchIdea = buildResearchWorkbenchIdea(mission);
    expect(workbenchIdea).toContain(decision.strategy.thesis);
    expect(workbenchIdea).not.toContain(mission.evidence[0].excerpt);
  });

  it("does not let an unfinished research mission enter generation", () => {
    expect(() => buildResearchGenerationContext({
      id: "1f34c0d0-3124-4ca7-b352-da298139cb74",
      operatingProgramId: null,
      missionType: "category_opportunity",
      title: "未完成任务",
      question: "这个研究任务应该如何形成可验证的运营决策？",
      subjects: ["AI 产品设计"],
      evidence,
      status: "collecting",
      decision: null,
      createdAt: "2026-08-11T10:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.000Z"
    })).toThrow(/ready decision/);
  });
});
