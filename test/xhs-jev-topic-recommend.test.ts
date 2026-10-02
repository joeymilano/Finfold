// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const askJevMock = vi.hoisted(() => vi.fn());
const createPendingMock = vi.hoisted(() => vi.fn());
const loadStateMock = vi.hoisted(() => vi.fn());
const providerCallMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/jev", () => ({ askJev: askJevMock }));
vi.mock("@/lib/llm", () => ({ sendRawPrompt: vi.fn() }));
vi.mock("@/lib/agent/provider-call", () => ({ runAgentProviderCall: providerCallMock }));
vi.mock("@/lib/agent/xhs-workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/xhs-workflow")>();
  return {
    ...actual,
    loadXhsWorkflowState: loadStateMock,
    createXhsPendingAction: createPendingMock
  };
});

import { reviewTopicsWithJev, buildTopicReviewQuestions, XHS_AGENT_TOOLS } from "@/lib/agent/xhs-tools";
import { createAgentActionFingerprint } from "@/lib/agent/xhs-workflow";

const strategy = {
  id: "strategy1",
  positioningStatement: "帮独立开发者做增长",
  audienceLabels: ["独立开发者"],
  contentPillars: ["内容复用", "冷启动", "自动化"],
  identityProofs: [],
  seriesPromises: [],
  sustainableCadence: "每周 3 篇",
  boundaries: [],
  version: 3,
  updatedAt: new Date().toISOString()
};
const topics = [
  { id: "topic-1", title: "内容复用：最容易被忽略的一步", pillar: "内容复用", audienceTension: "写一篇用一次", angle: "真实经历", evidence: "尚无实时趋势证据", whyNow: "来自长期内容支柱" },
  { id: "topic-2", title: "冷启动：最容易被忽略的一步", pillar: "冷启动", audienceTension: "没有第一批读者", angle: "可执行清单", evidence: "尚无实时趋势证据", whyNow: "来自长期内容支柱" },
  { id: "topic-3", title: "自动化：最容易被忽略的一步", pillar: "自动化", audienceTension: "手工重复太多", angle: "反常识误区", evidence: "尚无实时趋势证据", whyNow: "来自长期内容支柱" }
];
const ctx = {
  userId: "user1",
  admin: {} as never,
  plan: "growth_v2" as const,
  agentToolsEnabled: true
};
const tool = XHS_AGENT_TOOLS.find(definition => definition.name === "research_xhs_topics")!;

beforeEach(() => {
  vi.clearAllMocks();
  providerCallMock.mockRejectedValue(new Error("provider down"));
  loadStateMock.mockResolvedValue({ strategy, dataStatus: { hasMeasuredData: false } });
  createPendingMock.mockResolvedValue({ id: "action1" });
});

function jevAnswers(best = "1") {
  return {
    topic_positioning_fit_0: { type: "score", score: 3.1 },
    topic_differentiation_0: { type: "score", score: 2.4 },
    topic_positioning_fit_1: { type: "score", score: 4.2 },
    topic_differentiation_1: { type: "score", score: 3.9 },
    topic_positioning_fit_2: { type: "score", score: 2.8 },
    topic_differentiation_2: { type: "score", score: 2.0 },
    best_topic: { type: "choice", choice: best, probabilities: {}, confidence: null }
  };
}

describe("xhs topic recommendation via Jev", () => {
  it("builds per-topic score questions plus one best-topic choice", () => {
    const questions = buildTopicReviewQuestions(topics);
    expect(Object.keys(questions)).toEqual([
      "topic_positioning_fit_0", "topic_differentiation_0",
      "topic_positioning_fit_1", "topic_differentiation_1",
      "topic_positioning_fit_2", "topic_differentiation_2",
      "best_topic"
    ]);
    expect(questions.best_topic.type).toBe("choice");
    expect(Object.keys((questions.best_topic as { criteria: Record<string, string> }).criteria)).toEqual(["0", "1", "2"]);
  });

  it("parses the verdict and forwards it to the pending action", async () => {
    askJevMock.mockResolvedValue({ model: "jev-1.13.0", answers: jevAnswers(), usage: { inputTokens: 10, outputTokens: 0 } });
    const outcome = await tool.execute({}, ctx);
    expect(askJevMock).toHaveBeenCalledTimes(1);
    const [state] = askJevMock.mock.calls[0];
    expect(state.positioning).toBe(strategy.positioningStatement);
    expect(state.topics).toHaveLength(3);
    const input = createPendingMock.mock.calls[0][1] as Record<string, unknown>;
    expect(input.autoReview).toMatchObject({ model: "jev-1.13.0", best: 1 });
    expect((input.autoReview as { verdicts: Array<{ positioningFit: number }> }).verdicts[1].positioningFit).toBe(4.2);
    // The best candidate carries the badge inside the card items.
    const card = (outcome as { xhsCard: { items: Array<Record<string, unknown>>; meta: Record<string, unknown> } }).xhsCard;
    expect(card.items[1].jev).toEqual({ best: true, fit: 4.2 });
    expect(card.items[0].jev).toBeUndefined();
    expect(card.meta.jevReview).toMatchObject({ model: "jev-1.13.0", best: 1 });
  });

  it("keeps the action fingerprint independent of the review", async () => {
    const payload = { topics, confidence: "hypothesis" };
    const withReview = await createAgentActionFingerprint("wf1", "select_topic", payload);
    expect(withReview).toBe(await createAgentActionFingerprint("wf1", "select_topic", { ...payload }));
    expect(withReview).not.toBe(await createAgentActionFingerprint("wf1", "select_topic", { ...payload, extra: true }));
  });

  it("skips Jev entirely for a single candidate", async () => {
    const review = await reviewTopicsWithJev(ctx, strategy, [{ title: "only one" }]);
    expect(review).toBeNull();
    expect(askJevMock).not.toHaveBeenCalled();
  });

  it("fails open to a badge-less card when Jev is unavailable", async () => {
    askJevMock.mockRejectedValue(new Error("jev_disabled"));
    const outcome = await tool.execute({}, ctx);
    const input = createPendingMock.mock.calls[0][1] as Record<string, unknown>;
    expect(input.autoReview).toBeUndefined();
    const card = (outcome as { xhsCard: { items: Array<Record<string, unknown>>; meta: Record<string, unknown> } }).xhsCard;
    expect(card.items.every(item => !item.jev)).toBe(true);
    expect(card.meta.jevReview).toBeUndefined();
    expect(createPendingMock).toHaveBeenCalledTimes(1);
  });

  it("maps an out-of-range best choice to null without throwing", async () => {
    askJevMock.mockResolvedValue({ model: "jev-1.13.0", answers: jevAnswers("9"), usage: { inputTokens: 10, outputTokens: 0 } });
    const review = await reviewTopicsWithJev(ctx, strategy, topics);
    expect(review).toMatchObject({ best: null });
  });
});
