import { describe, expect, it } from "vitest";
import { getGenerateDisabledReason } from "@/lib/workbench-gating";

describe("workbench generate gating", () => {
  it("explains when product context is too short", () => {
    expect(getGenerateDisabledReason({
      ideaText: "好想做爱呀",
      selectedPlatformCount: 3,
      isLoading: false,
      authenticated: true,
      trialUsed: false,
      locale: "zh"
    })).toBe("请至少输入 20 个字的产品资产说明，当前 5 个字。");
  });

  it("explains when no platform is selected", () => {
    expect(getGenerateDisabledReason({
      ideaText: "This is a fully described product idea for testing.",
      selectedPlatformCount: 0,
      isLoading: false,
      authenticated: true,
      trialUsed: false,
      locale: "en"
    })).toBe("Select at least 1 platform to generate for.");
  });

  it("explains when guest trial is exhausted", () => {
    expect(getGenerateDisabledReason({
      ideaText: "This is a fully described product idea for testing.",
      selectedPlatformCount: 2,
      isLoading: false,
      authenticated: false,
      trialUsed: true,
      locale: "zh"
    })).toBe("试玩次数已用完，请先登录后继续生成。");
  });

  it("returns null when generation is allowed", () => {
    expect(getGenerateDisabledReason({
      ideaText: "This is a fully described product idea for testing.",
      selectedPlatformCount: 2,
      isLoading: false,
      authenticated: true,
      trialUsed: false,
      locale: "en"
    })).toBeNull();
  });
});
