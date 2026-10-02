import { describe, expect, it } from "vitest";
import { feedbackRule, mergeApprovedExample, mergeFeedbackRules, outputFeedbackRequestSchema } from "@/lib/output-feedback";

describe("output feedback", () => {
  it("requires a reason for unhelpful feedback", () => {
    const result = outputFeedbackRequestSchema.safeParse({
      outputId: "1a111111-1111-4111-8111-111111111111",
      kitId: "2a222222-2222-4222-8222-222222222222",
      rating: "unhelpful",
      reasonCodes: []
    });
    expect(result.success).toBe(false);
  });

  it("deduplicates rules while retaining the newest limited set", () => {
    const rule = feedbackRule("LinkedIn", "weak_hook");
    expect(mergeFeedbackRules([rule], [rule, "new rule"], 2)).toEqual([rule, "new rule"]);
  });

  it("promotes a helpful final output into a bounded approved example", () => {
    expect(mergeApprovedExample(["first", "second"], "second", 2)).toEqual(["first", "second"]);
    expect(mergeApprovedExample(["first", "second"], "third", 2)).toEqual(["second", "third"]);
  });
});
