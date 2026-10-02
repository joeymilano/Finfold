// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_REVIEW_LIMITS,
  evaluateAutoReviewDraft,
  runJevBatchAutoReview,
  type AutoReviewDraft
} from "@/lib/x-pipeline/auto-review";
import { JevUnavailableError } from "@/lib/jev";
import type { XContentSnapshot } from "@/lib/x-pipeline/content";

const askJevMock = vi.hoisted(() => vi.fn());
const jevEnabledMock = vi.hoisted(() => vi.fn(() => true));
const approveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/jev", () => ({
  askJev: askJevMock,
  jevEnabled: jevEnabledMock,
  JevUnavailableError: class JevUnavailableError extends Error {}
}));
vi.mock("@/lib/x-pipeline/jobs", () => ({
  approveXPublicationJob: approveMock
}));

function snapshot(overrides: Partial<XContentSnapshot> = {}): XContentSnapshot {
  return {
    kind: "post",
    tweets: [{ text: "Shipping beats planning when the loop is short.", mediaUrl: null }],
    replyToTweetId: null,
    quoteTweetId: null,
    language: "en",
    topic: { source: "radar", ref: "radar:1", title: "Solo founder distribution" },
    notes: null,
    ...overrides
  };
}

function clearAnswers(index = 0) {
  return {
    [`fabricated_${index}`]: { type: "noul", noul: 0.02 },
    [`ai_tell_${index}`]: { type: "noul", noul: 0.08 },
    [`hard_sell_${index}`]: { type: "noul", noul: 0.05 },
    [`off_brand_${index}`]: { type: "noul", noul: 0.01 },
    [`quality_${index}`]: { type: "score", score: 3.8 }
  };
}

/** Records auto_review writes per job id through a stubbed admin client. */
function adminStub() {
  const records: Record<string, Record<string, unknown>> = {};
  const admin = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const eq = (column: string, value: string) => {
            if (column === "id" && table === "x_publication_jobs") {
              records[value] = patch.auto_review as Record<string, unknown>;
            }
            return { eq, error: null };
          };
          return { eq };
        }
      };
    }
  };
  return { admin, records };
}

beforeEach(() => {
  jevEnabledMock.mockReturnValue(true);
  askJevMock.mockReset();
  approveMock.mockReset().mockResolvedValue({ id: "job-1" });
});
afterEach(() => vi.clearAllMocks());

describe("auto-review threshold evaluation", () => {
  it("approves a clean draft", () => {
    const outcome = evaluateAutoReviewDraft(clearAnswers(), 0);
    expect(outcome.decision).toBe("approved");
    expect(outcome.reasons).toEqual([]);
    expect(outcome.metrics.quality).toBe(3.8);
  });

  it("keeps exact-threshold values inside the pass band", () => {
    const answers = {
      fabricated_0: { type: "noul", noul: AUTO_REVIEW_LIMITS.maxFabricatedSpecifics },
      ai_tell_0: { type: "noul", noul: AUTO_REVIEW_LIMITS.maxAiTell },
      hard_sell_0: { type: "noul", noul: AUTO_REVIEW_LIMITS.maxHardSell },
      off_brand_0: { type: "noul", noul: AUTO_REVIEW_LIMITS.maxOffBrandRisk },
      quality_0: { type: "score", score: AUTO_REVIEW_LIMITS.minQualityScore }
    };
    expect(evaluateAutoReviewDraft(answers, 0).decision).toBe("approved");
  });

  it.each([
    ["fabricated_0", "maxFabricatedSpecifics", "fabricated_specifics_risk"],
    ["ai_tell_0", "maxAiTell", "ai_tell_risk"],
    ["hard_sell_0", "maxHardSell", "hard_sell_risk"],
    ["off_brand_0", "maxOffBrandRisk", "off_brand_risk"]
  ] as const)("routes a %s breach to humans", (key, limit, reason) => {
    const answers = clearAnswers();
    answers[key] = { type: "noul", noul: AUTO_REVIEW_LIMITS[limit] + 0.001 };
    const outcome = evaluateAutoReviewDraft(answers, 0);
    expect(outcome.decision).toBe("needs_human");
    expect(outcome.reasons).toEqual([reason]);
  });

  it("rejects a quality score below the floor", () => {
    const answers = clearAnswers();
    answers.quality_0 = { type: "score", score: AUTO_REVIEW_LIMITS.minQualityScore - 0.01 };
    const outcome = evaluateAutoReviewDraft(answers, 0);
    expect(outcome.decision).toBe("needs_human");
    expect(outcome.reasons).toEqual(["quality_below_floor"]);
  });

  it("fails closed when an answer is missing or malformed", () => {
    const partial = clearAnswers();
    delete partial.fabricated_0;
    expect(evaluateAutoReviewDraft(partial, 0)).toMatchObject({
      decision: "needs_human",
      reasons: ["jev_answer_missing"]
    });
    const wrongType = { ...clearAnswers(), quality_0: { type: "noul", noul: 0.1 } };
    expect(evaluateAutoReviewDraft(wrongType, 0).reasons).toEqual(["jev_answer_missing"]);
  });
});

describe("jev_guarded batch review", () => {
  const drafts: AutoReviewDraft[] = [
    { jobId: "job-1", snapshot: snapshot() },
    {
      jobId: "job-2",
      snapshot: snapshot({
        kind: "reply",
        tweets: [{ text: "Same here — the retry loop was the fix.", mediaUrl: null }],
        replyToTweetId: "1747000000000000000",
        replyContext: { handle: "@naval", text: "Why do most indie tools die from distribution, not building?" },
        topic: { source: "watchlist", ref: "reply:1747000000000000000", title: "Reply to @naval" }
      })
    }
  ];

  it("auto-approves clean drafts through the human approve transition", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        ...clearAnswers(0),
        ...clearAnswers(1),
        fabricated_1: { type: "noul", noul: 0.4 }
      },
      usage: { inputTokens: 900, outputTokens: 0 }
    });
    const { admin, records } = adminStub();

    const result = await runJevBatchAutoReview(admin as never, "user-1", drafts, {
      brandDigest: "Brand: Finfold",
      operation: "x_morning_generation"
    });

    expect(result).toEqual({ approved: 1, needsHuman: 1 });
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(approveMock).toHaveBeenCalledWith(admin, "user-1", "job-1");
    expect(records["job-1"]).toMatchObject({ model: "jev-1.13.0", decision: "approved" });
    // job-2 (fabrication breach) stays queued with an explanatory record.
    expect(records["job-2"]).toMatchObject({
      model: "jev-1.13.0",
      decision: "needs_human",
      reasons: ["fabricated_specifics_risk"]
    });
    expect(askJevMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed to the human queue on any Jev outage", async () => {
    askJevMock.mockRejectedValue(new JevUnavailableError("jev_transport_error:timeout"));
    const { admin, records } = adminStub();

    const result = await runJevBatchAutoReview(admin as never, "user-1", drafts, {
      brandDigest: "Brand: Finfold",
      operation: "x_engagement_draft"
    });

    expect(result).toEqual({ approved: 0, needsHuman: 2 });
    expect(approveMock).not.toHaveBeenCalled();
    expect(records["job-1"]).toMatchObject({
      decision: "needs_human",
      reasons: [expect.stringContaining("jev_transport_error")]
    });
  });

  it("degrades to every_post behavior without touching Jev when disabled", async () => {
    jevEnabledMock.mockReturnValue(false);
    const { admin, records } = adminStub();

    const result = await runJevBatchAutoReview(admin as never, "user-1", drafts, {
      brandDigest: "Brand: Finfold",
      operation: "x_morning_generation"
    });

    expect(result).toEqual({ approved: 0, needsHuman: 2 });
    expect(askJevMock).not.toHaveBeenCalled();
    expect(records["job-1"]).toMatchObject({ decision: "needs_human", reasons: ["jev_disabled"] });
  });

  it("keeps a draft in the human queue when the approve transition refuses", async () => {
    askJevMock.mockResolvedValue({
      model: "jev-1.13.0",
      answers: clearAnswers(0),
      usage: { inputTokens: 400, outputTokens: 0 }
    });
    approveMock.mockResolvedValue(null); // already transitioned / race lost
    const { admin, records } = adminStub();

    const result = await runJevBatchAutoReview(admin as never, "user-1", [drafts[0]], {
      brandDigest: "Brand: Finfold",
      operation: "x_morning_generation"
    });

    expect(result).toEqual({ approved: 0, needsHuman: 1 });
    expect(records["job-1"]).toMatchObject({
      decision: "needs_human",
      reasons: ["approve_transition_failed"]
    });
  });
});
