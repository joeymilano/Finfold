import { describe, expect, it } from "vitest";
import { buildCampaignPlan } from "@/lib/campaign";

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
});
