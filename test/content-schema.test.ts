import { describe, expect, it } from "vitest";
import { generateRequestSchema, kitOutputSchema, performanceMetricsSchema } from "@/lib/content-schema";

describe("content kit output schema", () => {
  it("accepts complete platform output", () => {
    const output = kitOutputSchema.parse({
      platform: "x",
      title: "One idea should not become one post.",
      body: "Turn it into a platform-native content kit.",
      cta: "Book a strategy call.",
      notes: "Keep it concise.",
      strategy: "Sharp hook for public iteration."
    });

    expect(output.platform).toBe("x");
    expect(output.locked).toBe(false);
    expect(output.publishStatus).toBe("draft");
    expect(output.visualAssets).toBeUndefined();
  });

  it("accepts structured visual assets attached to a saved output", () => {
    const output = kitOutputSchema.parse({
      platform: "wechat",
      title: "Article",
      body: "A complete article body.",
      cta: "Read more",
      notes: "Note",
      strategy: "Long-form",
      visualAssets: [{
        assetType: "article_illustration",
        positionIndex: 0,
        role: "concept",
        sourceExcerpt: "A complete article body.",
        placementHint: "After paragraph one",
        prompt: "Editorial illustration",
        imageUrl: "https://example.com/illustration.jpg",
        altText: "Article illustration"
      }]
    });
    expect(output.visualAssets?.[0].metadata).toEqual({});
  });

  it("rejects outputs without CTA", () => {
    expect(() =>
      kitOutputSchema.parse({
        platform: "linkedin",
        title: "Founder post",
        body: "Body",
        notes: "Note",
        strategy: "Strategy"
      })
    ).toThrow();
  });
});

describe("generation mission binding", () => {
  const request = {
    ideaText: "A sufficiently detailed source note for a controlled content experiment.",
    goal: "lead-gen",
    persona: "ai-saas",
    platforms: ["xiaohongshu"]
  };

  it("accepts a valid Growth Mission id", () => {
    const parsed = generateRequestSchema.parse({
      ...request,
      growthMissionId: "9cc86165-4795-4e78-ac2e-692f51fdbba7"
    });
    expect(parsed.growthMissionId).toBe("9cc86165-4795-4e78-ac2e-692f51fdbba7");
  });

  it("accepts an attachment-only workbench source", () => {
    const parsed = generateRequestSchema.parse({
      ...request,
      ideaText: "",
      sourceAttachments: [{
        id: "5b869a9a-176f-4d92-97f7-42fefc7eaaf3",
        name: "catalog.xlsx",
        size: 2048,
        kind: "data",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storagePath: "user/catalog.xlsx"
      }]
    });
    expect(parsed.sourceAttachments).toHaveLength(1);
  });

  it("accepts a Research Mission id and rejects malformed ids", () => {
    const researchMissionId = "1f34c0d0-3124-4ca7-b352-da298139cb74";
    expect(generateRequestSchema.parse({
      ...request,
      researchMissionId
    }).researchMissionId).toBe(researchMissionId);
    expect(() => generateRequestSchema.parse({
      ...request,
      researchMissionId: "research-1"
    })).toThrow();
  });

  it("accepts a validated Xiaohongshu workflow and approved artifact versions", () => {
    const parsed = generateRequestSchema.parse({
      ...request,
      xhsWorkflowId: "31730f26-2422-488f-be2b-3c7c2fc999ad",
      artifactVersionIds: [
        "86985734-027a-47ba-af14-f5ca433d415f"
      ]
    });
    expect(parsed.xhsWorkflowId).toBe("31730f26-2422-488f-be2b-3c7c2fc999ad");
    expect(parsed.artifactVersionIds).toHaveLength(1);
  });

  it("rejects a malformed Growth Mission id", () => {
    expect(() => generateRequestSchema.parse({ ...request, growthMissionId: "mission-1" })).toThrow();
  });

  it("accepts six platforms per generation and rejects a seventh", () => {
    const sixPlatforms = ["wechat", "xiaohongshu", "zhihu", "moments", "x", "linkedin"];
    expect(generateRequestSchema.parse({ ...request, platforms: sixPlatforms }).platforms).toHaveLength(6);
    expect(() => generateRequestSchema.parse({
      ...request,
      platforms: [...sixPlatforms, "instagram"]
    })).toThrow();
  });

  it("accepts server-populated single-variable experiment context", () => {
    const parsed = generateRequestSchema.parse({
      ...request,
      experimentContext: {
        platform: "xiaohongshu",
        hypothesis: "A concrete cover promise will improve qualified opens.",
        primaryMetric: "封面点击率",
        primaryMetricKey: "cover_click_rate",
        baselineValue: 20.6,
        targetValue: 25,
        variants: [{
          name: "具体场景",
          angle: "设计师复盘",
          hookInstruction: "先写真实场景",
          format: "3:4 carousel"
        }]
      }
    });
    expect(parsed.experimentContext?.primaryMetricKey).toBe("cover_click_rate");
  });
});

describe("performance metrics schema", () => {
  it("defaults source to manual when omitted", () => {
    const metrics = performanceMetricsSchema.parse({ platform: "wechat" });
    expect(metrics.source).toBe("manual");
    expect(metrics.views).toBe(0);
    expect(metrics.coverClickRate).toBe(0);
    expect(metrics.averageViewSeconds).toBe(0);
    expect(metrics.followerGrowth).toBe(0);
    expect(metrics.profileVisits).toBe(0);
  });

  it("accepts import and auto as explicit sources", () => {
    expect(performanceMetricsSchema.parse({ platform: "wechat", source: "import" }).source).toBe("import");
    expect(performanceMetricsSchema.parse({ platform: "wechat", source: "auto" }).source).toBe("auto");
  });

  it("rejects an unrecognized source", () => {
    expect(() => performanceMetricsSchema.parse({ platform: "wechat", source: "scraped" })).toThrow();
  });

  it("accepts negative follower growth while keeping other platform metrics nonnegative", () => {
    const metrics = performanceMetricsSchema.parse({
      platform: "xiaohongshu",
      views: 984,
      coverClickRate: 20.6,
      averageViewSeconds: 8.4,
      profileVisits: 45,
      followerGrowth: -2
    });
    expect(metrics.followerGrowth).toBe(-2);
    expect(() => performanceMetricsSchema.parse({ platform: "xiaohongshu", views: -1 })).toThrow();
  });
});
