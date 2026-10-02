import { describe, expect, it } from "vitest";
import { contentInputKey } from "@/lib/content-fingerprint";

const base = {
  ideaText: "A detailed source note for one content experiment.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["xiaohongshu", "linkedin"]
};

describe("content input fingerprint", () => {
  it("keeps platform ordering stable but separates approved Research contexts", () => {
    expect(contentInputKey(base)).toBe(contentInputKey({
      ...base,
      platforms: [...base.platforms].reverse()
    }));
    expect(contentInputKey(base)).not.toBe(contentInputKey({
      ...base,
      researchMissionId: "1f34c0d0-3124-4ca7-b352-da298139cb74"
    }));
  });
});
