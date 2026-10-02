/**
 * Multi-provider failover for direct (non-Letta) LLM calls.
 *
 * Historically lib/llm.ts pointed at exactly one OpenAI-compatible endpoint
 * (LLM_API_BASE/LLM_API_KEY). A single provider means a 429 rate limit or an
 * outage on that one endpoint takes down every direct-LLM code path at once
 * — the "AI 限流" risk judges called out. This module resolves an ORDERED
 * chain of providers instead, so callers can retry the same request against
 * the next provider when one is rate-limited or down.
 *
 * Configuration is additive: when LLM_PROVIDERS isn't set, resolveLLMProviders
 * falls back to today's single LLM_API_BASE/LLM_API_KEY/LLM_MODEL* env vars
 * unchanged, so existing single-provider deployments keep working exactly
 * as before.
 */

import { refundLLMBudget, reserveLLMBudget } from "@/lib/llm-budget";
import { getZhipuProvider } from "@/lib/zhipu";

export type ModelTier = "haiku" | "sonnet" | "opus";

/** Task-scoped routing purpose for direct provider resolution call sites. */
export type LLMTaskPurpose =
  | "general"
  | "agent"
  | "evidence_analyst"
  | "brand_strategist"
  | "channel_specialist"
  | "risk_reviewer";

/**
 * Whether a provider's /chat/completions endpoint accepts response_format:
 *  - "schema": supports { type: "json_schema", json_schema: {...} } (strict
 *    shape validation server-side, so a malformed response is rejected before
 *    it ever reaches us).
 *  - "object": supports { type: "json_object" } only (guarantees valid JSON
 *    syntax, but not the shape).
 *  - "none": no response_format support; rely on prompt instructions alone.
 */
export type JsonModeSupport = "none" | "object" | "schema";
export type ProviderCostClass = "free_pool" | "paid";
export type ProviderPolicy = "all" | "free_only";

export type LLMProvider = {
  name: string;
  apiBase: string;
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Optional multimodal model for image/OCR requests. */
  visionModel?: string;
  /** Whether the declared vision model accepts video_url content parts. */
  supportsVideo?: boolean;
  /**
   * OpenAI-compatible Qwen models default to thinking mode. Providers may
   * disable it for the latency/cost-sensitive Agent path while keeping the
   * option explicit and provider-scoped (other vendors do not receive the
   * DashScope-only request field).
   */
  enableThinking?: boolean;
  /** BigModel dialect, with thinking disabled for portable tool turns. */
  zhipu?: boolean;
  maxAttempts?: number;
  failureGroup?: string;
  /**
   * Hard monthly CNY cap (see lib/llm-budget.ts). When the calendar-month
   * spend estimate reaches this value the provider is skipped and the
   * chain fails over instead of spending past the cap.
   */
  monthlyBudgetCny?: number;
  jsonMode: JsonModeSupport;
  /**
   * Explicit billing boundary. Legacy and unlabelled providers are always
   * treated as paid so free extension traffic can never reach them by
   * accident when configuration drifts.
   */
  costClass: ProviderCostClass;
};

export type ProviderAttemptContext = {
  attempt: number;
  providerIndex: number;
  fallback: boolean;
};

export type ProviderAttemptMetric = ProviderAttemptContext & {
  provider: string;
  latencyMs: number;
  outcome: "succeeded" | "failed";
  status: number | null;
  retryable: boolean;
};

export type ProviderFailoverOptions = {
  onAttempt?: (metric: ProviderAttemptMetric) => void;
  /** Defaults to the historical two tries. Anonymous extension calls use 1. */
  maxAttemptsPerProvider?: 1 | 2;
};

/** Thrown by a `send` callback passed to withProviderFailover so the chain
 * can tell a rate-limit/outage (retryable) apart from a genuine bad request
 * (not retryable — retrying or failing over to another provider won't help). */
export class LLMRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses LLM_PROVIDERS, a JSON array of
 * `{ name?, base, keyEnv, models?: { haiku?, sonnet?, opus?, vision? } }`. Each
 * provider's actual API key is read from the env var NAMED by `keyEnv`
 * (never inlined in the JSON itself, so provider config can be committed
 * without secrets). A provider whose key env var isn't set is skipped
 * rather than included with an empty key.
 */
const VALID_JSON_MODES = new Set<JsonModeSupport>(["none", "object", "schema"]);
const VALID_COST_CLASSES = new Set<ProviderCostClass>(["free_pool", "paid"]);

/** Legacy single-provider deployments have no explicit jsonMode field, so
 * infer it from the apiBase the same way requestChatCompletion used to
 * hard-code it — this keeps existing deployments' behavior unchanged. */
function inferJsonModeFromApiBase(apiBase: string): JsonModeSupport {
  return apiBase.includes("openai.com") ? "object" : "none";
}

function parseProvidersFromEnv(): LLMProvider[] | null {
  const raw = process.env.LLM_PROVIDERS;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      base: string;
      keyEnv: string;
      models?: Partial<Record<ModelTier | "vision", string>>;
      supportsVideo?: boolean;
      enableThinking?: boolean;
      jsonMode?: string;
      costClass?: string;
      monthlyBudgetCny?: number;
    }>;

    const providers: LLMProvider[] = [];
    for (const entry of parsed) {
      const apiKey = process.env[entry.keyEnv];
      if (!apiKey || !entry.base) continue;

      const haiku = entry.models?.haiku ?? "gpt-4o-mini";
      const jsonMode = VALID_JSON_MODES.has(entry.jsonMode as JsonModeSupport)
        ? (entry.jsonMode as JsonModeSupport)
        : inferJsonModeFromApiBase(entry.base);
      const costClass = VALID_COST_CLASSES.has(entry.costClass as ProviderCostClass)
        ? (entry.costClass as ProviderCostClass)
        : "paid";
      providers.push({
        name: entry.name ?? entry.base,
        apiBase: entry.base,
        apiKey,
        models: {
          haiku,
          sonnet: entry.models?.sonnet ?? haiku,
          opus: entry.models?.opus ?? entry.models?.sonnet ?? haiku
        },
        visionModel: entry.models?.vision?.trim() || undefined,
        supportsVideo: Boolean(entry.models?.vision?.trim()) && entry.supportsVideo === true,
        enableThinking: entry.enableThinking,
        jsonMode,
        costClass,
        ...(typeof entry.monthlyBudgetCny === "number"
          && Number.isFinite(entry.monthlyBudgetCny) && entry.monthlyBudgetCny > 0
          ? { monthlyBudgetCny: entry.monthlyBudgetCny }
          : {})
      });
    }
    return providers.length > 0 ? providers : null;
  } catch (error) {
    console.error("[llm-providers] failed to parse LLM_PROVIDERS, ignoring:", error);
    return null;
  }
}

/**
 * Resolve the ordered provider chain for direct-LLM calls. Prefers
 * LLM_PROVIDERS when configured; otherwise builds a single-provider chain
 * from LLM_API_BASE/LLM_API_KEY/LLM_MODEL* exactly as lib/llm.ts always has,
 * so this is a strict superset of the old behavior.
 */
export function resolveLLMProviders(purpose: LLMTaskPurpose = "general"): LLMProvider[] {
  const legacy = resolveLegacyLLMProviders();
  const zhipu = getZhipuProvider(purpose);
  if (zhipu) return [zhipu, ...legacy];
  return legacy;
}

function resolveLegacyLLMProviders(): LLMProvider[] {
  const configured = parseProvidersFromEnv();
  if (configured) return configured;

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return [];

  const apiBase = process.env.LLM_API_BASE ?? "https://api.openai.com/v1";
  return [
    {
      name: "default",
      apiBase,
      apiKey,
      models: {
        haiku: process.env.LLM_MODEL ?? "gpt-4o-mini",
        sonnet: process.env.LLM_MODEL_SONNET ?? process.env.LLM_MODEL ?? "gpt-4o-mini",
        opus: process.env.LLM_MODEL_OPUS ?? process.env.LLM_MODEL ?? "gpt-4o-mini"
      },
      visionModel: process.env.LLM_VISION_MODEL?.trim() || undefined,
      supportsVideo: Boolean(process.env.LLM_VISION_MODEL?.trim()) && process.env.LLM_VIDEO === "true",
      jsonMode: inferJsonModeFromApiBase(apiBase),
      costClass: "paid"
    }
  ];
}

/** Do not send Qwen-only fields or unsupported sampling controls to the
 *  gateway. Sonnet 5 rejects non-default temperature; thinking output is
 *  capped along with visible output to bound event-credit consumption.
 *  `enableThinking` opts this specific call into extended reasoning (Agent
 *  medium/high depth); GLM thinking mode also wants a warmer temperature and
 *  a larger token ceiling that covers the reasoning span. */
export function chatRequestOptions(
  provider: LLMProvider,
  temperature: number,
  maxTokens?: number,
  enableThinking = false
): Record<string, unknown> {
  if (provider.zhipu) return {
    temperature: enableThinking ? Math.max(temperature, 0.6) : temperature,
    thinking: { type: enableThinking ? "enabled" : "disabled" },
    max_tokens: maxTokens ?? (enableThinking ? 8192 : 4096)
  };
  return {
    temperature,
    ...(enableThinking
      ? { enable_thinking: true }
      : provider.enableThinking === undefined
        ? {}
        : { enable_thinking: provider.enableThinking }),
    ...(maxTokens ? { max_tokens: maxTokens } : {})
  };
}

export function filterProvidersForPolicy<T extends Pick<LLMProvider, "costClass">>(
  providers: T[],
  policy: ProviderPolicy = "all"
): T[] {
  return policy === "free_only"
    ? providers.filter((provider) => provider.costClass === "free_pool")
    : providers;

}

/**
 * Runs `send` against each provider in order. On a retryable failure
 * (429/5xx, or any error not tagged with an LLMRequestError status — e.g. a
 * network error or an empty-response parse failure) it retries the SAME
 * provider once with jittered backoff before moving to the next provider.
 * A non-retryable failure (e.g. a 400) moves to the next provider
 * immediately without wasting a retry on a request that will never succeed.
 *
 * Throws the last error once every provider has been exhausted.
 */
export async function withProviderFailover<T, P extends { name: string; maxAttempts?: number; failureGroup?: string; monthlyBudgetCny?: number } = LLMProvider>(
  providers: P[],
  send: (
    provider: P,
    attempt: ProviderAttemptContext
  ) => Promise<T>,
  options: ProviderFailoverOptions = {}
): Promise<T> {
  if (providers.length === 0) {
    throw new Error("AI 生成未配置 — no direct LLM provider is configured.");
  }

  let lastError: unknown;
  const unavailableGroups = new Set<string>();
  for (const [providerIndex, provider] of providers.entries()) {
    if (provider.failureGroup && unavailableGroups.has(provider.failureGroup)) continue;
    // Budgeted paid providers reserve before every attempt and fail closed:
    // an exhausted (or unreachable) monthly cap skips the provider entirely.
    if (provider.monthlyBudgetCny !== undefined
      && !(await reserveLLMBudget(provider.name, provider.monthlyBudgetCny))) {
      console.warn("[llm-providers] monthly budget exhausted or unavailable; skipping provider", {
        provider: provider.name,
        budget_cny: provider.monthlyBudgetCny
      });
      continue;
    }
    const maxAttempts = Math.min(provider.maxAttempts === 1 ? 1 : 2, options.maxAttemptsPerProvider ?? 2);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptContext = {
        attempt: attempt + 1,
        providerIndex,
        fallback: providerIndex > 0
      };
      const startedAt = Date.now();
      try {
        const result = await send(provider, attemptContext);
        options.onAttempt?.({
          ...attemptContext,
          provider: provider.name,
          latencyMs: Date.now() - startedAt,
          outcome: "succeeded",
          status: null,
          retryable: false
        });
        return result;
      } catch (error) {
        lastError = error;
        const status = error instanceof LLMRequestError ? error.status : undefined;
        if (status === 499) throw error;
        if (provider.monthlyBudgetCny !== undefined) void refundLLMBudget(provider.name);
        const retryable = status === undefined || isRetryableStatus(status);
        options.onAttempt?.({
          ...attemptContext,
          provider: provider.name,
          latencyMs: Date.now() - startedAt,
          outcome: "failed",
          status: status ?? null,
          retryable
        });
        // The gateway shares one balance across models. Auth, quota, timeout
        // and gateway failures should go directly to the independent API,
        // not repeat the same failing account for every model alias.
        if (provider.failureGroup && (status === undefined || [401, 402, 429].includes(status) || status >= 500)) {
          unavailableGroups.add(provider.failureGroup);
          break;
        }
        if (retryable && attempt + 1 < maxAttempts) {
          await sleep(300 + Math.random() * 400);
          continue;
        }
        break;
      }
    }
    console.error("[llm-providers] provider failed; trying next provider", {
      provider: provider.name,
      status: lastError instanceof LLMRequestError ? lastError.status : null,
      errorType: lastError instanceof Error ? lastError.name : "UnknownError"
    });
  }

  throw lastError instanceof Error ? lastError : new Error("All configured LLM providers failed.");
}
