import { describe, expect, it } from "vitest";
import {
  deriveBlindReviewerPackId,
  type ResearchIntelligenceEvalCase,
  type ResearchIntelligenceEvalDataset,
  type ResearchIntelligenceEvalReview,
  type ResearchIntelligenceModelAttempt
} from "@/lib/research-intelligence-eval";
import {
  buildBlindReviewerPack,
  buildOperatorAnswerKey,
  buildOperatorCheckpoint,
  buildReviewResultPack,
  parseBlindReviewerPackFile,
  parseOperatorAnswerKeyFile,
  parseOperatorCheckpointFile,
  parseReviewResultPackFile,
  RESEARCH_INTELLIGENCE_FILE_KINDS,
  ResearchIntelligenceEvalFileError
} from "@/lib/research-intelligence-eval-files";

const attempt: ResearchIntelligenceModelAttempt = {
  provider: "test",
  model: "test-model",
  promptVersion: "test-v1",
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
  estimatedCostUsd: 0.01
};

function evaluationCase(index: number, treatmentModel = "test-model"): ResearchIntelligenceEvalCase {
  const suffix = String(index).padStart(12, "0");
  const missionId = `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const output = {
    platform: "xiaohongshu" as const,
    title: "把研究结论变成可验证内容",
    body: "先写清用户问题，再给出一份可以执行和复盘的步骤。",
    cta: "保存这份检查单",
    notes: "使用一组可比较的内容变量。",
    strategy: "围绕真实用户问题组织内容。"
  };
  return {
    id: `10000000-0000-4000-8000-${suffix}`,
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
      generation: { modelTier: "haiku", durationMs: 1000, attempts: [attempt], estimatedCostUsd: 0.01 }
    },
    treatment: {
      output: { ...output, title: "一条想法如何变成每周可复盘的流程" },
      generation: {
        modelTier: "haiku",
        durationMs: 1100,
        attempts: [{ ...attempt, model: treatmentModel }],
        estimatedCostUsd: 0.012
      }
    }
  };
}

function dataset(cases: ResearchIntelligenceEvalCase[] = [evaluationCase(1), evaluationCase(2)]): ResearchIntelligenceEvalDataset {
  return {
    version: 2,
    title: "Research intelligence blind test",
    blindSeed: "stable-blind-seed",
    createdAt: "2026-08-17T00:00:00.000Z",
    cases
  };
}

const review: ResearchIntelligenceEvalReview = {
  caseId: "10000000-0000-4000-8000-000000000001",
  reviewerId: "reviewer-1",
  preferredForTopic: "A",
  overallPreference: "tie",
  candidateA: { topicFit: 4, marketSpecificity: 4, actionability: 4, firstDraftUsable: true, hallucinatedClaim: false, sourceCopying: false },
  candidateB: { topicFit: 3, marketSpecificity: 3, actionability: 3, firstDraftUsable: false, hallucinatedClaim: false, sourceCopying: false },
  reviewedAt: "2026-08-17T01:00:00.000Z"
};

describe("Blind reviewer pack isolation", () => {
  it("leaks no arm labels, blind seed, strategy hints, or model details", () => {
    const pack = buildBlindReviewerPack(dataset());
    const serialized = JSON.stringify(pack);
    expect(serialized).not.toContain("control");
    expect(serialized).not.toContain("treatment");
    expect(serialized).not.toContain("blindSeed");
    expect(serialized).not.toContain("strategy");
    expect(serialized).not.toContain("test-model");
    expect(serialized).not.toContain("estimatedCostUsd");
    expect(Object.keys(pack.cases[0].candidateA).sort()).toEqual(["body", "cta", "notes", "platform", "title"]);
    expect(pack.cases[0].candidateA).not.toHaveProperty("strategy");
  });

  it("uses a pack id derived irreversibly from the blind seed", () => {
    const pack = buildBlindReviewerPack(dataset());
    expect(pack.packId).toBe(deriveBlindReviewerPackId("stable-blind-seed", "Research intelligence blind test"));
    expect(JSON.stringify(pack)).not.toContain("stable-blind-seed");
    // A different blind seed must not collide.
    const other = buildBlindReviewerPack({ ...dataset(), blindSeed: "another-blind-seed" });
    expect(other.packId).not.toBe(pack.packId);
  });

  it("excludes invalid pairs so reviewers never score incomparable candidates", () => {
    const cases = [evaluationCase(1), evaluationCase(2, "fallback-model")];
    const pack = buildBlindReviewerPack(dataset(cases));
    expect(pack.cases.map((item) => item.id)).toEqual(["10000000-0000-4000-8000-000000000001"]);
    const includingInvalid = buildBlindReviewerPack(dataset(cases), { onlyValidPairs: false });
    expect(includingInvalid.cases).toHaveLength(2);
  });
});

describe("Evaluation file parsing", () => {
  it("round-trips a blind reviewer pack", () => {
    const pack = buildBlindReviewerPack(dataset());
    expect(parseBlindReviewerPackFile(JSON.parse(JSON.stringify(pack)) as unknown)).toEqual(pack);
  });

  it("rejects the wrong file kind, so an answer key cannot be imported as a pack", () => {
    const answerKey = buildOperatorAnswerKey({ dataset: dataset(), reviews: [], failedCalls: [], provenance: null });
    expect(() => parseBlindReviewerPackFile(JSON.parse(JSON.stringify(answerKey)) as unknown))
      .toThrow(ResearchIntelligenceEvalFileError);
    expect(() => parseBlindReviewerPackFile({ kind: RESEARCH_INTELLIGENCE_FILE_KINDS.operatorAnswerKey, version: 2 }))
      .toThrow(/文件类型不匹配/);
  });

  it("rejects outdated file versions", () => {
    const pack = buildBlindReviewerPack(dataset());
    expect(() => parseBlindReviewerPackFile({ ...JSON.parse(JSON.stringify(pack)), version: 1 }))
      .toThrow(/文件版本不兼容/);
    const answerKey = buildOperatorAnswerKey({ dataset: dataset(), reviews: [], failedCalls: [], provenance: null });
    expect(() => parseOperatorAnswerKeyFile({ ...JSON.parse(JSON.stringify(answerKey)), version: 1 }))
      .toThrow(/文件版本不兼容/);
  });

  it("rejects tampered pack payloads with unexpected fields", () => {
    const pack = JSON.parse(JSON.stringify(buildBlindReviewerPack(dataset()))) as Record<string, unknown>;
    const firstCase = pack.cases as Array<Record<string, unknown>>;
    firstCase[0].candidateA = { ...(firstCase[0].candidateA as Record<string, unknown>), strategy: "treatment marker" };
    expect(() => parseBlindReviewerPackFile(pack)).toThrow(ResearchIntelligenceEvalFileError);
  });

  it("rejects files with duplicate case ids", () => {
    const pack = JSON.parse(JSON.stringify(buildBlindReviewerPack(dataset()))) as Record<string, unknown>;
    const cases = pack.cases as Array<Record<string, unknown>>;
    cases[1].id = cases[0].id;
    expect(() => parseBlindReviewerPackFile(pack)).toThrow(/重复的 case ID/);

    const answerKey = JSON.parse(JSON.stringify(
      buildOperatorAnswerKey({ dataset: dataset(), reviews: [], failedCalls: [], provenance: null })
    )) as { dataset: { cases: Array<Record<string, unknown>> } };
    answerKey.dataset.cases[1].id = answerKey.dataset.cases[0].id;
    expect(() => parseOperatorAnswerKeyFile(answerKey)).toThrow(/重复的 case ID/);

    const checkpoint = JSON.parse(JSON.stringify(
      buildOperatorCheckpoint({ dataset: dataset(), reviews: [], failedCalls: [], provenance: null, savedAt: "2026-08-17T02:00:00.000Z" })
    )) as { dataset: { cases: Array<Record<string, unknown>> } };
    checkpoint.dataset.cases[1].id = checkpoint.dataset.cases[0].id;
    expect(() => parseOperatorCheckpointFile(checkpoint)).toThrow(/重复的 case ID/);
  });

  it("rejects review result packs with duplicate case + reviewer scores", () => {
    const pack = buildBlindReviewerPack(dataset());
    const result = buildReviewResultPack(pack.packId, [review, { ...review, reviewedAt: "2026-08-17T02:00:00.000Z" }]);
    expect(result.reviews).toHaveLength(1);
    const duplicated = {
      kind: RESEARCH_INTELLIGENCE_FILE_KINDS.reviewResultPack,
      version: 2,
      packId: pack.packId,
      reviews: [review, review]
    };
    expect(() => parseReviewResultPackFile(duplicated)).toThrow(/重复评分/);
  });

  it("round-trips operator answer keys and checkpoints with full answers", () => {
    const provenance = {
      testCommand: "npm test -- research-intelligence",
      executedAt: "2026-08-17T02:00:00.000Z",
      workspaceFingerprint: "abc123def456",
      automatedTestsPassed: true
    };
    const answerKey = buildOperatorAnswerKey({ dataset: dataset(), reviews: [review], failedCalls: [], provenance });
    const parsedKey = parseOperatorAnswerKeyFile(JSON.parse(JSON.stringify(answerKey)) as unknown);
    expect(parsedKey.dataset.cases[0].control).toBeDefined();
    expect(parsedKey.dataset.blindSeed).toBe("stable-blind-seed");
    expect(parsedKey.provenance?.automatedTestsPassed).toBe(true);

    const checkpoint = buildOperatorCheckpoint({ dataset: dataset(), reviews: [review], failedCalls: [], provenance, savedAt: "2026-08-17T02:00:00.000Z" });
    const parsedCheckpoint = parseOperatorCheckpointFile(JSON.parse(JSON.stringify(checkpoint)) as unknown);
    expect(parsedCheckpoint.savedAt).toBe("2026-08-17T02:00:00.000Z");
    expect(parsedCheckpoint.dataset.cases).toHaveLength(2);
  });
});
