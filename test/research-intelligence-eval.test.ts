import { describe, expect, it } from "vitest";
import {
  blindResearchIntelligenceCase,
  dedupeResearchIntelligenceReviews,
  evaluateResearchIntelligencePairValidity,
  summarizeResearchIntelligenceEval,
  type ResearchIntelligenceCandidateScore,
  type ResearchIntelligenceEvalCase,
  type ResearchIntelligenceEvalDataset,
  type ResearchIntelligenceEvalReview,
  type ResearchIntelligenceModelAttempt
} from "@/lib/research-intelligence-eval";

const attempt = (overrides: Partial<ResearchIntelligenceModelAttempt> = {}): ResearchIntelligenceModelAttempt => ({
  provider: "test",
  model: "test-model",
  promptVersion: "test-v1",
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  estimatedCostUsd: 0.01,
  ...overrides
});

function evaluationCase(
  index: number,
  options: {
    controlAttempts?: ResearchIntelligenceModelAttempt[];
    treatmentAttempts?: ResearchIntelligenceModelAttempt[];
    controlCostUsd?: number | null;
  } = {}
): ResearchIntelligenceEvalCase {
  const suffix = String(index).padStart(12, "0");
  const id = `10000000-0000-4000-8000-${suffix}`;
  const missionId = `20000000-0000-4000-8000-${String(Math.ceil(index / 3)).padStart(12, "0")}`;
  const output = {
    platform: "xiaohongshu" as const,
    title: "把研究结论变成可验证内容",
    body: "先写清用户问题，再给出一份可以执行和复盘的步骤。",
    cta: "保存这份检查单",
    notes: "使用一组可比较的内容变量。",
    strategy: "围绕真实用户问题组织内容。"
  };
  return {
    id,
    missionId,
    createdAt: "2026-08-17T00:00:00.000Z",
    brief: {
      ideaText: "Finfold 使用真实市场证据帮助小团队生成平台原生内容。",
      goal: "lead-gen",
      persona: "ai-saas",
      platform: "xiaohongshu",
      language: "zh"
    },
    intelligenceContext: {
      missionId,
      missionTitle: "AI 内容机会",
      question: "哪些问题值得优先验证？",
      executiveSummary: "用户需要更具体的步骤。",
      opportunities: [{ title: "流程拆解", rationale: "用户需要执行证据。", evidenceIds: ["E1"], confidence: "medium" }],
      strategy: { thesis: "用流程回应执行焦虑。", contentPillars: ["流程"], conversionPath: "笔记 → 主页" },
      evidence: [{ id: "E1", sourceType: "public_web", title: "公开观察", excerpt: "用户反复询问如何把想法变成稳定流程。", reliability: "observed" }],
      limitations: ["公开观察不能证明因果。"]
    },
    control: {
      output,
      generation: {
        modelTier: "haiku",
        durationMs: 1000,
        attempts: options.controlAttempts ?? [attempt()],
        estimatedCostUsd: options.controlCostUsd ?? 0.01
      }
    },
    treatment: {
      output: { ...output, title: "一条想法如何变成每周可复盘的流程" },
      generation: {
        modelTier: "haiku",
        durationMs: 1100,
        attempts: options.treatmentAttempts ?? [attempt()],
        estimatedCostUsd: 0.012
      }
    }
  };
}

function dataset(cases: ResearchIntelligenceEvalCase[] = defaultCases()): ResearchIntelligenceEvalDataset {
  return {
    version: 2,
    title: "Research intelligence blind test",
    blindSeed: "stable-blind-seed",
    createdAt: "2026-08-17T00:00:00.000Z",
    cases
  };
}

function defaultCases(): ResearchIntelligenceEvalCase[] {
  // 30 cases over 10 missions (3 per mission).
  return Array.from({ length: 30 }, (_, index) => evaluationCase(index + 1));
}

const controlScore: ResearchIntelligenceCandidateScore = {
  topicFit: 3, marketSpecificity: 3, actionability: 3,
  firstDraftUsable: false, hallucinatedClaim: false, sourceCopying: false
};
const treatmentScore: ResearchIntelligenceCandidateScore = {
  topicFit: 5, marketSpecificity: 5, actionability: 5,
  firstDraftUsable: true, hallucinatedClaim: false, sourceCopying: false
};

function review(
  item: ResearchIntelligenceEvalCase,
  blindSeed: string,
  outcome: "treatment" | "control" | "tie",
  reviewerId = "reviewer-1",
  reviewedAt = "2026-08-17T01:00:00.000Z"
): ResearchIntelligenceEvalReview {
  const blinded = blindResearchIntelligenceCase(item, blindSeed);
  const treatmentIsA = blinded.candidateA.title === item.treatment.output.title;
  const preference = outcome === "tie"
    ? "tie"
    : outcome === "treatment"
      ? (treatmentIsA ? "A" : "B")
      : (treatmentIsA ? "B" : "A");
  return {
    caseId: item.id,
    reviewerId,
    preferredForTopic: preference,
    overallPreference: preference,
    candidateA: treatmentIsA ? treatmentScore : controlScore,
    candidateB: treatmentIsA ? controlScore : treatmentScore,
    reviewedAt
  };
}

const provenance = {
  testCommand: "npm test -- research-intelligence",
  executedAt: "2026-08-17T02:00:00.000Z",
  workspaceFingerprint: "abc123def456",
  automatedTestsPassed: true
};

describe("Research intelligence blind evaluation", () => {
  it("fails closed when a legacy version 1 dataset reaches the summarizer", () => {
    // Regression guard: the dataset schema is the audit entrypoint; an unmigrated
    // v1 dataset (stale fixture, historical import, operator checkpoint) must be
    // rejected loudly instead of being summarized under the v2 protocol.
    const legacyDataset = { ...dataset(), version: 1 } as unknown as ResearchIntelligenceEvalDataset;
    const reviews = [review(evaluationCase(1), "stable-blind-seed", "treatment")];
    expect(() => summarizeResearchIntelligenceEval(legacyDataset, reviews, { provenance }))
      .toThrow(/Invalid literal value, expected 2/);
  });

  it("keeps candidate ordering deterministic without exposing arm labels", () => {
    const item = evaluationCase(1);
    expect(blindResearchIntelligenceCase(item, "stable-blind-seed"))
      .toEqual(blindResearchIntelligenceCase(item, "stable-blind-seed"));
    expect(Object.keys(blindResearchIntelligenceCase(item, "stable-blind-seed")))
      .not.toContain("treatment");
  });

  it("passes only when all quality and safety gates clear, labelled as P0 pilot", () => {
    const input = dataset();
    const reviews = input.cases.map((item) => review(item, input.blindSeed, "treatment"));
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.completedCases).toBe(30);
    expect(summary.topicWinShare).toBe(1);
    expect(summary.topicWinShareCi).toEqual({ lower: 1, upper: 1 });
    expect(summary.marketSpecificityActionabilityLift).toBeCloseTo(2 / 3);
    expect(summary.firstDraftUsableLiftPoints).toBe(100);
    expect(summary.passed).toBe(true);
    expect(summary.verdict).toBe("p0-pilot-passed");
    expect(summary.verdictNote).toContain("不得表述为已证明跨平台普遍有效");
  });

  it("fails closed when no automated-test provenance is registered", () => {
    const input = dataset();
    const reviews = input.cases.map((item) => review(item, input.blindSeed, "treatment"));
    const summary = summarizeResearchIntelligenceEval(input, reviews, {});
    expect(summary.passed).toBe(false);
    expect(summary.gates.find((gate) => gate.key === "tenant_boundary")?.passed).toBe(false);
    expect(summary.gates.find((gate) => gate.key === "tenant_boundary")?.actual).toContain("未登记");
  });

  it("fails closed when the registered automated tests did not pass", () => {
    const input = dataset();
    const reviews = input.cases.map((item) => review(item, input.blindSeed, "treatment"));
    const summary = summarizeResearchIntelligenceEval(input, reviews, {
      provenance: { ...provenance, automatedTestsPassed: false }
    });
    expect(summary.passed).toBe(false);
    expect(summary.gates.find((gate) => gate.key === "tenant_boundary")?.passed).toBe(false);
  });

  it("counts ties as half wins over all completed cases, so ties cannot inflate the win share", () => {
    const input = dataset();
    // 10 treatment wins, 20 ties: share = (10 + 0.5×20) / 30 = 0.6667 under the
    // old "exclude ties from the denominator" rule this would have been 100%.
    const reviews = input.cases.map((item, index) =>
      review(item, input.blindSeed, index < 10 ? "treatment" : "tie")
    );
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.topicCounts).toEqual({ treatmentWins: 10, controlWins: 0, ties: 20 });
    expect(summary.topicWinShare).toBeCloseTo((10 + 10) / 30, 5);
    expect(summary.topicWinShare).toBeLessThan(1);
  });

  it("all-tie reviews produce a 0.5 share, not a null or perfect rate", () => {
    const input = dataset();
    const reviews = input.cases.map((item) => review(item, input.blindSeed, "tie"));
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.topicWinShare).toBe(0.5);
    expect(summary.topicCounts.ties).toBe(30);
  });

  it("weighs every case equally no matter how many reviewers scored it", () => {
    const input = dataset(defaultCases().slice(0, 2));
    // Case 1: five reviews (4 treatment wins, 1 control win) -> case share 0.8.
    // Case 2: one review (control win) -> case share 0.
    // Case-equal weighting gives 0.4; review-level weighting would give 4/6 ≈ 0.667.
    const reviews = [
      ...[1, 2, 3, 4].map((_, index) => review(input.cases[0], input.blindSeed, "treatment", `reviewer-${index + 1}`)),
      review(input.cases[0], input.blindSeed, "control", "reviewer-5"),
      review(input.cases[1], input.blindSeed, "control", "reviewer-1")
    ];
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.completedCases).toBe(2);
    expect(summary.topicWinShare).toBeCloseTo((0.8 + 0) / 2, 5);
  });

  it("keeps only the newest effective score per caseId + reviewerId", () => {
    const item = evaluationCase(1);
    const stale = review(item, "stable-blind-seed", "control", "reviewer-1", "2026-08-17T01:00:00.000Z");
    const fresh = review(item, "stable-blind-seed", "treatment", "reviewer-1", "2026-08-17T02:00:00.000Z");
    expect(dedupeResearchIntelligenceReviews([stale, fresh])).toEqual([fresh]);
    const input = dataset([item]);
    const summary = summarizeResearchIntelligenceEval(input, [stale, fresh], { provenance });
    expect(summary.reviewCount).toBe(1);
    expect(summary.topicWinShare).toBe(1);
  });

  it("excludes pairs whose two arms ended on different final models, while still counting their cost", () => {
    const invalidCase = evaluationCase(1, {
      // The provider failed over between the arms; the treatment arm ended on
      // a different final model.
      treatmentAttempts: [attempt({ provider: "fallback", model: "fallback-model" })]
    });
    expect(evaluateResearchIntelligencePairValidity(invalidCase)).toEqual({
      status: "invalid",
      reasons: ["final_provider_model_mismatch"]
    });
    const validCase = evaluationCase(2);
    const input = dataset([invalidCase, validCase]);
    const reviews = [review(invalidCase, input.blindSeed, "treatment"), review(validCase, input.blindSeed, "treatment")];
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.invalidPairs).toBe(1);
    expect(summary.validPairs).toBe(1);
    // The invalid pair's review must not enter the effective sample...
    expect(summary.completedCases).toBe(1);
    // ...but its cost is still fully reported.
    expect(summary.controlEstimatedCostUsd).toBeCloseTo(0.02, 5);
    expect(summary.treatmentEstimatedCostUsd).toBeCloseTo(0.024, 5);
    expect(summary.gates.find((gate) => gate.key === "pair_comparability")?.passed).toBe(false);
  });

  it("marks pairs invalid on model tier or prompt version drift", () => {
    const tierDrift = evaluationCase(1, { controlAttempts: [attempt({ provider: "other", model: "bigger-model" })] });
    expect(evaluateResearchIntelligencePairValidity(tierDrift).reasons)
      .toEqual(expect.arrayContaining(["final_provider_model_mismatch"]));

    const promptDrift = evaluationCase(2, { treatmentAttempts: [attempt({ promptVersion: "test-v2" })] });
    expect(evaluateResearchIntelligencePairValidity(promptDrift).reasons)
      .toEqual(expect.arrayContaining(["prompt_version_mismatch"]));

    const missingAudit = evaluationCase(3, { controlAttempts: [], treatmentAttempts: [] });
    expect(evaluateResearchIntelligencePairValidity(missingAudit).reasons)
      .toEqual(["missing_attempt_audit"]);
  });

  it("reports failed calls and their cost without letting them into the sample", () => {
    const input = dataset([]);
    const summary = summarizeResearchIntelligenceEval(input, [], {
      provenance,
      failedCalls: [{
        occurredAt: "2026-08-17T03:00:00.000Z",
        missionId: "20000000-0000-4000-8000-000000000001",
        stage: "pair generation",
        error: "provider timeout",
        attempts: [attempt()],
        estimatedCostUsd: 0.01
      }]
    });
    expect(summary.failedCallCount).toBe(1);
    expect(summary.failedCallEstimatedCostUsd).toBeCloseTo(0.01, 5);
    expect(summary.completedCases).toBe(0);
    expect(summary.passed).toBe(false);
  });

  it("refuses to pass when the point estimate clears the bar but the confidence interval is too wide", () => {
    const input = dataset();
    // 20 treatment wins / 10 control wins: share 0.667 ≥ 0.6, but with n = 30
    // the 95% CI dips well below 60%, so the gate must fail and the verdict
    // must be "expand to 60 cases" instead of a forced pass.
    const reviews = input.cases.map((item, index) =>
      review(item, input.blindSeed, index < 20 ? "treatment" : "control")
    );
    const summary = summarizeResearchIntelligenceEval(input, reviews, { provenance });
    expect(summary.topicWinShare).toBeCloseTo(20 / 30, 5);
    expect(summary.topicWinShareCi).not.toBeNull();
    expect(summary.topicWinShareCi!.lower).toBeLessThan(0.6);
    expect(summary.gates.find((gate) => gate.key === "topic_fit")?.passed).toBe(false);
    expect(summary.passed).toBe(false);
    expect(summary.verdict).toBe("expand-to-60-cases");
    expect(summary.verdictNote).toContain("60");
  });
});
