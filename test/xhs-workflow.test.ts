import { describe, expect, it } from "vitest";
import {
  buildXhsWorkbenchHandoff,
  buildXhsReviewCompletionReceipt,
  createAgentActionFingerprint,
  deriveXhsNextAction,
  emptyXhsWorkflowState,
  type CreatorStrategyProfile
} from "@/lib/agent/xhs-workflow";

const strategy: CreatorStrategyProfile = {
  id: "8d33ed63-ad47-4526-8f92-0bf66d6af797",
  positioningStatement: "帮助独立设计师用真实项目建立 AI 产品能力",
  audienceLabels: ["独立设计师"],
  contentPillars: ["真实案例", "可执行方法", "常见误区"],
  identityProofs: ["三年产品实践"],
  seriesPromises: ["每周拆一个真实工作流"],
  sustainableCadence: "每周 2 篇",
  boundaries: ["不编造成绩"],
  version: 1,
  updatedAt: "2026-07-29T00:00:00.000Z"
};

describe("persistent Xiaohongshu workflow routing", () => {
  it("requires positioning before content generation", () => {
    const action = deriveXhsNextAction({ stage: "positioning", locale: "zh" });
    expect(action.kind).toBe("complete_positioning");
    expect(action.requiresConfirmation).toBe(true);
  });

  it("advances one explicit creation stage at a time", () => {
    expect(deriveXhsNextAction({ stage: "topic", strategy, locale: "zh" }).kind).toBe("research_topics");
    expect(deriveXhsNextAction({ stage: "draft", strategy, locale: "zh" }).kind).toBe("prepare_draft");
    expect(deriveXhsNextAction({ stage: "title", strategy, locale: "zh" }).kind).toBe("refine_titles");
    expect(deriveXhsNextAction({ stage: "visual", strategy, locale: "zh" }).kind).toBe("build_visual");
  });

  it("sends an approved package to Workbench with workflow and artifact versions", () => {
    const workflowId = "31730f26-2422-488f-be2b-3c7c2fc999ad";
    const action = deriveXhsNextAction({
      stage: "publish",
      strategy,
      workflow: {
        id: workflowId,
        status: "active",
        stage: "publish",
        currentBottleneck: "click",
        primaryMetric: "cover_click_rate",
        strategyProfileId: strategy.id,
        growthMissionId: null,
        kitId: null,
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z"
      },
      artifacts: {
        topic_evidence: {
          id: "86985734-027a-47ba-af14-f5ca433d415f",
          workflowId,
          kind: "topic_evidence",
          version: 1,
          status: "approved",
          payload: { selectedTopic: "设计师如何建立第一个 AI 工作流" },
          provenance: {},
          confidence: "inferred",
          createdAt: "2026-07-29T00:00:00.000Z"
        }
      },
      locale: "zh"
    });
    expect(action.kind).toBe("publish_note");
    expect(action.href).toContain(`/workbench?workflowId=${workflowId}`);
    expect(action.href).toContain("artifactIds=");
    expect(decodeURIComponent(action.href)).toContain("基于以下已确认的小红书方案生成可编辑内容");
    expect(action.requiresConfirmation).toBe(false);
  });

  it("rebuilds a complete Workbench handoff from durable approved artifacts", () => {
    const workflowId = "31730f26-2422-488f-be2b-3c7c2fc999ad";
    const handoff = buildXhsWorkbenchHandoff({
      id: workflowId,
      status: "active",
      stage: "publish",
      currentBottleneck: "execution",
      primaryMetric: "cover_click_rate",
      strategyProfileId: strategy.id,
      growthMissionId: null,
      kitId: null,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z"
    }, {
      topic_evidence: {
        id: "86985734-027a-47ba-af14-f5ca433d415f",
        workflowId,
        kind: "topic_evidence",
        version: 1,
        status: "approved",
        payload: { selectedTopic: "设计师的第一个 AI 工作流" },
        provenance: {},
        confidence: "inferred",
        createdAt: "2026-07-29T00:00:00.000Z"
      },
      note_brief: {
        id: "76985734-027a-47ba-af14-f5ca433d415f",
        workflowId,
        kind: "note_brief",
        version: 1,
        status: "approved",
        payload: { coreMessage: "从真实任务开始", structure: ["先讲约束", "再给步骤"] },
        provenance: {},
        confidence: "hypothesis",
        createdAt: "2026-07-29T00:00:00.000Z"
      }
    });

    expect(handoff.workflowId).toBe(workflowId);
    expect(handoff.idea).toContain("选题：设计师的第一个 AI 工作流");
    expect(handoff.idea).toContain("结构：先讲约束");
    expect(handoff.artifactVersionIds).toHaveLength(2);
  });

  it("keeps large one-click campaign actions idempotent with an index-safe fingerprint", async () => {
    const workflowId = "31730f26-2422-488f-be2b-3c7c2fc999ad";
    const payload = { visualPlan: { pages: Array.from({ length: 9 }, (_, index) => ({ page: index + 1, body: "真实内容".repeat(500) })) } };
    const first = await createAgentActionFingerprint(workflowId, "confirm_campaign", payload);
    const second = await createAgentActionFingerprint(workflowId, "confirm_campaign", payload);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it("builds a review receipt only from the persisted performance report and next action", () => {
    const state = {
      ...emptyXhsWorkflowState("zh"),
      nextAction: {
        ...emptyXhsWorkflowState("zh").nextAction,
        title: "选择下一轮选题",
        href: "/dashboard?workflowId=workflow-1",
        prompt: "基于这次复盘给我三个选题"
      }
    };
    const receipt = buildXhsReviewCompletionReceipt({
      report: {
        title: "点击环节需要优先改进",
        summary: "成熟笔记的封面点击率低于中位数。",
        evidence: "5 篇成熟笔记中，封面点击率中位数为 3.2%。",
        primaryMetric: "封面点击率"
      }
    }, state);

    expect(receipt).toMatchObject({
      title: "点击环节需要优先改进",
      summary: "成熟笔记的封面点击率低于中位数。",
      evidence: "5 篇成熟笔记中，封面点击率中位数为 3.2%。",
      primaryMetric: "封面点击率",
      nextAction: { title: "选择下一轮选题" },
      persistedArtifact: "analytics_report"
    });
  });
});
