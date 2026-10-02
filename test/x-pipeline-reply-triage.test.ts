// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReplyTriageQuestions,
  selectTriageTargets,
  triageReplyTargets,
  TRIAGE_WORTH_REPLYING_MIN,
  type ReplyTriageVerdict
} from "@/lib/x-pipeline/replies";

const askJevMock = vi.hoisted(() => vi.fn());
const jevEnabledMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/jev", () => ({
  askJev: askJevMock,
  jevEnabled: jevEnabledMock,
  JevUnavailableError: class JevUnavailableError extends Error {}
}));

function target(tweetId: string, handle: string, content: string) {
  return { tweetId, handle, content, url: `https://x.com/${handle}/status/${tweetId}` };
}

const targets = [
  target("100", "naval", "Long post about distribution mechanics for indie makers, with a concrete story."),
  target("101", "memelord", "gm")
];

beforeEach(() => {
  jevEnabledMock.mockReturnValue(true);
  askJevMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("reply target triage", () => {
  it("asks worth + audience per target in one batch", () => {
    const questions = buildReplyTriageQuestions(2);
    expect(Object.keys(questions)).toEqual([
      "worth_0", "audience_0", "worth_1", "audience_1"
    ]);
    expect(questions.worth_0.type).toBe("noul");
    expect(questions.audience_1.type).toBe("choice");
    expect(Object.keys((questions.audience_1 as { criteria: Record<string, string> }).criteria))
      .toEqual(expect.arrayContaining(["potential_customer", "peer_builder", "noise", "hostile", "other"]));
  });

  it("maps verdicts and enriches targets with the author type", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        worth_0: { type: "noul", noul: 0.85 },
        audience_0: { type: "choice", choice: "peer_builder", probabilities: {}, confidence: 0.9 },
        worth_1: { type: "noul", noul: 0.1 },
        audience_1: { type: "choice", choice: "noise", probabilities: {}, confidence: 0.95 }
      },
      usage: { inputTokens: 600, outputTokens: 0 }
    });

    const verdicts = await triageReplyTargets(targets, "Brand: Finfold", { userId: "user-1" });
    expect(verdicts).not.toBeNull();
    expect(verdicts).toEqual([
      { target: { ...targets[0], audienceType: "peer_builder" }, worthReplying: 0.85, audienceType: "peer_builder" },
      { target: { ...targets[1], audienceType: "noise" }, worthReplying: 0.1, audienceType: "noise" }
    ]);
    expect(askJevMock).toHaveBeenCalledTimes(1);
  });

  it("treats missing answers as unjudged instead of dropping the target", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: { worth_0: { type: "noul", noul: 0.9 } },
      usage: { inputTokens: 300, outputTokens: 0 }
    });
    const verdicts = await triageReplyTargets(targets, "Brand: Finfold");
    expect(verdicts?.[0]).toMatchObject({ worthReplying: 0.9 });
    expect(verdicts?.[1]).toMatchObject({ worthReplying: null, audienceType: null });
    // Unjudged targets survive the filter — only confident rejections drop.
    expect(selectTriageTargets(verdicts!)).toHaveLength(2);
  });

  it("drops only confidently unworthy targets at the filter", () => {
    const verdicts: ReplyTriageVerdict[] = [
      { target: targets[0], worthReplying: TRIAGE_WORTH_REPLYING_MIN, audienceType: "peer_builder" },
      { target: targets[1], worthReplying: TRIAGE_WORTH_REPLYING_MIN - 0.001, audienceType: "noise" },
      { target: target("102", "newbie", "Question about pricing that the product answers directly."), worthReplying: null, audienceType: null }
    ];
    const kept = selectTriageTargets(verdicts);
    expect(kept.map((t) => t.tweetId)).toEqual(["100", "102"]);
  });

  it("returns null (full fallback) when Jev is disabled or unavailable", async () => {
    jevEnabledMock.mockReturnValue(false);
    expect(await triageReplyTargets(targets, "Brand: Finfold")).toBeNull();
    expect(askJevMock).not.toHaveBeenCalled();

    jevEnabledMock.mockReturnValue(true);
    askJevMock.mockRejectedValue(new Error("jev_overloaded_429"));
    expect(await triageReplyTargets(targets, "Brand: Finfold")).toBeNull();
  });
});
