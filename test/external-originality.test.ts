import { describe, expect, it } from "vitest";
import type { GenerateRequest } from "@/lib/content-schema";
import { findExternalPhraseOverlaps } from "@/lib/external-originality";

const input: GenerateRequest = {
  ideaText: "A sufficiently detailed product brief for an evidence-led content experiment.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["xiaohongshu"],
  mediaAssets: [],
  language: "zh",
  intelligenceContext: {
    missionId: "1f34c0d0-3124-4ca7-b352-da298139cb74",
    missionTitle: "品类机会",
    question: "哪些问题值得优先验证？",
    executiveSummary: "先验证执行焦虑。",
    opportunities: [{ title: "流程拆解", rationale: "用户需要步骤。", evidenceIds: ["E1"], confidence: "low" }],
    strategy: { thesis: "解释真实流程。", contentPillars: ["流程"], conversionPath: "内容 → 主页" },
    evidence: [{
      id: "E1",
      sourceType: "public_web",
      title: "公开观察",
      excerpt: "很多团队真正缺少的不是更多工具而是一套可以重复执行的流程。 The strongest teams turn a vague idea into one repeatable operating system before adding more tools.",
      reliability: "observed"
    }],
    limitations: ["单一来源"]
  }
};

describe("external evidence originality guard", () => {
  it("rejects substantial Chinese or English verbatim reuse", () => {
    expect(findExternalPhraseOverlaps(input, {
      title: "一套可以重复执行的流程",
      body: "很多团队真正缺少的不是更多工具，而是执行方式。",
      cta: "查看流程"
    })).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "chinese", evidenceId: "E1" })]));

    expect(findExternalPhraseOverlaps(input, {
      title: "Build the system first",
      body: "The strongest teams turn a vague idea into one repeatable operating system before they scale.",
      cta: "See the workflow"
    })).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "english", evidenceId: "E1" })]));
  });

  it("allows the same insight when it is expressed independently", () => {
    expect(findExternalPhraseOverlaps(input, {
      title: "先把动作固定下来",
      body: "工具越堆越多，团队仍会卡住。先定义每周可复盘的步骤，再决定需要什么软件。",
      cta: "保存这份检查单"
    })).toEqual([]);
  });
});
