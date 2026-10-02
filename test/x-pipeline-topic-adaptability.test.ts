// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterAdaptableTopics,
  X_TOPIC_ADAPTABLE_MIN,
  type RadarTopicCandidate
} from "@/lib/x-pipeline/topic-adaptability";
import { selectTopics } from "@/lib/x-pipeline/generate";

const askJevMock = vi.hoisted(() => vi.fn());
const jevEnabledMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/jev", () => ({
  askJev: askJevMock,
  jevEnabled: jevEnabledMock,
  JevUnavailableError: class JevUnavailableError extends Error {}
}));

const candidates: RadarTopicCandidate[] = [
  { id: "opp-1", title: "Cover-design tactics that lift saves", whyNow: "rising discussion", whyYou: "matches positioning" },
  { id: "opp-2", title: "618 shopping festival checklist", whyNow: "hot window", whyYou: null }
];

function jevAnswers(...probabilities: number[]) {
  const answers: Record<string, unknown> = {};
  probabilities.forEach((probability, index) => {
    answers[`x_adaptable_${index}`] = { noul: probability };
  });
  return {
    model: "jev-1.13.0",
    answers,
    usage: { inputTokens: 400, outputTokens: 0 }
  };
}

beforeEach(() => {
  jevEnabledMock.mockReturnValue(true);
  askJevMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("x topic adaptability screen", () => {
  it("keeps topics at the threshold and drops below it", async () => {
    askJevMock.mockResolvedValue(jevAnswers(X_TOPIC_ADAPTABLE_MIN, X_TOPIC_ADAPTABLE_MIN - 0.001));
    const kept = await filterAdaptableTopics("user-1", "Brand: Finfold", candidates);
    expect(kept).not.toBeNull();
    expect([...kept!]).toEqual(["opp-1"]);
  });

  it("sends brand context, item state, and the operation tag", async () => {
    askJevMock.mockResolvedValue(jevAnswers(0.9, 0.1));
    await filterAdaptableTopics("user-1", "Brand: Finfold", candidates);
    const [state, questions, options] = askJevMock.mock.calls[0];
    expect(options.operation).toBe("x_topic_adaptability");
    expect(options.userId).toBe("user-1");
    expect(state.brand_context).toBe("Brand: Finfold");
    expect(state.items).toHaveLength(2);
    expect(state.items[1].title).toBe("618 shopping festival checklist");
    expect(Object.keys(questions)).toEqual(["x_adaptable_0", "x_adaptable_1"]);
  });

  it("fails closed to null when Jev cannot judge", async () => {
    askJevMock.mockRejectedValue(new Error("jev_timeout"));
    const kept = await filterAdaptableTopics("user-1", "Brand: Finfold", candidates);
    expect(kept).toBeNull();
  });

  it("drops candidates whose answer is missing", async () => {
    askJevMock.mockResolvedValue({ model: "jev-1.13.0", answers: { x_adaptable_0: { noul: 0.9 } }, usage: { inputTokens: 1, outputTokens: 0 } });
    const kept = await filterAdaptableTopics("user-1", "Brand: Finfold", candidates);
    expect([...kept!]).toEqual(["opp-1"]);
  });

  it("skips the Jev call when there is nothing to screen", async () => {
    const kept = await filterAdaptableTopics("user-1", "Brand: Finfold", []);
    expect([...kept!]).toEqual([]);
    expect(askJevMock).not.toHaveBeenCalled();
  });
});

// Chainable PostgREST-style stub: every builder node carries `data`, so a
// destructured { data } works at any chain end (the jobs query ends at
// .not(), the opportunities query at .limit()).
type Chain = {
  data: unknown[];
  select: () => Chain;
  eq: () => Chain;
  gte: () => Chain;
  not: () => Chain;
  order: () => Chain;
  limit: () => Chain;
};

function makeAdmin(tables: Record<string, unknown[]>) {
  const build = (data: unknown[]): Chain => {
    const self = { data } as Chain;
    self.select = () => self;
    self.eq = () => self;
    self.gte = () => self;
    self.not = () => self;
    self.order = () => self;
    self.limit = () => self;
    return self;
  };
  return { from: (table: string) => build(tables[table] ?? []) };
}

const opportunityRows = [
  { id: "hs-2", recommended_platform: "xiaohongshu", rank_score: 90, main_angle: "Cross-platform launch tactic", why_now: "rising", why_you: "fits", recommended_format: "观点图文" },
  { id: "x-1", recommended_platform: "x", rank_score: 80, main_angle: "X-native topic", why_now: "hot", why_you: "fits", recommended_format: "即时观点 Thread" },
  { id: "hs-3", recommended_platform: "xiaohongshu", rank_score: 70, main_angle: "618 festival checklist", why_now: "hot", why_you: null, recommended_format: "观点图文" }
];

describe("selectTopics cross-platform expansion", () => {
  it("flows x-tagged topics plus Jev-approved cross-platform ones in rank order", async () => {
    askJevMock.mockResolvedValue(jevAnswers(0.85, 0.2));
    const topics = await selectTopics(makeAdmin({
      x_publication_jobs: [],
      topic_opportunities: opportunityRows
    }) as never, "user-1", 2, "Brand: Finfold");
    expect(topics.map((topic) => topic.title)).toEqual(["Cross-platform launch tactic", "X-native topic"]);
    expect(topics[0]).toMatchObject({ source: "radar", ref: "radar:hs-2" });
  });

  it("keeps only x-tagged topics when Jev is unavailable (pre-expansion behavior)", async () => {
    askJevMock.mockRejectedValue(new Error("jev_disabled"));
    const topics = await selectTopics(makeAdmin({
      x_publication_jobs: [],
      topic_opportunities: opportunityRows
    }) as never, "user-1", 2, "Brand: Finfold");
    expect(topics.map((topic) => topic.ref)).toEqual(["radar:x-1"]);
  });

  it("still honors the 30-day reuse exclusion for radar refs", async () => {
    askJevMock.mockResolvedValue(jevAnswers(0.9, 0.9));
    const topics = await selectTopics(makeAdmin({
      x_publication_jobs: [{ ref: "radar:x-1" }],
      topic_opportunities: opportunityRows
    }) as never, "user-1", 2, "Brand: Finfold");
    expect(topics.map((topic) => topic.ref)).toEqual(["radar:hs-2", "radar:hs-3"]);
  });
});
