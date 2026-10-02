// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runJevItemReviewBatch, JEV_REVIEW_MAX_ITEMS_PER_CALL } from "@/lib/jev-review";

const askJevMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/jev", () => ({
  askJev: askJevMock
}));

function noulAnswer(probability: number) {
  return { type: "noul", noul: probability };
}

beforeEach(() => {
  askJevMock.mockReset();
});

describe("runJevItemReviewBatch", () => {
  const questions = {
    risk: { type: "noul" as const, instructions: "Does item {i} look risky?" },
    kind: {
      type: "choice" as const,
      instructions: "Classify item {i}.",
      criteria: { a: "an a", b: "a b" }
    }
  };

  it("asks one call per chunk with global-indexed keys and per-item state indexes", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        risk_0: noulAnswer(0.1),
        kind_0: { type: "choice", choice: "a", probabilities: {}, confidence: null },
        risk_1: noulAnswer(0.2),
        kind_1: { type: "choice", choice: "b", probabilities: {}, confidence: null },
        risk_2: noulAnswer(0.3),
        kind_2: { type: "choice", choice: "a", probabilities: {}, confidence: null }
      },
      usage: { inputTokens: 10, outputTokens: 0 }
    });

    const result = await runJevItemReviewBatch({
      items: [{ title: "one" }, { title: "two" }, { title: "three" }],
      questions,
      brandContext: "Brand: Finfold",
      operation: "unit_test"
    });

    expect(askJevMock).toHaveBeenCalledTimes(1);
    const [state, asked] = askJevMock.mock.calls[0];
    expect(Object.keys(asked)).toEqual(["risk_0", "kind_0", "risk_1", "kind_1", "risk_2", "kind_2"]);
    expect(state.brand_context).toBe("Brand: Finfold");
    expect(state.items).toHaveLength(3);
    expect(state.items[1]).toEqual({ title: "two", index: 1 });
    expect(asked.risk_1.instructions).toBe("Does item 1 look risky?");
    expect(asked.kind_2.instructions).toBe("Classify item 2.");
    for (const question of Object.values(asked)) {
      expect((question as { instructions: string }).instructions).not.toContain("{i}");
    }
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.risk_1).toEqual(noulAnswer(0.2));
  });

  it("honors itemsKey and omits null brandContext / falsy note from the state", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {},
      usage: { inputTokens: 1, outputTokens: 0 }
    });

    await runJevItemReviewBatch({
      items: [{ title: "one" }],
      questions: { risk: questions.risk },
      itemsKey: "drafts",
      brandContext: null,
      note: null,
      operation: "unit_test",
      userId: "user-1"
    });

    const [state, asked] = askJevMock.mock.calls[0];
    expect(Object.keys(state)).toEqual(["drafts"]);
    expect(state.drafts[0].index).toBe(0);
    expect(asked.risk_0.instructions).toBe("Does item 0 look risky?");
    expect(askJevMock.mock.calls[0][2]).toEqual({ operation: "unit_test", userId: "user-1" });

    askJevMock.mockClear();
    await runJevItemReviewBatch({
      items: [{ title: "one" }],
      questions: { risk: questions.risk },
      itemsKey: "drafts",
      brandContext: "digest",
      note: "a note",
      operation: "unit_test"
    });
    const [stateWith] = askJevMock.mock.calls[0];
    expect(Object.keys(stateWith)).toEqual(["brand_context", "note", "drafts"]);
    expect(stateWith.note).toBe("a note");
  });

  it("chunks at the per-call ceiling and merges answers with global indexes", async () => {
    expect(JEV_REVIEW_MAX_ITEMS_PER_CALL).toBe(40);
    const items = Array.from({ length: 45 }, (_, index) => ({ title: `t${index}` }));
    askJevMock.mockImplementation(async (_state: unknown, asked: Record<string, unknown>) => {
      const answers: Record<string, unknown> = {};
      for (const key of Object.keys(asked)) answers[key] = noulAnswer(0.5);
      return { model: `model-${askJevMock.mock.calls.length}`, answers, usage: { inputTokens: 1, outputTokens: 0 } };
    });

    const result = await runJevItemReviewBatch({
      items,
      questions: { a: { type: "noul", instructions: "item {i}" } },
      operation: "unit_test"
    });

    expect(askJevMock).toHaveBeenCalledTimes(2);
    const [, secondAsked] = askJevMock.mock.calls[1];
    expect(Object.keys(secondAsked)).toEqual(Array.from({ length: 5 }, (_, local) => `a_${40 + local}`));
    const [secondState] = askJevMock.mock.calls[1];
    expect(secondState.items).toHaveLength(5);
    expect(secondState.items[0].index).toBe(40);
    expect(result.answers.a_3).toEqual(noulAnswer(0.5));
    expect(result.answers.a_44).toEqual(noulAnswer(0.5));
    expect(result.model).toBe("model-2");
  });

  it("rethrows askJev failures unchanged", async () => {
    askJevMock.mockRejectedValue(new Error("jev_disabled"));
    await expect(runJevItemReviewBatch({
      items: [{ title: "one" }],
      questions: { risk: questions.risk },
      operation: "unit_test"
    })).rejects.toThrow("jev_disabled");
  });
});
