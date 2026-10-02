import { describe, expect, it } from "vitest";
import { evaluateCardReview, CARD_REVIEW_LIMITS } from "@/lib/content-pipeline/cards-review";

function noul(value: number): Record<string, unknown> {
  return { noul: value };
}

describe("Card Jev review thresholds", () => {
  it("passes when all three probabilities sit under their limits", () => {
    const result = evaluateCardReview({
      fabricated_data: noul(0.02),
      clickbait_hype: noul(0.10),
      ai_tell: noul(0.20)
    });
    expect(result.decision).toBe("pass");
    expect(result.reasons).toEqual([]);
    expect(result.metrics).toEqual({ fabricatedData: 0.02, clickbaitHype: 0.10, aiTell: 0.20 });
  });

  it("blocks on each individual threshold breach", () => {
    expect(evaluateCardReview({
      fabricated_data: noul(CARD_REVIEW_LIMITS.maxFabricatedData + 0.01),
      clickbait_hype: noul(0.1),
      ai_tell: noul(0.1)
    }).reasons).toEqual(["fabricated_data_risk"]);
    expect(evaluateCardReview({
      fabricated_data: noul(0.1),
      clickbait_hype: noul(CARD_REVIEW_LIMITS.maxClickbaitHype + 0.01),
      ai_tell: noul(0.1)
    }).reasons).toEqual(["clickbait_hype_risk"]);
    expect(evaluateCardReview({
      fabricated_data: noul(0.1),
      clickbait_hype: noul(0.1),
      ai_tell: noul(CARD_REVIEW_LIMITS.maxAiTell + 0.01)
    }).reasons).toEqual(["ai_tell_risk"]);
  });

  it("fails blocked when any answer is missing or malformed", () => {
    expect(evaluateCardReview({ fabricated_data: noul(0.1), clickbait_hype: noul(0.1) }).decision).toBe("blocked");
    expect(evaluateCardReview({
      fabricated_data: noul(0.1),
      clickbait_hype: noul(0.1),
      ai_tell: { noul: "not-a-number" }
    }).decision).toBe("blocked");
    expect(evaluateCardReview({}).decision).toBe("blocked");
  });
});
