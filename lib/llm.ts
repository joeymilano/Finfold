import { z } from "zod";
import type { GenerateRequest, KitOutput } from "@/lib/content-schema";
import { kitOutputSchema } from "@/lib/content-schema";
import { findUnsupportedNumericClaims } from "@/lib/claim-grounding";
import { canonicalContentTitle } from "@/lib/content-title";
import {
  assessHumanWriting,
  buildHumanWritingRewritePrompt,
  HUMAN_WRITING_REWRITE_PROMPT_VERSION,
  HUMAN_WRITING_VERSION,
  normalizeHumanWritingOutput
} from "@/lib/human-writing";
import { buildGenerationPrompt } from "@/lib/prompts";
import { platforms } from "@/lib/platforms";
import type { PlatformId } from "@/lib/platforms";
import { getSharedLettaAgentId, isLettaConfigured, lettaModelForTier, sendLettaStructuredRequest } from "@/lib/letta";
import type { ModelTier } from "@/lib/payment/types";
import {
  LLMRequestError,
  resolveLLMProviders,
  withProviderFailover,
  type LLMProvider,
  type ProviderAttemptContext
} from "@/lib/llm-providers";
import {
  estimateModelCostUsd,
  logError,
  logInfo,
  logWarn,
  type TelemetryContext,
  type TokenUsage
} from "@/lib/observability";
import { readTextWithLimit } from "@/lib/safe-url";

// Model responses cross an untrusted boundary. Parse only the fields the
// generation prompt asks the provider to author, then add server-owned state.
// In particular, never let a provider inject finalBody/userEdited: finalBody is
// reserved for a real user edit and is preferred over body at publication time.
const generatedKitOutputSchema = kitOutputSchema
  .pick({
    platform: true,
    title: true,
    body: true,
    cta: true,
    notes: true,
    strategy: true,
    imagePrompt: true
  })
  .transform(
    (output): KitOutput => ({
      ...output,
      title: canonicalContentTitle(output.title),
      locked: false,
      publishStatus: "draft",
      userEdited: false
    })
  );

const llmResponseSchema = z.object({
  outputs: z.array(generatedKitOutputSchema)
});
const chatCompletionResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().min(1) }).optional()
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional()
    })
    .optional()
});
const humanWritingRevisionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1)
}).strict();

const CONTENT_GENERATION_PROMPT_VERSION = "content-kit-2026-08-05.1";
// Batches are capped at GENERATION_BATCH_SIZE platforms (2), each up to
// ~3000 Chinese characters, plus JSON structure overhead. This bound
// mainly protects DeepSeek, whose JSON mode docs warn it can emit
// whitespace indefinitely up to the token cap if not bounded.
const CONTENT_GENERATION_MAX_TOKENS = 8000;
const MAX_LLM_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_LLM_ERROR_BYTES = 16 * 1024;

const VALID_PLATFORM_IDS = new Set<string>(platforms.map((platform) => platform.id));

/** Common aliases LLMs emit instead of our canonical platform ids. */
const PLATFORM_ALIASES: Record<string, PlatformId> = {
  twitter: "x",
  "x/twitter": "x",
  "x (twitter)": "x",
  tweet: "x",
  producthunt: "product-hunt",
  product_hunt: "product-hunt",
  "product hunt": "product-hunt",
  ph: "product-hunt",
  hackernews: "hacker-news",
  hacker_news: "hacker-news",
  "hacker news": "hacker-news",
  hn: "hacker-news",
  "show hn": "hacker-news",
  indiehackers: "indie-hackers",
  indie_hackers: "indie-hackers",
  "indie hackers": "indie-hackers",
  medium: "medium-substack",
  substack: "medium-substack",
  "medium/substack": "medium-substack",
  medium_substack: "medium-substack",
  weixin: "wechat",
  "wechat official": "wechat",
  "wechat-official": "wechat",
  rednote: "xiaohongshu",
  red: "xiaohongshu",
  xhs: "xiaohongshu",
  "little red book": "xiaohongshu",
  zhihu: "zhihu",
  知乎: "zhihu",
  "wechat moments": "moments",
  "wechat-moments": "moments",
  friends: "moments",
  pengyouquan: "moments",
  ig: "instagram",
  insta: "instagram",
  "ig reel": "instagram",
  fb: "facebook"
};

/**
 * Map a model-emitted platform string onto a canonical PlatformId.
 * Returns null when no confident match exists (so the caller can drop it).
 */
function normalizePlatformId(raw: unknown): PlatformId | null {
  if (typeof raw !== "string") {
    return null;
  }
  const key = raw.trim().toLowerCase();
  if (VALID_PLATFORM_IDS.has(key)) {
    return key as PlatformId;
  }
  if (PLATFORM_ALIASES[key]) {
    return PLATFORM_ALIASES[key];
  }
  // Collapse separators/spaces (e.g. "product hunt" -> "product-hunt").
  const dashed = key.replace(/[\s_]+/g, "-");
  if (VALID_PLATFORM_IDS.has(dashed)) {
    return dashed as PlatformId;
  }
  if (PLATFORM_ALIASES[dashed]) {
    return PLATFORM_ALIASES[dashed];
  }
  return null;
}

/**
 * Rewrite each output's `platform` field to a canonical id BEFORE strict
 * schema validation, so aliases like "twitter" don't cause the whole
 * response to be rejected by the enum.
 */
function normalizeOutputPlatforms(parsedJson: unknown): unknown {
  if (
    parsedJson &&
    typeof parsedJson === "object" &&
    Array.isArray((parsedJson as { outputs?: unknown }).outputs)
  ) {
    for (const output of (parsedJson as { outputs: unknown[] }).outputs) {
      if (output && typeof output === "object" && "platform" in output) {
        const normalized = normalizePlatformId((output as { platform: unknown }).platform);
        if (normalized) {
          (output as { platform: string }).platform = normalized;
        }
      }
    }
  }
  return parsedJson;
}

/**
 * Is at least one real OpenAI-compatible /chat/completions endpoint
 * configured (via LLM_PROVIDERS or the legacy single LLM_API_BASE/KEY)?
 *
 * IMPORTANT: Letta has NO agent-less chat-completions endpoint, so a base
 * URL pointing at api.letta.com is NOT a usable direct-LLM target — calling
 * it returns `429 {"reasons":["agent-not-found"]}`. Providers pointing at
 * Letta are filtered out of the chain everywhere (see usableProviders()).
 */
export function hasDirectLLM(): boolean {
  return usableProviders().length > 0;
}

/** The provider chain, with any provider pointed at Letta filtered out —
 * see hasDirectLLM's doc comment for why that target is never usable here. */
function usableProviders(): LLMProvider[] {
  return resolveLLMProviders().filter((provider) => !provider.apiBase.includes("letta.com"));
}

/** Fires as soon as each individual platform output is ready, so callers can
 * stream results to the client instead of waiting for the full kit. */
export type OutputCallback = (
  output: KitOutput
) => KitOutput | void | Promise<KitOutput | void>;

export type ModelAttemptAudit = {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

export type ModelAttemptCallback = (
  audit: ModelAttemptAudit
) => Promise<void>;

export type GenerateOptions = {
  lettaAgentId?: string;
  onOutput?: OutputCallback;
  /** Disable every persistent Letta-agent fallback for untrusted external
   * content. Direct provider generation remains available. Defaults to true
   * for existing first-party callers. */
  allowPersistentAgentFallback?: boolean;
  /** Which model tier to generate with — see lib/payment/types.ts
   * PLAN_MODEL_TIER. Defaults to "haiku" (the cheapest tier) so callers
   * that don't pass one (e.g. the test suite) get the safe default rather
   * than accidentally routing onto a paid-tier model. */
  modelTier?: ModelTier;
  telemetry?: TelemetryContext;
  /** Persist provider/model/token/cost evidence for a durable queue attempt. */
  onModelAttempt?: ModelAttemptCallback;
};

export type RawPromptOptions = {
  lettaAgentId?: string;
  allowPersistentAgentFallback?: boolean;
  modelTier?: ModelTier;
  telemetry?: TelemetryContext;
  onModelAttempt?: ModelAttemptCallback;
  operation?: string;
  promptVersion?: string;
};

type HumanWritingRefinementOptions = {
  modelTier: ModelTier;
  lettaAgentId?: string;
  allowPersistentAgentFallback: boolean;
  telemetry?: TelemetryContext;
  onModelAttempt?: ModelAttemptCallback;
};

/**
 * Generate content kit outputs.
 *
 * Routing priority:
 *  1. A direct OpenAI-compatible LLM endpoint (DeepSeek → GLM via provider
 *     failover) — primary path, faster + cheaper than Letta agents.
 *  2. The caller's per-user Letta agent (fallback when direct LLM fails).
 *  3. A shared Letta agent (trial users / final fallback) so we never hit the
 *     non-existent agent-less Letta completions endpoint.
 */
export async function generateKitOutputs(
  input: GenerateRequest,
  options: GenerateOptions = {}
): Promise<KitOutput[]> {
  const {
    lettaAgentId,
    onOutput,
    modelTier = "haiku",
    telemetry,
    onModelAttempt,
    allowPersistentAgentFallback = true
  } = options;
  const finalizeOutput: OutputCallback = async (output) => {
    const finalized = await refineHumanWritingOutput(input, output, {
      modelTier,
      lettaAgentId,
      allowPersistentAgentFallback,
      telemetry,
      onModelAttempt
    });
    await onOutput?.(finalized);
    return finalized;
  };

  // ── 1. Direct LLM path (DeepSeek → GLM via provider failover) ─
  // Primary path: a genuine OpenAI-compatible endpoint is faster and cheaper
  // than Letta agents for structured multi-platform generation. Letta drops to
  // fallback (below) so a direct-LLM outage still completes via agents.
  if (hasDirectLLM()) {
    try {
      return await generateViaLLM(
        input,
        modelTier,
        finalizeOutput,
        telemetry,
        onModelAttempt
      );
    } catch (error) {
      if (!allowPersistentAgentFallback) throw error;
      console.error("Direct LLM generation failed, falling back to Letta agents:", error);
      logWarn("ai_route_fallback", telemetry, {
        from: "direct",
        to: "letta"
      });
    }
  }

  // ── 2. Per-user Letta agent (fallback) ────────────────────────
  if (allowPersistentAgentFallback && isLettaConfigured() && lettaAgentId) {
    try {
      return await generateViaLetta(
        input,
        lettaAgentId,
        modelTier,
        finalizeOutput,
        telemetry,
        onModelAttempt
      );
    } catch (error) {
      // Per-user agent failed: try the shared agent before giving up.
      const sharedAgentId = await getSharedLettaAgentId();
      if (sharedAgentId && sharedAgentId !== lettaAgentId) {
        logWarn("ai_route_fallback", telemetry, {
          from: "letta_user",
          to: "letta_shared"
        });
        return generateViaLetta(
          input,
          sharedAgentId,
          modelTier,
          finalizeOutput,
          telemetry,
          onModelAttempt
        );
      }
      throw error;
    }
  }

  // ── 3. Shared Letta agent (trial + final fallback) ────────────
  if (allowPersistentAgentFallback && isLettaConfigured()) {
    const sharedAgentId = await getSharedLettaAgentId();
    if (sharedAgentId) {
      return generateViaLetta(
        input,
        sharedAgentId,
        modelTier,
        finalizeOutput,
        telemetry,
        onModelAttempt
      );
    }
  }

  // Nothing configured at all.
  throw new Error(
    allowPersistentAgentFallback
      ? "AI 生成未配置 — AI generation is not configured. Set LETTA_API_KEY, or set LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
      : "AI 生成未配置 — Secure external-content generation requires LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
  );
}

async function refineHumanWritingOutput(
  input: GenerateRequest,
  output: KitOutput,
  options: HumanWritingRefinementOptions
): Promise<KitOutput> {
  const normalized = normalizeHumanWritingOutput(output);
  if (process.env.HUMAN_WRITING_ENABLED === "false") return normalized;

  const assessment = assessHumanWriting(normalized);
  if (!assessment.needsRewrite) return normalized;

  const prompt = buildHumanWritingRewritePrompt(normalized, assessment);
  if (!prompt) {
    logWarn("human_writing_rewrite_skipped", options.telemetry, {
      platform: output.platform,
      reason: "source_too_long",
      human_writing_version: HUMAN_WRITING_VERSION
    });
    return normalized;
  }

  logInfo("human_writing_rewrite_attempted", options.telemetry, {
    platform: output.platform,
    score_before: assessment.score,
    issue_kinds: [...new Set(assessment.issues.map((issue) => issue.kind))].join(","),
    human_writing_version: HUMAN_WRITING_VERSION
  });

  try {
    const response = await sendRawPrompt(prompt, {
      modelTier: options.modelTier,
      lettaAgentId: options.lettaAgentId,
      allowPersistentAgentFallback: options.allowPersistentAgentFallback,
      telemetry: options.telemetry,
      onModelAttempt: options.onModelAttempt,
      operation: "human_writing_rewrite",
      promptVersion: HUMAN_WRITING_REWRITE_PROMPT_VERSION
    });
    const revision = parseHumanWritingRevision(response);
    if (!revision) {
      throw new Error("Human-writing rewrite did not return the required JSON shape.");
    }

    const candidate = normalizeHumanWritingOutput({ ...normalized, ...revision });
    const unsupportedClaims = findUnsupportedNumericClaims(input, candidate);
    if (unsupportedClaims.length > 0) {
      logWarn("human_writing_rewrite_rejected", options.telemetry, {
        platform: output.platform,
        reason: "unsupported_numeric_claim",
        unsupported_claim_count: unsupportedClaims.length,
        human_writing_version: HUMAN_WRITING_VERSION
      });
      return normalized;
    }

    const candidateAssessment = assessHumanWriting(candidate);
    if (
      candidateAssessment.score < assessment.score ||
      candidateAssessment.issues.length >= assessment.issues.length
    ) {
      logWarn("human_writing_rewrite_rejected", options.telemetry, {
        platform: output.platform,
        reason: "no_quality_improvement",
        score_before: assessment.score,
        score_after: candidateAssessment.score,
        human_writing_version: HUMAN_WRITING_VERSION
      });
      return normalized;
    }

    logInfo("human_writing_rewrite_completed", options.telemetry, {
      platform: output.platform,
      score_before: assessment.score,
      score_after: candidateAssessment.score,
      human_writing_version: HUMAN_WRITING_VERSION
    });
    return candidate;
  } catch (error) {
    logWarn("human_writing_rewrite_fallback", options.telemetry, {
      platform: output.platform,
      error_type: errorType(error),
      human_writing_version: HUMAN_WRITING_VERSION
    });
    return normalized;
  }
}

// ─── Shared batch + single-platform salvage orchestration ───────────
//
// Both the Letta path and the direct-LLM path face the same failure mode:
// a model asked for every requested platform in one shot hits its output
// token limit on long-form Chinese platforms (1500–3000 chars each),
// TRUNCATING the JSON and losing every platform in the response, not just
// the long one. Requesting platforms in small batches — and running one
// more focused single-platform pass over whatever is still missing —
// turns "选了4个只剩1个" into actually delivering all 4, and lets each
// batch stream to the client as soon as it resolves instead of waiting for
// the whole kit.

const GENERATION_BATCH_SIZE = 2;
const MAX_ATTEMPTS_PER_BATCH = 2;
// Upper bound on concurrent batch requests. Each batch owns a disjoint
// platform subset with no data dependency, so batches can run in parallel —
// turning a 4-platform kit from 2 sequential LLM rounds into 1. Capped to
// avoid provider rate limits (429); the per-output human-writing refinement
// (onOutput) also fans out within this budget.
const MAX_BATCH_CONCURRENCY = 3;

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the returned array. Resolves to an array of
 * results the same length as `items`.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Runs `sendBatch` over input.platforms in small batches, salvaging every
 * valid output from each response (even a truncated one) via
 * salvageOutputs, then runs a single-platform salvage pass over anything
 * still missing after all batches. `sendBatch` owns its own per-attempt
 * telemetry (provider/model logging differs between the Letta and direct
 * transports) — this function only owns batching, salvage, and streaming.
 */
async function collectOutputsInBatches(
  input: GenerateRequest,
  sendBatch: (platforms: PlatformId[], attempt: number) => Promise<string>,
  onOutput: OutputCallback | undefined,
  telemetry: TelemetryContext | undefined,
  diagLabel: string
): Promise<{ outputs: KitOutput[]; lastFailure: string | null }> {
  // Batches own DISJOINT platform subsets, so they have no data dependency on
  // each other — running them concurrently turns an N-batch kit from N
  // sequential LLM rounds into ~⌈N / MAX_BATCH_CONCURRENCY⌉ rounds. Each
  // batch writes into its own local map; results are merged after all batches
  // resolve to avoid a parallel write race on a shared map.
  const batches: PlatformId[][] = [];
  for (let i = 0; i < input.platforms.length; i += GENERATION_BATCH_SIZE) {
    batches.push(input.platforms.slice(i, i + GENERATION_BATCH_SIZE));
  }

  // Track the last sanitized send/parse failure so a total failure surfaces
  // an actionable status without ever copying a provider response body into
  // logs or the client. This is clearer than "no usable platform outputs" —
  // the 2026-07-21 production outage (paid-tier model handle on a
  // $0-balance account) was nearly undiagnosable from the generic message
  // alone.
  let lastFailure: string | null = null;

  const acceptSalvagedInto = async (
    content: string,
    allowedPlatforms: PlatformId[],
    sink: Map<string, KitOutput>
  ): Promise<string[]> => {
    const salvaged = salvageOutputs(content);
    const accepted: string[] = [];
    for (const output of salvaged) {
      const unsupportedClaims = findUnsupportedNumericClaims(input, output);
      if (unsupportedClaims.length > 0) {
        logWarn("ai_output_grounding_rejected", telemetry, {
          platform: output.platform,
          unsupported_claim_count: unsupportedClaims.length
        });
        continue;
      }
      if (allowedPlatforms.includes(output.platform) && !sink.has(output.platform)) {
        // onOutput carries the human-writing refinement pass. With batches
        // running concurrently, these refinements fan out in parallel too,
        // removing the per-output serial cost from the critical path.
        const finalized = (await onOutput?.(output)) ?? output;
        sink.set(output.platform, finalized);
        accepted.push(output.platform);
      }
    }
    return accepted;
  };

  const batchResults = await mapWithConcurrency(
    batches,
    MAX_BATCH_CONCURRENCY,
    async (batch) => {
      const localCollected = new Map<string, KitOutput>();
      let localFailure: string | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_BATCH; attempt += 1) {
        const missing = batch.filter((platform) => !localCollected.has(platform));
        if (missing.length === 0) {
          break;
        }

        let content: string;
        try {
          content = await sendBatch(missing, attempt);
        } catch (sendError) {
          localFailure = sendError instanceof Error ? sendError.message : String(sendError);
          continue;
        }

        const accepted = await acceptSalvagedInto(content, batch, localCollected);
        console.error(
          `[${diagLabel}] batch=[${missing.join(",")}] attempt ${attempt + 1} ` +
            `contentLen=${content.length} accepted=[${accepted.join(",")}] collectedTotal=${localCollected.size}`
        );
      }

      return { localCollected, localFailure };
    }
  );

  // Merge per-batch maps into one, preserving the user's requested platform
  // order. Iterate in batch order so lastFailure reflects the final batch's
  // error, matching the previous serial behavior.
  const collected = new Map<string, KitOutput>();
  for (const { localCollected, localFailure } of batchResults) {
    for (const [platform, output] of localCollected) {
      collected.set(platform, output);
    }
    if (localFailure) {
      lastFailure = localFailure;
    }
  }

  // ── Salvage round ──────────────────────────────────────────────
  // The batched pass gives up on a platform after MAX_ATTEMPTS_PER_BATCH
  // retries inside its batch. Run one more SINGLE-platform pass over
  // whatever is still missing — a focused 1-platform request has no token
  // truncation and no cross-platform interference, so it succeeds far more
  // often. This round stays serial: it only fires for platforms the
  // parallel batches failed to produce.
  const stillMissing = input.platforms.filter((platform) => !collected.has(platform));
  for (const platform of stillMissing) {
    try {
      const salvageContent = await sendBatch([platform], 0);
      await acceptSalvagedInto(salvageContent, [platform], collected);
    } catch (salvageError) {
      lastFailure = salvageError instanceof Error ? salvageError.message : String(salvageError);
      // best-effort: if it still fails the platform stays missing and the
      // partial-success path (route.ts partialSuccess + front-end toast)
      // surfaces it to the user instead of silently dropping it.
    }
  }

  return {
    // Preserve the user's requested platform order.
    outputs: input.platforms.filter((platform) => collected.has(platform)).map((platform) => collected.get(platform)!),
    lastFailure
  };
}

// ─── Letta Agent Generation ──────────────────────────────────────────

async function generateViaLetta(
  input: GenerateRequest,
  agentId: string,
  modelTier: ModelTier,
  onOutput?: OutputCallback,
  telemetry?: TelemetryContext,
  onModelAttempt?: ModelAttemptCallback
): Promise<KitOutput[]> {
  try {
    const sendBatch = async (batchPlatforms: PlatformId[], attempt: number): Promise<string> => {
      const prompt = buildGenerationPrompt({ ...input, platforms: batchPlatforms });
      const model = lettaModelForTier(modelTier);
      const startedAt = Date.now();
      try {
        const content = await sendLettaStructuredRequest(agentId, prompt, model);
        logInfo("ai_model_request_completed", telemetry, {
          provider: "letta",
          model,
          prompt_version: CONTENT_GENERATION_PROMPT_VERSION,
          latency_ms: Date.now() - startedAt,
          attempt: attempt + 1,
          batch_size: batchPlatforms.length,
          input_tokens: null,
          output_tokens: null,
          total_tokens: null,
          estimated_cost_usd: null
        });
        await onModelAttempt?.({
          provider: "letta",
          model,
          promptVersion: CONTENT_GENERATION_PROMPT_VERSION,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null
        });
        return content;
      } catch (sendError) {
        logError("ai_model_request_failed", telemetry, {
          provider: "letta",
          model,
          prompt_version: CONTENT_GENERATION_PROMPT_VERSION,
          attempt: attempt + 1,
          batch_size: batchPlatforms.length,
          error_type: errorType(sendError)
        });
        console.error(
          `Letta request failed (batch [${batchPlatforms.join(",")}] attempt ${attempt + 1}):`,
          sendError
        );
        throw sendError;
      }
    };

    const { outputs, lastFailure } = await collectOutputsInBatches(
      input,
      sendBatch,
      onOutput,
      telemetry,
      "letta-diag"
    );

    if (outputs.length === 0) {
      const detail = lastFailure
        ? ` Last provider error: ${lastFailure.slice(0, 300)}`
        : " The agent returned no parseable platform outputs (see [letta-diag] logs).";
      throw new Error(`Letta agent returned no usable platform outputs.${detail}`);
    }

    return outputs;
  } catch (error) {
    // Only fall back to the direct path if a genuine OpenAI-compatible
    // endpoint exists — otherwise re-throw so we surface a real error
    // instead of hitting the broken agent-less Letta endpoint.
    if (hasDirectLLM()) {
      console.error("Letta generation failed, falling back to direct LLM:", error);
      logWarn("ai_route_fallback", telemetry, {
        from: "letta",
        to: "direct"
      });
      return generateViaLLM(
        input,
        modelTier,
        onOutput,
        telemetry,
        onModelAttempt
      );
    }
    throw error;
  }
}

// ─── Direct LLM Generation ──────────────────────────────────────────

/** OpenAI-compatible multimodal message content part. */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };

/**
 * Whether uploaded media should be attached to the LLM as vision input.
 * Defaults ON; set LLM_VISION=false for a deployment whose configured model
 * cannot accept image/video content parts.
 */
function visionEnabled(): boolean {
  return process.env.LLM_VISION !== "false";
}

/**
 * Build the user message content for a direct-LLM call.
 *
 * When the request carries uploaded media with public URLs and vision is
 * enabled, return an OpenAI-compatible multimodal content array (the text
 * prompt + one image_url/video_url part per asset) so a vision model
 * actually SEES the product screenshots and video — this is what lets the
 * copy (and the LLM-authored imagePrompt that drives cover-image
 * generation) reflect what the user uploaded. Otherwise return the plain
 * prompt string, leaving non-media requests byte-for-byte unchanged.
 *
 * Video parts are only emitted for GLM (bigmodel.cn), which supports native
 * video understanding; other endpoints receive images only.
 */
function buildUserMessageContent(
  input: GenerateRequest,
  apiBase: string,
  prompt: string
): string | ChatContentPart[] {
  if (!visionEnabled()) {
    return prompt;
  }
  const images = input.mediaAssets.filter(
    (asset): asset is typeof asset & { url: string } => asset.type === "image" && Boolean(asset.url)
  );
  const supportsVideo = apiBase.includes("bigmodel.cn");
  const videos = supportsVideo
    ? input.mediaAssets.filter(
        (asset): asset is typeof asset & { url: string } => asset.type === "video" && Boolean(asset.url)
      )
    : [];
  if (images.length === 0 && videos.length === 0) {
    return prompt;
  }
  const parts: ChatContentPart[] = [{ type: "text", text: prompt }];
  for (const asset of images) {
    parts.push({ type: "image_url", image_url: { url: asset.url } });
  }
  for (const asset of videos) {
    parts.push({ type: "video_url", video_url: { url: asset.url } });
  }
  return parts;
}

/** Resolve the direct-LLM model name for a tier from the FIRST configured
 * provider — used by callers (e.g. lib/agent/loop.ts) that need a model
 * name before a request, outside the provider-failover path below. Falls
 * back to LLM_MODEL/gpt-4o-mini when nothing is configured, so deployments
 * that only set LLM_MODEL keep working unchanged. */
export function directLLMModelForTier(tier: ModelTier): string {
  const provider = usableProviders()[0];
  if (!provider) {
    return process.env.LLM_MODEL ?? "gpt-4o-mini";
  }
  return provider.models[tier];
}

/**
 * Move providers that declare a visionModel to the front of the chain,
 * preserving relative order within each group. A text-first chain (e.g.
 * DeepSeek before GLM) must not silently route image content to a
 * text-only model — DeepSeek's chat API has no image_url content-part
 * support at all, so sending it images would just be ignored/rejected by
 * the provider rather than degrading gracefully.
 */
function orderProvidersForVision(providers: LLMProvider[]): LLMProvider[] {
  const withVision = providers.filter((provider) => provider.visionModel);
  const withoutVision = providers.filter((provider) => !provider.visionModel);
  return [...withVision, ...withoutVision];
}

/**
 * Sends one /chat/completions request to `provider` and returns the raw
 * message content. Throws LLMRequestError (tagged with the HTTP status) on
 * a non-2xx response so withProviderFailover can tell a retryable 429/5xx
 * apart from a request that will never succeed against ANY provider.
 */
/**
 * Strict JSON Schema for the outputs array shape (see llmResponseSchema /
 * generatedKitOutputSchema above), passed only by callers that actually
 * expect that shape (content-kit generation) — other requestChatCompletion
 * callers (polish/refine/human-writing rewrite/storyboard) expect different
 * response shapes and must NOT receive this schema.
 */
const OUTPUTS_JSON_SCHEMA_DEF = {
  name: "content_kit_outputs",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["outputs"],
    properties: {
      outputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["platform", "title", "body", "cta", "notes", "strategy"],
          properties: {
            platform: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            cta: { type: "string" },
            notes: { type: "string" },
            strategy: { type: "string" },
            imagePrompt: { type: "string" }
          }
        }
      }
    }
  }
} as const;

/** Requests DeepSeek's required "json" mention in the prompt — its JSON mode
 * silently hangs to the token cap without it. A cheap, idempotent guard
 * since most callers already ask for JSON explicitly. */
function ensureJsonMentioned(content: string | ChatContentPart[]): string | ChatContentPart[] {
  if (typeof content === "string") {
    return /json/i.test(content) ? content : `${content}\n\nRespond with valid JSON only.`;
  }
  const hasJsonMention = content.some((part) => part.type === "text" && /json/i.test(part.text));
  if (hasJsonMention) return content;
  return content.map((part) =>
    part.type === "text" ? { ...part, text: `${part.text}\n\nRespond with valid JSON only.` } : part
  );
}

async function requestChatCompletion(
  provider: LLMProvider,
  modelName: string,
  userContent: string | ChatContentPart[],
  options: {
    systemPrompt?: string;
    temperature?: number;
    telemetry?: TelemetryContext;
    attempt?: ProviderAttemptContext;
    promptVersion?: string;
    operation?: string;
    onModelAttempt?: ModelAttemptCallback;
    maxTokens?: number;
    /** Pass true only when the caller's expected response shape matches
     * OUTPUTS_JSON_SCHEMA_DEF (content-kit generation). */
    useOutputsSchema?: boolean;
  } = {}
): Promise<string> {
  const startedAt = Date.now();
  const isGlm5 = modelName.startsWith("glm-5");
  const responseFormat =
    options.useOutputsSchema && provider.jsonMode === "schema"
      ? { type: "json_schema", json_schema: OUTPUTS_JSON_SCHEMA_DEF }
      : provider.jsonMode !== "none"
        ? { type: "json_object" }
        : null;
  const messageContent = provider.jsonMode === "object" ? ensureJsonMentioned(userContent) : userContent;

  const requestBody: Record<string, unknown> = {
    model: modelName,
    temperature: options.temperature ?? (isGlm5 ? 1.0 : 0.7),
    ...(responseFormat ? { response_format: responseFormat } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    messages: [
      ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
      { role: "user", content: messageContent }
    ]
  };

  // Enable thinking reasoning mode for GLM-5 series models
  if (isGlm5) {
    requestBody.thinking = { type: "enabled" };
  }

  let responseStatus: number | null = null;
  try {
    const response = await fetch(`${provider.apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60_000)
    });
    responseStatus = response.status;

    if (!response.ok) {
      // Drain a bounded amount without surfacing provider payloads. Error bodies
      // may echo prompts or other user-controlled content.
      await readTextWithLimit(response, MAX_LLM_ERROR_BYTES).catch(() => "");
      throw new LLMRequestError(
        response.status,
        `LLM request failed: ${response.status}`
      );
    }

    const raw = await readTextWithLimit(response, MAX_LLM_RESPONSE_BYTES);
    const data = chatCompletionResponseSchema.parse(JSON.parse(raw));
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM returned an empty response.");
    }
    const usage = normalizeTokenUsage(data.usage);
    const estimatedCostUsd = usage
      ? estimateModelCostUsd(provider.name, modelName, usage)
      : null;
    logInfo("ai_model_request_completed", options.telemetry, {
      provider: provider.name,
      model: modelName,
      operation: options.operation ?? "structured_prompt",
      prompt_version: options.promptVersion ?? "unversioned",
      latency_ms: Date.now() - startedAt,
      attempt: options.attempt?.attempt ?? 1,
      fallback: options.attempt?.fallback ?? false,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      total_tokens: usage?.totalTokens ?? null,
      estimated_cost_usd: estimatedCostUsd
    });
    await options.onModelAttempt?.({
      provider: provider.name,
      model: modelName,
      promptVersion: options.promptVersion ?? "unversioned",
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      estimatedCostUsd
    });
    return content;
  } catch (error) {
    logError("ai_model_request_failed", options.telemetry, {
      provider: provider.name,
      model: modelName,
      operation: options.operation ?? "structured_prompt",
      prompt_version: options.promptVersion ?? "unversioned",
      latency_ms: Date.now() - startedAt,
      attempt: options.attempt?.attempt ?? 1,
      fallback: options.attempt?.fallback ?? false,
      status: responseStatus,
      error_type: errorType(error)
    });
    throw error;
  }
}

async function generateViaLLM(
  input: GenerateRequest,
  modelTier: ModelTier,
  onOutput?: OutputCallback,
  telemetry?: TelemetryContext,
  onModelAttempt?: ModelAttemptCallback
): Promise<KitOutput[]> {
  const hasMedia = input.mediaAssets.some((asset) => Boolean(asset.url));
  const providers = hasMedia ? orderProvidersForVision(usableProviders()) : usableProviders();
  if (providers.length === 0) {
    throw new Error("AI 生成未配置 — AI generation is not configured. Please set LLM_API_KEY in your deployment environment variables.");
  }

  const systemPrompt = "You are a senior growth strategist. Return strict JSON that matches the requested schema.";

  try {
    const sendBatch = async (batchPlatforms: PlatformId[]): Promise<string> => {
      const textOnly = buildGenerationPrompt({ ...input, platforms: batchPlatforms });

      return withProviderFailover(providers, async (provider, attempt) => {
        const modelName = provider.models[modelTier];
        // When the user uploaded product screenshots/video (with public URLs),
        // send them to the model as vision input so it actually SEES the
        // product instead of only reading a filename. If the vision request
        // fails (e.g. the configured model can't accept image content), fall
        // back once to a text-only request on the SAME provider so generation
        // still succeeds — degraded, not broken — before failing over.
        const visionContent = buildUserMessageContent(input, provider.apiBase, textOnly);
        if (typeof visionContent === "string") {
          return requestChatCompletion(provider, modelName, visionContent, {
            systemPrompt,
            telemetry,
            attempt,
            promptVersion: CONTENT_GENERATION_PROMPT_VERSION,
            operation: "content_kit_generation",
            onModelAttempt,
            useOutputsSchema: true,
            maxTokens: CONTENT_GENERATION_MAX_TOKENS
          });
        }
        try {
          return await requestChatCompletion(provider, modelName, visionContent, {
            systemPrompt,
            telemetry,
            attempt,
            promptVersion: CONTENT_GENERATION_PROMPT_VERSION,
            operation: "content_kit_generation_vision",
            onModelAttempt,
            useOutputsSchema: true,
            maxTokens: CONTENT_GENERATION_MAX_TOKENS
          });
        } catch (visionError) {
          console.warn(
            "LLM vision request failed, retrying text-only:",
            visionError instanceof Error ? visionError.message : String(visionError)
          );
          logWarn("ai_vision_fallback", telemetry, {
            provider: provider.name,
            model: modelName,
            error_type: errorType(visionError)
          });
          return requestChatCompletion(provider, modelName, textOnly, {
            systemPrompt,
            telemetry,
            attempt,
            promptVersion: CONTENT_GENERATION_PROMPT_VERSION,
            operation: "content_kit_generation_text_fallback",
            onModelAttempt,
            useOutputsSchema: true,
            maxTokens: CONTENT_GENERATION_MAX_TOKENS
          });
        }
      }, {
        onAttempt(metric) {
          const fields = {
            provider: metric.provider,
            attempt: metric.attempt,
            provider_index: metric.providerIndex,
            fallback: metric.fallback,
            latency_ms: metric.latencyMs,
            outcome: metric.outcome,
            status: metric.status,
            retryable: metric.retryable
          };
          if (metric.outcome === "failed") {
            logWarn("ai_provider_attempt", telemetry, fields);
          } else {
            logInfo("ai_provider_attempt", telemetry, fields);
          }
        }
      });
    };

    const { outputs, lastFailure } = await collectOutputsInBatches(
      input,
      (batchPlatforms) => sendBatch(batchPlatforms),
      onOutput,
      telemetry,
      "direct-llm-diag"
    );

    if (outputs.length === 0) {
      const detail = lastFailure ? ` Last provider error: ${lastFailure.slice(0, 300)}` : "";
      throw new Error(`LLM response did not include any requested platform.${detail}`);
    }

    return outputs;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("LLM generation failed:", detail);
    if (error instanceof LLMRequestError) throw error;
    throw new Error(`AI generation failed: ${detail}`);
  }
}

/**
 * Send a one-off prompt and return the raw text response, routing through
 * the same Letta shared agent / direct LLM infrastructure as kit
 * generation. Used by features that need a single structured LLM call
 * without the platform-output shape — e.g. Brand Memory URL bootstrap
 * (app/api/brand-brain/extract/route.ts). Callers that are part of a
 * generation run can retain its model tier and audit context via `options`.
 */
export async function sendRawPrompt(
  prompt: string,
  options: RawPromptOptions = {}
): Promise<string> {
  if (hasDirectLLM()) {
    return sendRawPromptViaDirectLLM(prompt, options);
  }

  if (options.allowPersistentAgentFallback !== false && isLettaConfigured()) {
    const agentId = options.lettaAgentId ?? await getSharedLettaAgentId();
    if (agentId) {
      const model = lettaModelForTier(options.modelTier ?? "haiku");
      const startedAt = Date.now();
      const content = await sendLettaStructuredRequest(agentId, prompt, model);
      logInfo("ai_model_request_completed", options.telemetry, {
        provider: "letta",
        model,
        operation: options.operation ?? "raw_structured_prompt",
        prompt_version: options.promptVersion ?? "raw-structured-v1",
        latency_ms: Date.now() - startedAt,
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        estimated_cost_usd: null
      });
      await options.onModelAttempt?.({
        provider: "letta",
        model,
        promptVersion: options.promptVersion ?? "raw-structured-v1",
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCostUsd: null
      });
      return content;
    }
  }

  throw new Error(
    options.allowPersistentAgentFallback === false
      ? "AI 生成未配置 — Secure external-content generation requires LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
      : "AI 生成未配置 — AI generation is not configured. Set LETTA_API_KEY, or set LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
  );
}

/**
 * Processes scraped pages, pasted third-party exports, and other untrusted
 * source material through a stateless direct model call only. It deliberately
 * never falls back to a persistent Letta agent, where source-level prompt
 * injection could otherwise interact with agent memory or configured tools.
 */
export async function sendUntrustedContentPrompt(prompt: string): Promise<string> {
  if (!hasDirectLLM()) {
    throw new Error(
      "AI 生成未配置 — Secure external-content extraction requires LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
    );
  }
  return sendRawPromptViaDirectLLM(prompt);
}

/**
 * Same contract as sendRawPrompt, but attaches image URLs as vision content
 * parts (same shape as buildUserMessageContent above) — used by the agent's
 * Xiaohongshu account-diagnosis tool to actually SEE uploaded screenshots.
 * Requires the direct-LLM path (Letta has no vision-capable agent-less
 * endpoint here); throws if only Letta is configured.
 */
export async function sendRawPromptWithImages(prompt: string, imageUrls: string[]): Promise<string> {
  const providers = usableProviders();
  if (providers.length === 0) {
    throw new Error(
      "AI 生成未配置 — Image analysis requires LLM_API_KEY with an OpenAI-compatible LLM_API_BASE."
    );
  }
  if (imageUrls.length === 0) {
    return sendRawPromptViaDirectLLM(prompt);
  }
  if (!visionEnabled()) {
    throw new Error(
      "AI 生成未配置 — Image analysis is disabled because LLM_VISION=false. Enable vision before importing screenshots."
    );
  }

  // Only providers that declare a visionModel can actually see the images —
  // a text-only model (e.g. DeepSeek, which has no image_url content-part
  // support) must never receive them, so it's excluded entirely rather than
  // silently falling back to its haiku text model.
  const visionProviders = providers.filter((provider) => provider.visionModel);
  if (visionProviders.length === 0) {
    throw new Error(
      "AI 生成未配置 — Image analysis requires a configured provider with a vision model (LLM_VISION_MODEL or LLM_PROVIDERS[].models.vision)."
    );
  }

  const content: ChatContentPart[] = [
    { type: "text", text: prompt },
    ...imageUrls.map((url): ChatContentPart => ({ type: "image_url", image_url: { url } }))
  ];

  return withProviderFailover(visionProviders, (provider, attempt) =>
    requestChatCompletion(provider, provider.visionModel!, content, {
      temperature: 0.3,
      attempt,
      operation: "vision_extraction",
      promptVersion: "vision-extraction-v1"
    })
  );
}

async function sendRawPromptViaDirectLLM(
  prompt: string,
  options: RawPromptOptions = {}
): Promise<string> {
  const providers = usableProviders();
  if (providers.length === 0) {
    throw new Error("AI 生成未配置 — AI generation is not configured.");
  }

  return withProviderFailover(providers, (provider, attempt) =>
    requestChatCompletion(provider, provider.models[options.modelTier ?? "haiku"], prompt, {
      temperature: 0.3,
      attempt,
      telemetry: options.telemetry,
      operation: options.operation ?? "raw_structured_prompt",
      promptVersion: options.promptVersion ?? "raw-structured-v1",
      onModelAttempt: options.onModelAttempt
    })
  );
}

function normalizeTokenUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined
): TokenUsage | null {
  if (!usage) return null;
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function errorType(error: unknown): string {
  if (error instanceof LLMRequestError) return `http_${error.status}`;
  if (error instanceof z.ZodError) return "invalid_provider_response";
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error) return error.name || "error";
  return "unknown";
}

function parseHumanWritingRevision(
  content: string
): z.infer<typeof humanWritingRevisionSchema> | null {
  const object = extractFirstJsonObject(content);
  if (!object) return null;
  const parsed = humanWritingRevisionSchema.safeParse(JSON.parse(object));
  return parsed.success ? parsed.data : null;
}

/**
 * Scan for the first complete, brace-balanced JSON object in a string,
 * correctly skipping braces that occur inside quoted strings and escapes.
 * Returns the substring (including the outer braces) or null.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Salvage as many valid KitOutput objects as possible from a model response,
 * even when the overall JSON is TRUNCATED (e.g. the model hit its output
 * token limit mid-object). Strategy:
 *  1. Try strict parse first (fast path for well-formed responses).
 *  2. Otherwise, scan the string for every brace-balanced {...} object and
 *     validate each one individually with kitOutputSchema. Incomplete objects
 *     at the truncation point are simply skipped.
 *
 * This is what prevents one long/truncated platform from discarding all the
 * other fully-generated platforms in the same response.
 */
function salvageOutputs(content: string): KitOutput[] {
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Fast path: the whole thing parses cleanly.
  try {
    const parsed = llmResponseSchema.parse(normalizeOutputPlatforms(JSON.parse(trimmed)));
    return parsed.outputs;
  } catch {
    // Fall through to per-object salvage.
  }

  const results: KitOutput[] = [];
  let searchFrom = trimmed.indexOf("{");

  // Skip the outermost wrapper `{ "outputs": [` by starting the scan at the
  // first object INSIDE the outputs array when present.
  const outputsKey = trimmed.indexOf('"outputs"');
  if (outputsKey !== -1) {
    const bracket = trimmed.indexOf("[", outputsKey);
    if (bracket !== -1) {
      searchFrom = bracket + 1;
    }
  }

  while (searchFrom !== -1 && searchFrom < trimmed.length) {
    const nextBrace = trimmed.indexOf("{", searchFrom);
    if (nextBrace === -1) {
      break;
    }
    const objStr = extractFirstJsonObject(trimmed.slice(nextBrace));
    if (!objStr) {
      // Truncated final object — nothing more to salvage.
      break;
    }
    try {
      const candidate = JSON.parse(objStr) as Record<string, unknown>;
      if (candidate && typeof candidate === "object" && "platform" in candidate) {
        const normalized = normalizePlatformId(candidate.platform);
        if (normalized) {
          candidate.platform = normalized;
        }
        const validated = generatedKitOutputSchema.safeParse(candidate);
        if (validated.success) {
          results.push(validated.data);
        }
      }
    } catch {
      // Not a valid object on its own — skip it.
    }
    searchFrom = nextBrace + objStr.length;
  }

  return results;
}
