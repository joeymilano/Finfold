import { describe, expect, it } from "vitest";
import { buildCampaignPlan, explainCampaignPlan, getLocalizedCampaignPlan, mergeLocalizedCampaignPlan } from "@/lib/campaign";

describe("campaign generator", () => {
  it("creates one campaign item per requested day", () => {
    const campaign = buildCampaignPlan({
      ideaText: "Finfold turns one product idea into platform-native content for founders going global.",
      goal: "product-launch",
      persona: "indie-builder",
      platforms: ["x", "linkedin", "reddit"],
      durationDays: 7,
      language: "en"
    });

    expect(campaign.days).toHaveLength(7);
    expect(campaign.days[0]?.day).toBe(1);
    expect(campaign.days[6]?.day).toBe(7);
  });

  it("rotates selected platforms through the campaign", () => {
    const campaign = buildCampaignPlan({
      ideaText: "A cross-platform content workflow for AI SaaS teams.",
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: ["wechat", "xiaohongshu", "linkedin"],
      durationDays: 14,
      language: "zh"
    });

    const primaryPlatforms = new Set(campaign.days.map((day) => day.primaryPlatform));

    expect(primaryPlatforms).toEqual(new Set(["wechat", "xiaohongshu", "linkedin"]));
  });

  it("uses launch-specific phases for product launch campaigns", () => {
    const campaign = buildCampaignPlan({
      ideaText: "Launch a founder content OS.",
      goal: "product-launch",
      persona: "ai-saas",
      platforms: ["product-hunt", "x"],
      durationDays: 7,
      language: "en"
    });

    expect(campaign.strategy).toContain("launch");
    expect(campaign.days.some((day) => day.phase.toLowerCase().includes("launch"))).toBe(true);
  });

  it("keeps English plans free of Chinese UI copy when the source idea is Chinese", () => {
    const campaign = buildCampaignPlan({
      ideaText: "面向设计服务的七天内容增长计划，逐步从认知推进到转化。",
      goal: "audience-growth",
      persona: "design-service",
      platforms: ["wechat", "xiaohongshu"],
      durationDays: 7,
      language: "en"
    });
    const visibleCopy = [
      campaign.title,
      campaign.strategy,
      ...campaign.days.flatMap((day) => [day.phase, day.theme, day.angle, day.deliverable, day.cta, ...day.checklist])
    ].join(" ");

    expect(visibleCopy).not.toMatch(/[\u3400-\u9fff\uf900-\ufaff]/);
    expect(campaign.days[0]?.angle).toContain("WeChat Official Account");
  });

  it("stores separate weekly plans for Chinese and English", () => {
    const zhPlan = buildCampaignPlan({
      ideaText: "一份面向设计服务团队的七天内容增长计划，从品牌认知逐步推进到业务转化。",
      goal: "audience-growth",
      persona: "design-service",
      platforms: ["xiaohongshu"],
      durationDays: 7,
      language: "zh"
    });
    const enPlan = buildCampaignPlan({
      ideaText: "A content growth plan for design service teams.",
      goal: "audience-growth",
      persona: "design-service",
      platforms: ["linkedin"],
      durationDays: 7,
      language: "en"
    });
    const stored = mergeLocalizedCampaignPlan(zhPlan, "en", enPlan);

    expect(getLocalizedCampaignPlan(stored, "zh")).toEqual(zhPlan);
    expect(getLocalizedCampaignPlan(stored, "en")).toEqual(enPlan);
  });

  it("propagates failures from a route-owned billable invocation", async () => {
    const plan = buildCampaignPlan({
      ideaText: "A content growth plan for design service teams.",
      goal: "audience-growth",
      persona: "design-service",
      platforms: ["linkedin"],
      durationDays: 7,
      language: "en"
    });

    await expect(explainCampaignPlan(plan, plan.strategy, "en", {
      invoke: async () => {
        throw new Error("provider failed");
      }
    })).rejects.toThrow("provider failed");
  });
});
