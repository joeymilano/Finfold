import { z } from "zod";
import {
  goalIdSchema,
  kitOutputSchema,
  personaIdSchema,
  platformIdSchema
} from "@/lib/content-schema";
import { researchGenerationContextSchema } from "@/lib/operations/research";

export const RESEARCH_INTELLIGENCE_EVAL_VERSION = 2 as const;

export const researchIntelligenceEvalPairRequestSchema = z.object({
  missionId: z.string().uuid(),
  ideaText: z.string().trim().min(20).max(12_000).optional(),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platform: platformIdSchema,
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("zh"),
  modelTier: z.enum(["haiku", "sonnet", "opus"]).default("haiku"),
  confirmProviderSpend: z.literal(true)
}).strict();
export type ResearchIntelligenceEvalPairRequest = z.infer<typeof researchIntelligenceEvalPairRequestSchema>;

const evaluationOutputSchema = kitOutputSchema.pick({
  platform: true,
  title: true,
  body: true,
  cta: true,
  notes: true,
  strategy: true
});

/** Candidate payload visible to blind reviewers: identical constraints minus
 * the strategy hint, which would leak how each arm was constructed. Strict so
 * tampered pack files cannot smuggle extra revealing fields back in. */
export const blindedCandidateOutputSchema = evaluationOutputSchema.omit({ strategy: true }).strict();

export const researchIntelligenceEvalBriefSchema = z.object({
  ideaText: z.string().min(20).max(12_000),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platform: platformIdSchema,
  language: z.enum(["auto", "zh", "en", "bilingual"])
}).strict();

export const modelAttemptSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable()
});
export type ResearchIntelligenceModelAttempt = z.infer<typeof modelAttemptSchema>;

const generationEvidenceSchema = z.object({
  modelTier: z.enum(["haiku", "sonnet", "opus"]),
  durationMs: z.number().int().nonnegative(),
  attempts: z.array(modelAttemptSchema).max(12),
  estimatedCostUsd: z.number().nonnegative().nullable()
});

export const researchIntelligencePairInvalidReasons = [
  "model_tier_mismatch",
  "final_provider_model_mismatch",
  "prompt_version_mismatch",
  "missing_attempt_audit"
] as const;

export const researchIntelligencePairValiditySchema = z.object({
  status: z.enum(["valid", "invalid"]),
  reasons: z.array(z.enum(researchIntelligencePairInvalidReasons)).max(4)
}).strict();
export type ResearchIntelligencePairValidity = z.infer<typeof researchIntelligencePairValiditySchema>;

/**
 * A control/treatment pair only counts as a valid sample when the model setup
 * is identical on both sides, so the only experimental variable is the
 * intelligence context. Provider failovers that leave the two arms on
 * different final models invalidate the pair: the cost is still recorded but
 * the pair must not enter the 30-case effective sample.
 */
export function evaluateResearchIntelligencePairValidity(evaluationCase: {
  control: { generation: z.infer<typeof generationEvidenceSchema> };
  treatment: { generation: z.infer<typeof generationEvidenceSchema> };
}): ResearchIntelligencePairValidity {
  const reasons: z.infer<typeof researchIntelligencePairValiditySchema>["reasons"] = [];
  const { control, treatment } = evaluationCase;
  if (control.generation.modelTier !== treatment.generation.modelTier) {
    reasons.push("model_tier_mismatch");
  }
  const finalControl = control.generation.attempts.at(-1);
  const finalTreatment = treatment.generation.attempts.at(-1);
  if (!finalControl || !finalTreatment) {
    reasons.push("missing_attempt_audit");
  } else {
    if (finalControl.provider !== finalTreatment.provider || finalControl.model !== finalTreatment.model) {
      reasons.push("final_provider_model_mismatch");
    }
    const promptVersions = new Set([
      ...control.generation.attempts.map((attempt) => attempt.promptVersion),
      ...treatment.generation.attempts.map((attempt) => attempt.promptVersion)
    ]);
    if (promptVersions.size > 1) {
      reasons.push("prompt_version_mismatch");
    }
  }
  return { status: reasons.length === 0 ? "valid" : "invalid", reasons };
}

export const researchIntelligenceEvalCaseSchema = z.object({
  id: z.string().uuid(),
  missionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  brief: researchIntelligenceEvalBriefSchema,
  intelligenceContext: researchGenerationContextSchema,
  control: z.object({
    output: evaluationOutputSchema,
    generation: generationEvidenceSchema
  }),
  treatment: z.object({
    output: evaluationOutputSchema,
    generation: generationEvidenceSchema
  }),
  pairValidity: researchIntelligencePairValiditySchema.optional()
}).strict();
export type ResearchIntelligenceEvalCase = z.infer<typeof researchIntelligenceEvalCaseSchema>;

export const researchIntelligenceEvalDatasetSchema = z.object({
  version: z.literal(RESEARCH_INTELLIGENCE_EVAL_VERSION),
  title: z.string().trim().min(1).max(160),
  blindSeed: z.string().min(8).max(128),
  createdAt: z.string().datetime(),
  cases: z.array(researchIntelligenceEvalCaseSchema).max(100)
}).strict();
export type ResearchIntelligenceEvalDataset = z.infer<typeof researchIntelligenceEvalDatasetSchema>;

const candidateScoreSchema = z.object({
  topicFit: z.number().int().min(1).max(5),
  marketSpecificity: z.number().int().min(1).max(5),
  actionability: z.number().int().min(1).max(5),
  firstDraftUsable: z.boolean(),
  hallucinatedClaim: z.boolean(),
  sourceCopying: z.boolean()
});
export type ResearchIntelligenceCandidateScore = z.infer<typeof candidateScoreSchema>;

export const researchIntelligenceEvalReviewSchema = z.object({
  caseId: z.string().uuid(),
  reviewerId: z.string().trim().min(1).max(80),
  preferredForTopic: z.enum(["A", "B", "tie"]),
  overallPreference: z.enum(["A", "B", "tie"]),
  candidateA: candidateScoreSchema,
  candidateB: candidateScoreSchema,
  notes: z.string().trim().max(2000).optional(),
  reviewedAt: z.string().datetime()
}).strict();
export type ResearchIntelligenceEvalReview = z.infer<typeof researchIntelligenceEvalReviewSchema>;

export const researchIntelligenceExperimentProvenanceSchema = z.object({
  testCommand: z.string().trim().min(3).max(500),
  executedAt: z.string().datetime(),
  workspaceFingerprint: z.string().trim().min(4).max(200),
  automatedTestsPassed: z.boolean(),
  notes: z.string().trim().max(2000).optional()
}).strict();
export type ResearchIntelligenceExperimentProvenance = z.infer<typeof researchIntelligenceExperimentProvenanceSchema>;

export const researchIntelligenceFailedCallSchema = z.object({
  occurredAt: z.string().datetime(),
  missionId: z.string().uuid(),
  stage: z.string().trim().min(1).max(80),
  error: z.string().trim().min(1).max(2000),
  attempts: z.array(modelAttemptSchema).max(12),
  estimatedCostUsd: z.number().nonnegative().nullable()
}).strict();
export type ResearchIntelligenceFailedCall = z.infer<typeof researchIntelligenceFailedCallSchema>;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type BlindedResearchIntelligenceCase = {
  id: string;
  brief: ResearchIntelligenceEvalCase["brief"];
  candidateA: ResearchIntelligenceEvalCase["control"]["output"];
  candidateB: ResearchIntelligenceEvalCase["control"]["output"];
};

export function blindResearchIntelligenceCase(
  evaluationCase: ResearchIntelligenceEvalCase,
  blindSeed: string
): BlindedResearchIntelligenceCase {
  const treatmentIsA = stableHash(`${blindSeed}:${evaluationCase.id}`) % 2 === 0;
  return {
    id: evaluationCase.id,
    brief: evaluationCase.brief,
    candidateA: treatmentIsA ? evaluationCase.treatment.output : evaluationCase.control.output,
    candidateB: treatmentIsA ? evaluationCase.control.output : evaluationCase.treatment.output
  };
}

function armForCandidate(
  evaluationCase: ResearchIntelligenceEvalCase,
  blindSeed: string,
  candidate: "A" | "B"
): "control" | "treatment" {
  const treatmentIsA = stableHash(`${blindSeed}:${evaluationCase.id}`) % 2 === 0;
  return candidate === "A"
    ? treatmentIsA ? "treatment" : "control"
    : treatmentIsA ? "control" : "treatment";
}

/**
 * Irreversible identifier linking a blind reviewer pack (and the result packs
 * produced from it) back to the operator dataset that generated it, without
 * exposing the blind seed or any arm mapping.
 */
export function deriveBlindReviewerPackId(blindSeed: string, title: string): string {
  return `rie-${stableHash(`pack::${blindSeed}::${title}`).toString(16).padStart(8, "0")}`;
}

export type ResearchIntelligenceEvalGate = {
  key: string;
  label: string;
  passed: boolean;
  actual: string;
  target: string;
};

export type ConfidenceInterval = { lower: number; upper: number };

export type ResearchIntelligenceEvalSummary = {
  validPairs: number;
  invalidPairs: number;
  invalidPairReasons: string[];
  completedCases: number;
  reviewCount: number;
  distinctMissions: number;
  maximumCasesPerMission: number;
  topicWinShare: number | null;
  topicWinShareCi: ConfidenceInterval | null;
  topicCounts: { treatmentWins: number; controlWins: number; ties: number };
  marketSpecificityActionabilityLift: number | null;
  marketLiftCi: ConfidenceInterval | null;
  firstDraftUsableLiftPoints: number | null;
  firstDraftLiftCi: ConfidenceInterval | null;
  controlHallucinationRate: number | null;
  treatmentHallucinationRate: number | null;
  treatmentCopyingCases: number;
  controlEstimatedCostUsd: number | null;
  treatmentEstimatedCostUsd: number | null;
  failedCallCount: number;
  failedCallEstimatedCostUsd: number | null;
  controlAverageDurationMs: number | null;
  treatmentAverageDurationMs: number | null;
  gates: ResearchIntelligenceEvalGate[];
  passed: boolean;
  verdict: "p0-pilot-passed" | "expand-to-60-cases" | "not-passed";
  verdictNote: string;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanWithConfidenceInterval(values: number[]): {
  mean: number | null;
  ci: ConfidenceInterval | null;
} {
  const mean = average(values);
  if (mean == null) return { mean: null, ci: null };
  if (values.length < 2) return { mean, ci: null };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const halfWidth = 1.96 * Math.sqrt(variance) / Math.sqrt(values.length);
  return { mean, ci: { lower: mean - halfWidth, upper: mean + halfWidth } };
}

function formatPercent(value: number | null): string {
  return value == null ? "待评估" : `${(value * 100).toFixed(1)}%`;
}

function formatPercentWithCi(value: number | null, ci: ConfidenceInterval | null): string {
  if (value == null) return "待评估";
  return ci == null
    ? `${(value * 100).toFixed(1)}%（样本不足，无置信区间）`
    : `${(value * 100).toFixed(1)}%（95% CI ${(ci.lower * 100).toFixed(1)}%–${(ci.upper * 100).toFixed(1)}%）`;
}

function formatPointsWithCi(value: number | null, ci: ConfidenceInterval | null): string {
  if (value == null) return "待评估";
  return ci == null
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)} pp（样本不足，无置信区间）`
    : `${value >= 0 ? "+" : ""}${value.toFixed(1)} pp（95% CI ${ci.lower.toFixed(1)}–${ci.upper.toFixed(1)} pp）`;
}

/**
 * Keeps only the newest effective score per caseId + reviewerId. Duplicate or
 * superseded scores from the same reviewer must never change a case's weight.
 */
export function dedupeResearchIntelligenceReviews(
  reviewInputs: ResearchIntelligenceEvalReview[]
): ResearchIntelligenceEvalReview[] {
  const byKey = new Map<string, ResearchIntelligenceEvalReview>();
  for (const review of reviewInputs) {
    const key = `${review.caseId}::${review.reviewerId}`;
    const existing = byKey.get(key);
    if (!existing || review.reviewedAt >= existing.reviewedAt) {
      byKey.set(key, review);
    }
  }
  return [...byKey.values()];
}

export function summarizeResearchIntelligenceEval(
  datasetInput: ResearchIntelligenceEvalDataset,
  reviewInputs: ResearchIntelligenceEvalReview[],
  options: {
    provenance?: ResearchIntelligenceExperimentProvenance | null;
    failedCalls?: ResearchIntelligenceFailedCall[];
  } = {}
): ResearchIntelligenceEvalSummary {
  const dataset = researchIntelligenceEvalDatasetSchema.parse(datasetInput);
  const cases = new Map(dataset.cases.map((evaluationCase) => [evaluationCase.id, evaluationCase]));
  const failedCalls = options.failedCalls ?? [];

  // Pairs whose two arms are not comparable stay out of the effective sample
  // but their cost is still reported.
  const validCases = dataset.cases.filter((evaluationCase) =>
    (evaluationCase.pairValidity ?? evaluateResearchIntelligencePairValidity(evaluationCase)).status === "valid"
  );
  const invalidPairCases = dataset.cases.filter((evaluationCase) =>
    (evaluationCase.pairValidity ?? evaluateResearchIntelligencePairValidity(evaluationCase)).status === "invalid"
  );
  const invalidPairReasons = [...new Set(invalidPairCases.flatMap((evaluationCase) =>
    (evaluationCase.pairValidity ?? evaluateResearchIntelligencePairValidity(evaluationCase)).reasons
  ))];
  const validCaseIds = new Set(validCases.map((evaluationCase) => evaluationCase.id));

  const reviews = dedupeResearchIntelligenceReviews(
    reviewInputs
      .map((review) => researchIntelligenceEvalReviewSchema.parse(review))
      .filter((review) => validCaseIds.has(review.caseId))
  );

  const missionCounts = new Map<string, number>();
  for (const evaluationCase of validCases) {
    missionCounts.set(
      evaluationCase.missionId,
      (missionCounts.get(evaluationCase.missionId) ?? 0) + 1
    );
  }
  const distinctMissions = missionCounts.size;
  const maximumCasesPerMission = Math.max(0, ...missionCounts.values());

  // Aggregate inside each case first, then let every completed case carry
  // equal weight, regardless of how many reviewers scored it.
  const reviewsByCase = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const bucket = reviewsByCase.get(review.caseId) ?? [];
    bucket.push(review);
    reviewsByCase.set(review.caseId, bucket);
  }

  const topicCounts = { treatmentWins: 0, controlWins: 0, ties: 0 };
  const caseTopicShares: number[] = [];
  const caseMarketDiffs: number[] = [];
  const caseControlMarketScores: number[] = [];
  const caseUsableDiffs: number[] = [];
  const caseControlHallucinations: number[] = [];
  const caseTreatmentHallucinations: number[] = [];
  let treatmentCopyingCases = 0;

  for (const [caseId, caseReviews] of reviewsByCase) {
    const evaluationCase = cases.get(caseId)!;
    const topicValues: number[] = [];
    const marketDiffs: number[] = [];
    const controlMarketScores: number[] = [];
    const usableDiffs: number[] = [];
    const controlHallucinations: boolean[] = [];
    const treatmentHallucinations: boolean[] = [];
    let treatmentCopying = false;

    for (const review of caseReviews) {
      const aArm = armForCandidate(evaluationCase, dataset.blindSeed, "A");
      const topicArm = review.preferredForTopic === "tie"
        ? "tie"
        : armForCandidate(evaluationCase, dataset.blindSeed, review.preferredForTopic);
      if (topicArm === "treatment") {
        topicCounts.treatmentWins += 1;
        topicValues.push(1);
      } else if (topicArm === "control") {
        topicCounts.controlWins += 1;
        topicValues.push(0);
      } else {
        topicCounts.ties += 1;
        topicValues.push(0.5);
      }
      const scores = {
        control: aArm === "control" ? review.candidateA : review.candidateB,
        treatment: aArm === "treatment" ? review.candidateA : review.candidateB
      };
      marketDiffs.push(
        (scores.treatment.marketSpecificity + scores.treatment.actionability) / 2
        - (scores.control.marketSpecificity + scores.control.actionability) / 2
      );
      controlMarketScores.push((scores.control.marketSpecificity + scores.control.actionability) / 2);
      usableDiffs.push(
        (scores.treatment.firstDraftUsable ? 1 : 0) - (scores.control.firstDraftUsable ? 1 : 0)
      );
      controlHallucinations.push(scores.control.hallucinatedClaim);
      treatmentHallucinations.push(scores.treatment.hallucinatedClaim);
      if (scores.treatment.sourceCopying) treatmentCopying = true;
    }

    caseTopicShares.push(average(topicValues)!);
    caseMarketDiffs.push(average(marketDiffs)!);
    caseControlMarketScores.push(average(controlMarketScores)!);
    caseUsableDiffs.push(average(usableDiffs)!);
    caseControlHallucinations.push(average(controlHallucinations.map((value) => value ? 1 : 0))!);
    caseTreatmentHallucinations.push(average(treatmentHallucinations.map((value) => value ? 1 : 0))!);
    if (treatmentCopying) treatmentCopyingCases += 1;
  }

  const completedCases = reviewsByCase.size;
  const topicStats = meanWithConfidenceInterval(caseTopicShares);
  const topicWinShare = topicStats.mean;
  const topicWinShareCi = topicStats.ci;

  const controlMarketMean = average(caseControlMarketScores);
  const marketLiftStats = meanWithConfidenceInterval(caseMarketDiffs);
  const marketSpecificityActionabilityLift = controlMarketMean != null && controlMarketMean > 0 && marketLiftStats.mean != null
    ? marketLiftStats.mean / controlMarketMean
    : null;
  const marketLiftCi = marketLiftStats.ci != null && controlMarketMean != null && controlMarketMean > 0
    ? {
        lower: marketLiftStats.ci.lower / controlMarketMean,
        upper: marketLiftStats.ci.upper / controlMarketMean
      }
    : null;

  const usableStats = meanWithConfidenceInterval(caseUsableDiffs);
  const firstDraftUsableLiftPoints = usableStats.mean == null ? null : usableStats.mean * 100;
  const firstDraftLiftCi = usableStats.ci == null
    ? null
    : { lower: usableStats.ci.lower * 100, upper: usableStats.ci.upper * 100 };

  const controlHallucinationRate = average(caseControlHallucinations);
  const treatmentHallucinationRate = average(caseTreatmentHallucinations);

  const controlCosts = dataset.cases
    .map((item) => item.control.generation.estimatedCostUsd)
    .filter((value): value is number => value != null);
  const treatmentCosts = dataset.cases
    .map((item) => item.treatment.generation.estimatedCostUsd)
    .filter((value): value is number => value != null);
  const controlEstimatedCostUsd = controlCosts.length > 0
    ? controlCosts.reduce((sum, value) => sum + value, 0)
    : null;
  const treatmentEstimatedCostUsd = treatmentCosts.length > 0
    ? treatmentCosts.reduce((sum, value) => sum + value, 0)
    : null;
  const failedCosts = failedCalls
    .map((call) => call.estimatedCostUsd)
    .filter((value): value is number => value != null);
  const failedCallEstimatedCostUsd = failedCosts.length > 0
    ? failedCosts.reduce((sum, value) => sum + value, 0)
    : null;
  const controlAverageDurationMs = average(dataset.cases.map((item) => item.control.generation.durationMs));
  const treatmentAverageDurationMs = average(dataset.cases.map((item) => item.treatment.generation.durationMs));

  const provenance = options.provenance ?? null;
  const provenanceComplete = provenance != null
    && provenance.automatedTestsPassed
    && provenance.testCommand.length > 0
    && provenance.workspaceFingerprint.length > 0;

  const topicPointPasses = topicWinShare != null && topicWinShare >= 0.6;
  const topicCiPasses = topicWinShareCi != null && topicWinShareCi.lower >= 0.6;
  const marketPointPasses = marketSpecificityActionabilityLift != null
    && Number.isFinite(marketSpecificityActionabilityLift)
    && marketSpecificityActionabilityLift >= 0.15;
  const marketCiPasses = marketLiftCi != null && marketLiftCi.lower >= 0.15;
  const firstDraftPointPasses = firstDraftUsableLiftPoints != null && firstDraftUsableLiftPoints >= 10;
  const firstDraftCiPasses = firstDraftLiftCi != null && firstDraftLiftCi.lower >= 10;

  const gates: ResearchIntelligenceEvalGate[] = [
    {
      key: "sample_size",
      label: "有效盲测样本",
      passed: completedCases >= 30,
      actual: `${completedCases}（有效配对 ${validCases.length}，无效配对 ${invalidPairCases.length}）`,
      target: "≥ 30 组有效配对且已完成盲评"
    },
    {
      key: "sample_coverage",
      label: "样本任务覆盖",
      passed: distinctMissions >= 10 && maximumCasesPerMission <= 3,
      actual: `${distinctMissions} 个任务；单任务最多 ${maximumCasesPerMission} 组`,
      target: "≥ 10 个任务；每任务 ≤ 3 组"
    },
    {
      key: "pair_comparability",
      label: "配对可比性",
      passed: validCases.length > 0 && invalidPairCases.length === 0,
      actual: validCases.length === 0 && invalidPairCases.length === 0
        ? "尚无样本"
        : invalidPairCases.length === 0
          ? "全部配对模型设置一致"
          : `${invalidPairCases.length} 组无效（${invalidPairReasons.join(", ")}）；已计成本但不计入有效样本`,
      target: "无效配对 0（两侧模型/版本不一致计入成本）"
    },
    {
      key: "topic_fit",
      label: "选题/用户问题贴合胜率",
      passed: topicPointPasses && topicCiPasses,
      actual: `${formatPercentWithCi(topicWinShare, topicWinShareCi)}；胜 ${topicCounts.treatmentWins} / 负 ${topicCounts.controlWins} / 平 ${topicCounts.ties}`,
      target: "≥ 60% 且 95% CI 下限 ≥ 60%（持平计 0.5，分母为全部已完成 case）"
    },
    {
      key: "specificity_actionability",
      label: "市场具体性与可执行性提升",
      passed: marketPointPasses && marketCiPasses,
      actual: formatPercentWithCi(marketSpecificityActionabilityLift, marketLiftCi),
      target: "≥ 15% 且 95% CI 下限 ≥ 15%"
    },
    {
      key: "first_draft",
      label: "首稿可用率提升",
      passed: firstDraftPointPasses && firstDraftCiPasses,
      actual: formatPointsWithCi(firstDraftUsableLiftPoints, firstDraftLiftCi),
      target: "≥ +10 pp 且 95% CI 下限 ≥ +10 pp"
    },
    {
      key: "hallucination",
      label: "事实幻觉率不升高",
      passed: controlHallucinationRate != null && treatmentHallucinationRate != null && treatmentHallucinationRate <= controlHallucinationRate,
      actual: `${formatPercent(treatmentHallucinationRate)} vs ${formatPercent(controlHallucinationRate)}`,
      target: "实验组 ≤ 控制组"
    },
    {
      key: "copying",
      label: "实验组严重来源复述",
      passed: reviews.length > 0 && treatmentCopyingCases === 0,
      actual: `${treatmentCopyingCases} 个 case`,
      target: "0"
    },
    {
      key: "test_provenance",
      label: "测试溯源已登记",
      passed: provenance != null,
      actual: provenance == null
        ? "未登记"
        : `${provenance.testCommand} @ ${provenance.executedAt}`,
      target: "记录测试命令、执行时间与工作区指纹"
    },
    {
      key: "tenant_boundary",
      label: "跨租户自动化测试",
      passed: provenanceComplete,
      actual: provenanceComplete
        ? "通过（见测试溯源）"
        : provenance == null
          ? "未登记测试溯源"
          : "登记的自动化测试未通过或不完整",
      target: "自动化测试通过，不接受手动勾选"
    }
  ];

  const passed = gates.every((gate) => gate.passed);
  const pointPassesButCiInsufficient = (topicPointPasses && !topicCiPasses)
    || (marketPointPasses && !marketCiPasses)
    || (firstDraftPointPasses && !firstDraftCiPasses);
  let verdict: ResearchIntelligenceEvalSummary["verdict"] = "not-passed";
  let verdictNote = "存在未达标的放行门槛；不得据此放行自动数据源试点。";
  if (passed) {
    verdict = "p0-pilot-passed";
    verdictNote = "P0 pilot passed：仅代表本次 30 组试点达标，不得表述为已证明跨平台普遍有效；正式结论仍需扩大样本复核。";
  } else if (pointPassesButCiInsufficient) {
    verdict = "expand-to-60-cases";
    verdictNote = "点估计达到或接近阈值，但置信区间过宽或覆盖阈值；扩大到 60 组后再判定，不得强行放行。";
  }

  return {
    validPairs: validCases.length,
    invalidPairs: invalidPairCases.length,
    invalidPairReasons,
    completedCases,
    reviewCount: reviews.length,
    distinctMissions,
    maximumCasesPerMission,
    topicWinShare,
    topicWinShareCi,
    topicCounts,
    marketSpecificityActionabilityLift,
    marketLiftCi,
    firstDraftUsableLiftPoints,
    firstDraftLiftCi,
    controlHallucinationRate,
    treatmentHallucinationRate,
    treatmentCopyingCases,
    controlEstimatedCostUsd,
    treatmentEstimatedCostUsd,
    failedCallCount: failedCalls.length,
    failedCallEstimatedCostUsd,
    controlAverageDurationMs,
    treatmentAverageDurationMs,
    gates,
    passed,
    verdict,
    verdictNote
  };
}
