import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorStyleProfileCard } from "@/components/app-shell/CreatorStyleProfileCard";
import {
  assertCreatorStyleEvidence,
  creatorStyleAnalysisInputSchema,
  creatorStyleProfileSchema,
  type CreatorStyleSample
} from "@/lib/agent/style-profile";
import { buildOpenAiToolsPayload, getAgentTool } from "@/lib/agent/tools";

const samples: CreatorStyleSample[] = [1, 2, 3].map((index) => ({
  id: `S${index}`,
  title: `代表内容 ${index}`,
  sourceType: "pasted_text",
  text: `这是第 ${index} 篇用户提供的完整代表内容，用来观察开场、结构、证据和转化方式。`
}));

const profile = creatorStyleProfileSchema.parse({
  creatorName: "示例博主",
  profileUrl: "https://example.com/creator",
  performanceStatus: "unverified_reference",
  confidence: "medium",
  audienceAndTopics: [{ finding: "从具体工作场景切入受众问题", evidenceIds: ["S1", "S2"] }],
  hooksAndPackaging: [{ finding: "开场先提出可验证的矛盾", evidenceIds: ["S1"] }],
  structureAndRhythm: [{ finding: "结论、证据、动作三段推进", evidenceIds: ["S2"] }],
  proofAndTrust: [{ finding: "用过程截图代替空泛背书", evidenceIds: ["S2", "S3"] }],
  engagementAndConversion: [{ finding: "结尾只设置一个低门槛动作", evidenceIds: ["S3"] }],
  toneKeywords: ["直接", "具体"],
  transferableRules: [{ finding: "每篇只解决一个可描述的问题", evidenceIds: ["S1", "S3"] }],
  doNotCopy: ["不复制对方的身份、口头禅或原句"],
  limitations: ["未提供平台表现指标，不能称为爆款样本"],
  evidenceSources: samples.map((sample) => ({
    id: sample.id,
    title: sample.title,
    sourceType: sample.sourceType,
    url: sample.url,
    hasMetrics: false
  }))
});

describe("evidence-first creator style learning", () => {
  it("requires a profile URL and at least three real samples", () => {
    expect(() => creatorStyleAnalysisInputSchema.parse({
      creatorName: "示例博主",
      profileUrl: "https://example.com/creator",
      samples: samples.slice(0, 2)
    })).toThrow();
    expect(creatorStyleAnalysisInputSchema.parse({
      creatorName: "示例博主",
      profileUrl: "https://example.com/creator",
      samples
    }).samples).toHaveLength(3);
    expect(() => creatorStyleAnalysisInputSchema.parse({
      creatorName: "示例博主",
      profileUrl: "https://example.com/creator",
      samples: [samples[0], { ...samples[1], id: "S1" }, samples[2]]
    })).toThrow(/unique evidence IDs/);
  });

  it("rejects invented evidence IDs and unsupported performance claims", () => {
    expect(() => assertCreatorStyleEvidence({
      ...profile,
      transferableRules: [{ finding: "虚构规则", evidenceIds: ["S404"] }]
    }, samples)).toThrow(/unknown evidence: S404/);
    expect(() => assertCreatorStyleEvidence({
      ...profile,
      performanceStatus: "performance_evidence_supplied"
    }, samples)).toThrow(/claimed performance without supplied metrics/);
  });

  it("exposes the two-stage tools and hides name-only legacy learning", () => {
    const exposedNames = buildOpenAiToolsPayload().map((item) => item.function.name);
    expect(exposedNames).toContain("analyze_creator_style");
    expect(exposedNames).toContain("save_creator_style_profile");
    expect(exposedNames).not.toContain("learn_style");
    expect(getAgentTool("learn_style")).toBeDefined();
    expect(getAgentTool("analyze_creator_style")?.mutates).toBe(false);
    expect(getAgentTool("save_creator_style_profile")?.mutates).toBe(true);
  });

  it("renders the evidence profile and the three conversational follow-ups", () => {
    const onAskAgent = vi.fn();
    render(<CreatorStyleProfileCard profile={profile} locale="zh" variant="surface" onAskAgent={onAskAgent} />);
    expect(screen.getByRole("region", { name: "对标博主能力画像" })).toBeInTheDocument();
    expect(screen.getByText("仅为对标样本，未验证爆款表现")).toBeInTheDocument();
    expect(screen.getByText("代表内容 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /用于下一篇内容/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成 3 个选题实验/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /加入 14 天陪跑/ })).toBeInTheDocument();
  });
});
