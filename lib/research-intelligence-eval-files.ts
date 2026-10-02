import { z } from "zod";
import {
  RESEARCH_INTELLIGENCE_EVAL_VERSION,
  blindedCandidateOutputSchema,
  blindResearchIntelligenceCase,
  deriveBlindReviewerPackId,
  evaluateResearchIntelligencePairValidity,
  researchIntelligenceEvalBriefSchema,
  researchIntelligenceEvalDatasetSchema,
  researchIntelligenceEvalReviewSchema,
  researchIntelligenceExperimentProvenanceSchema,
  researchIntelligenceFailedCallSchema,
  type ResearchIntelligenceEvalDataset,
  type ResearchIntelligenceEvalReview,
  type ResearchIntelligenceExperimentProvenance,
  type ResearchIntelligenceFailedCall
} from "@/lib/research-intelligence-eval";

export const RESEARCH_INTELLIGENCE_FILE_KINDS = {
  operatorAnswerKey: "finfold-research-intelligence-operator-answer-key",
  blindReviewerPack: "finfold-research-intelligence-blind-reviewer-pack",
  reviewResultPack: "finfold-research-intelligence-review-result-pack",
  operatorCheckpoint: "finfold-research-intelligence-operator-checkpoint"
} as const;

/**
 * Shared review briefing shown to every reviewer. Deliberately generic: it
 * must not hint at which candidate used research intelligence, model
 * differences, or generation order.
 */
export const BLIND_REVIEWER_GUIDANCE = [
  "每个 case 的两个候选来自同一份创作 brief，使用相同的评分标准独立评分。",
  "请不要猜测哪个候选使用了研究情报；如果无法区分，请选择“持平”，不要勉强二选一。",
  "按选题/用户问题贴合度、市场具体性、可执行性分别打 1–5 分，并标注是否存在无来源事实或明显来源复述。"
].join("\n");

export const blindReviewerCaseSchema = z.object({
  id: z.string().uuid(),
  brief: researchIntelligenceEvalBriefSchema,
  candidateA: blindedCandidateOutputSchema,
  candidateB: blindedCandidateOutputSchema
}).strict();
export type BlindReviewerCase = z.infer<typeof blindReviewerCaseSchema>;

export const blindReviewerPackSchema = z.object({
  kind: z.literal(RESEARCH_INTELLIGENCE_FILE_KINDS.blindReviewerPack),
  version: z.literal(RESEARCH_INTELLIGENCE_EVAL_VERSION),
  packId: z.string().regex(/^rie-[0-9a-f]{8}$/),
  title: z.string().trim().min(1).max(160),
  createdAt: z.string().datetime(),
  reviewGuidance: z.string().min(1),
  cases: z.array(blindReviewerCaseSchema).max(100)
}).strict();
export type BlindReviewerPack = z.infer<typeof blindReviewerPackSchema>;

export const reviewResultPackSchema = z.object({
  kind: z.literal(RESEARCH_INTELLIGENCE_FILE_KINDS.reviewResultPack),
  version: z.literal(RESEARCH_INTELLIGENCE_EVAL_VERSION),
  packId: z.string().regex(/^rie-[0-9a-f]{8}$/),
  reviews: z.array(researchIntelligenceEvalReviewSchema).max(600)
}).strict();
export type ReviewResultPack = z.infer<typeof reviewResultPackSchema>;

export const operatorAnswerKeySchema = z.object({
  kind: z.literal(RESEARCH_INTELLIGENCE_FILE_KINDS.operatorAnswerKey),
  version: z.literal(RESEARCH_INTELLIGENCE_EVAL_VERSION),
  dataset: researchIntelligenceEvalDatasetSchema,
  reviews: z.array(researchIntelligenceEvalReviewSchema).max(600).default([]),
  failedCalls: z.array(researchIntelligenceFailedCallSchema).max(200).default([]),
  provenance: researchIntelligenceExperimentProvenanceSchema.nullish()
}).strict();
export type OperatorAnswerKey = z.infer<typeof operatorAnswerKeySchema>;

export const operatorCheckpointSchema = z.object({
  kind: z.literal(RESEARCH_INTELLIGENCE_FILE_KINDS.operatorCheckpoint),
  version: z.literal(RESEARCH_INTELLIGENCE_EVAL_VERSION),
  savedAt: z.string().datetime(),
  dataset: researchIntelligenceEvalDatasetSchema,
  reviews: z.array(researchIntelligenceEvalReviewSchema).max(600).default([]),
  failedCalls: z.array(researchIntelligenceFailedCallSchema).max(200).default([]),
  provenance: researchIntelligenceExperimentProvenanceSchema.nullish()
}).strict();
export type OperatorCheckpoint = z.infer<typeof operatorCheckpointSchema>;

export class ResearchIntelligenceEvalFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchIntelligenceEvalFileError";
  }
}

function requireObjectFile(json: unknown, expectedKind: string): Record<string, unknown> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new ResearchIntelligenceEvalFileError("文件必须是 JSON 对象。");
  }
  const record = json as Record<string, unknown>;
  if (record.version !== RESEARCH_INTELLIGENCE_EVAL_VERSION) {
    throw new ResearchIntelligenceEvalFileError(
      `文件版本不兼容：需要版本 ${RESEARCH_INTELLIGENCE_EVAL_VERSION}，实际为 ${String(record.version)}。`
    );
  }
  if (record.kind !== expectedKind) {
    throw new ResearchIntelligenceEvalFileError(
      `文件类型不匹配：需要 ${expectedKind}，实际为 ${String(record.kind)}。`
    );
  }
  return record;
}

function assertUniqueCaseIds(cases: { id: string }[]) {
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) {
      throw new ResearchIntelligenceEvalFileError(`文件中存在重复的 case ID：${item.id}。`);
    }
    seen.add(item.id);
  }
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, json: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ResearchIntelligenceEvalFileError(`${message}：${result.error.issues[0]?.message ?? "结构无效"}`);
  }
  return result.data;
}

export function parseBlindReviewerPackFile(json: unknown): BlindReviewerPack {
  requireObjectFile(json, RESEARCH_INTELLIGENCE_FILE_KINDS.blindReviewerPack);
  const pack = parseOrThrow(blindReviewerPackSchema, json, "盲评文件结构无效");
  assertUniqueCaseIds(pack.cases);
  return pack;
}

export function parseReviewResultPackFile(json: unknown): ReviewResultPack {
  requireObjectFile(json, RESEARCH_INTELLIGENCE_FILE_KINDS.reviewResultPack);
  const pack = parseOrThrow(reviewResultPackSchema, json, "评分结果文件结构无效");
  const seen = new Set<string>();
  for (const review of pack.reviews) {
    const key = `${review.caseId}::${review.reviewerId}`;
    if (seen.has(key)) {
      throw new ResearchIntelligenceEvalFileError(
        `评分结果文件中同一 case 与评审存在重复评分：${review.caseId} / ${review.reviewerId}。`
      );
    }
    seen.add(key);
  }
  return pack;
}

export function parseOperatorAnswerKeyFile(json: unknown): OperatorAnswerKey {
  requireObjectFile(json, RESEARCH_INTELLIGENCE_FILE_KINDS.operatorAnswerKey);
  const answerKey = parseOrThrow(operatorAnswerKeySchema, json, "操作者答案文件结构无效");
  assertUniqueCaseIds(answerKey.dataset.cases);
  return answerKey;
}

export function parseOperatorCheckpointFile(json: unknown): OperatorCheckpoint {
  requireObjectFile(json, RESEARCH_INTELLIGENCE_FILE_KINDS.operatorCheckpoint);
  const checkpoint = parseOrThrow(operatorCheckpointSchema, json, "检查点文件结构无效");
  assertUniqueCaseIds(checkpoint.dataset.cases);
  return checkpoint;
}

/**
 * Builds the reviewer-facing pack from an operator dataset. Only comparable
 * pairs are included — reviewers must not spend time on invalid pairs — and
 * no field that could reveal the treatment arm, the blind seed, the
 * generation order, the strategy hint, or model details is carried over.
 */
export function buildBlindReviewerPack(
  dataset: ResearchIntelligenceEvalDataset,
  options: { onlyValidPairs?: boolean } = {}
): BlindReviewerPack {
  const parsed = researchIntelligenceEvalDatasetSchema.parse(dataset);
  const onlyValidPairs = options.onlyValidPairs ?? true;
  const cases = parsed.cases
    .filter((evaluationCase) =>
      !onlyValidPairs
      || (evaluationCase.pairValidity ?? evaluateResearchIntelligencePairValidity(evaluationCase)).status === "valid"
    )
    .map((evaluationCase) => {
      const blinded = blindResearchIntelligenceCase(evaluationCase, parsed.blindSeed);
      return {
        id: blinded.id,
        brief: blinded.brief,
        candidateA: {
          platform: blinded.candidateA.platform,
          title: blinded.candidateA.title,
          body: blinded.candidateA.body,
          cta: blinded.candidateA.cta,
          notes: blinded.candidateA.notes
        },
        candidateB: {
          platform: blinded.candidateB.platform,
          title: blinded.candidateB.title,
          body: blinded.candidateB.body,
          cta: blinded.candidateB.cta,
          notes: blinded.candidateB.notes
        }
      };
    });
  assertUniqueCaseIds(cases);
  return {
    kind: RESEARCH_INTELLIGENCE_FILE_KINDS.blindReviewerPack,
    version: RESEARCH_INTELLIGENCE_EVAL_VERSION,
    packId: deriveBlindReviewerPackId(parsed.blindSeed, parsed.title),
    title: parsed.title,
    createdAt: parsed.createdAt,
    reviewGuidance: BLIND_REVIEWER_GUIDANCE,
    cases
  };
}

export function buildReviewResultPack(
  packId: string,
  reviews: ResearchIntelligenceEvalReview[]
): ReviewResultPack {
  const deduped = new Map<string, ResearchIntelligenceEvalReview>();
  for (const review of reviews) {
    const key = `${review.caseId}::${review.reviewerId}`;
    const existing = deduped.get(key);
    if (!existing || review.reviewedAt >= existing.reviewedAt) {
      deduped.set(key, review);
    }
  }
  return {
    kind: RESEARCH_INTELLIGENCE_FILE_KINDS.reviewResultPack,
    version: RESEARCH_INTELLIGENCE_EVAL_VERSION,
    packId,
    reviews: [...deduped.values()].map((review) =>
      researchIntelligenceEvalReviewSchema.parse(review)
    )
  };
}

export function buildOperatorAnswerKey(input: {
  dataset: ResearchIntelligenceEvalDataset;
  reviews: ResearchIntelligenceEvalReview[];
  failedCalls: ResearchIntelligenceFailedCall[];
  provenance?: ResearchIntelligenceExperimentProvenance | null;
}): OperatorAnswerKey {
  return operatorAnswerKeySchema.parse({
    kind: RESEARCH_INTELLIGENCE_FILE_KINDS.operatorAnswerKey,
    version: RESEARCH_INTELLIGENCE_EVAL_VERSION,
    dataset: input.dataset,
    reviews: input.reviews,
    failedCalls: input.failedCalls,
    provenance: input.provenance ?? null
  });
}

export function buildOperatorCheckpoint(input: {
  dataset: ResearchIntelligenceEvalDataset;
  reviews: ResearchIntelligenceEvalReview[];
  failedCalls: ResearchIntelligenceFailedCall[];
  provenance?: ResearchIntelligenceExperimentProvenance | null;
  savedAt: string;
}): OperatorCheckpoint {
  return operatorCheckpointSchema.parse({
    kind: RESEARCH_INTELLIGENCE_FILE_KINDS.operatorCheckpoint,
    version: RESEARCH_INTELLIGENCE_EVAL_VERSION,
    savedAt: input.savedAt,
    dataset: input.dataset,
    reviews: input.reviews,
    failedCalls: input.failedCalls,
    provenance: input.provenance ?? null
  });
}
