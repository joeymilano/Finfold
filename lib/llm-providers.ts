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

export type ModelTier = "haiku" | "sonnet" | "opus";

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

export type LLMProvider = {
  name: string;
  apiBase: string;
  apiKey: string;
  models: Record<ModelTier, string>;
  /** Optional multimodal model for image/OCR requests. */
  visionModel?: string;
  jsonMode: JsonModeSupport;
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

/** Legacy single-provider deployments have no explicit jsonMode field, so
 * infer it from the apiBase the same way requestChatCompletion used to
 * hard-code it — this keeps existing deployments' behavior unchanged. */
function inferJsonModeFromApiBase(apiBase: string): JsonModeSupport {
  return apiBase.includes("openai.com") || apiBase.includes("bigmodel.cn") ? "object" : "none";
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
      jsonMode?: string;
    }>;

    const providers: LLMProvider[] = [];
    for (const entry of parsed) {
      const apiKey = process.env[entry.keyEnv];
      if (!apiKey || !entry.base) continue;

      const haiku = entry.models?.haiku ?? "gpt-4o-mini";
      const jsonMode = VALID_JSON_MODES.has(entry.jsonMode as JsonModeSupport)
        ? (entry.jsonMode as JsonModeSupport)
        : inferJsonModeFromApiBase(entry.base);
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
        jsonMode
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
export function resolveLLMProviders(): LLMProvider[] {
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
      jsonMode: inferJsonModeFromApiBase(apiBase)
    }
  ];
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
export async function withProviderFailover<T, P extends { name: string } = LLMProvider>(
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
  for (const [providerIndex, provider] of providers.entries()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
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
        const retryable = status === undefined || isRetryableStatus(status);
        options.onAttempt?.({
          ...attemptContext,
          provider: provider.name,
          latencyMs: Date.now() - startedAt,
          outcome: "failed",
          status: status ?? null,
          retryable
        });
        if (retryable && attempt === 0) {
          await sleep(300 + Math.random() * 400);
          continue;
        }
        break;
      }
    }
    console.error(`[llm-providers] provider "${provider.name}" failed, trying next provider:`, lastError);
  }

  throw lastError instanceof Error ? lastError : new Error("All configured LLM providers failed.");
}
