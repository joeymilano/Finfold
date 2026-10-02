import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToneDriftAlert } from "@/components/workbench/ToneDriftAlert";
import type { ToneDriftAssessment } from "@/lib/tone-drift";

function assessment(overrides: Partial<ToneDriftAssessment> = {}): ToneDriftAssessment {
  return {
    status: "drift",
    score: 42,
    confidence: "medium",
    baseline: {
      source: "performance",
      confidence: "medium",
      sampleCount: 2,
      performanceSampleCount: 2,
      brandMemorySampleCount: 0,
      consistency: 82,
      profile: {
        opening: "story",
        averageSentenceLength: 16,
        averageParagraphLength: 80,
        shortParagraphRatio: 0.3,
        emojiPerHundredChars: 0,
        hashtagPerHundredChars: 0,
        emphaticPunctuationPerHundredChars: 0,
        ctaStrength: 60,
        promotionalLanguage: 0,
        humanVoice: 95,
        toneKeywordCoverage: 0
      }
    },
    differences: [{
      key: "humanVoice",
      direction: "lower",
      weight: 13,
      reasonEn: "The draft contains more templated language than the reference voice.",
      reasonZh: "当前模板化表达多于参考内容。",
      suggestionEn: "Replace generic phrases with specific facts.",
      suggestionZh: "用具体事实替换泛化表达。"
    }],
    directionEn: "Align with your reference voice: Replace generic phrases with specific facts.",
    directionZh: "向参考语气靠拢：用具体事实替换泛化表达。",
    ...overrides
  };
}

describe("ToneDriftAlert", () => {
  it("explains a meaningful drift and only passes a regeneration direction when requested", () => {
    const onUseDirection = vi.fn();
    render(<ToneDriftAlert assessment={assessment()} locale="en" onUseDirection={onUseDirection} />);

    expect(screen.getByText("Voice may drift from 2 top-performing posts")).toBeInTheDocument();
    expect(screen.getByText("The draft contains more templated language than the reference voice.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this direction" }));
    expect(onUseDirection).toHaveBeenCalledWith("Align with your reference voice: Replace generic phrases with specific facts.");
  });

  it("does not present a low-confidence Brand Memory reference as a publishing warning", () => {
    render(<ToneDriftAlert assessment={assessment({
      status: "watch",
      confidence: "low",
      baseline: { ...assessment().baseline!, source: "brand_memory", confidence: "low", performanceSampleCount: 0 }
    })} locale="en" />);

    expect(screen.getByText("Voice reference is still learning")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use this direction" })).not.toBeInTheDocument();
  });

  it("is honest when the account has no reference material", () => {
    render(<ToneDriftAlert assessment={assessment({
      status: "unavailable",
      score: null,
      confidence: null,
      baseline: null,
      differences: [],
      directionEn: null,
      directionZh: null
    })} locale="en" />);

    expect(screen.getByText("Voice alignment will appear after you have reference posts or Brand Memory examples.")).toBeInTheDocument();
  });
});