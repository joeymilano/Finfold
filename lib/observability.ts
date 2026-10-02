export type TelemetryContext = {
  requestId?: string | null;
  traceId?: string | null;
  generationRunId?: string | null;
  userId?: string | null;
};

export type TelemetryFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PRICING_ENV = "LLM_PRICING_USD_PER_1M";

/**
 * Normalize an OpenAI-style usage payload; returns null when unusable.
 * Client-safe: keep this module free of server-only imports (some shared
 * utilities such as lib/safe-url pull logInfo into client bundles).
 */
export function parseTokenUsage(rawUsage: unknown): TokenUsage | null {
  if (!rawUsage || typeof rawUsage !== "object") return null;
  const raw = rawUsage as Record<string, unknown>;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const inputTokens = number(raw.prompt_tokens) ?? number(raw.input_tokens);
  const outputTokens = number(raw.completion_tokens) ?? number(raw.output_tokens);
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens, totalTokens: number(raw.total_tokens) ?? inputTokens + outputTokens };
}

/** Log only metering fields, never provider payloads, prompts or reasoning. */
export function logProviderTokenUsage(
  provider: string,
  model: string,
  operation: string,
  rawUsage: unknown,
  context: TelemetryContext = {}
): void {
  const usage = parseTokenUsage(rawUsage);
  if (!usage) return;
  const details = (rawUsage as Record<string, unknown>).completion_tokens_details;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const reasoningTokens = details && typeof details === "object"
    ? number((details as Record<string, unknown>).reasoning_tokens) : null;
  logInfo("agent_model_usage", context, {
    provider, model, operation,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    reasoning_tokens: reasoningTokens,
    estimated_cost_usd: estimateModelCostUsd(provider, model, usage)
  });
}

export function resolveRequestId(headerValue: string | null): string {
  const candidate = headerValue?.trim();
  return candidate && CORRELATION_ID_PATTERN.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

export function buildLogRecord(
  level: "info" | "warn" | "error",
  event: string,
  context: TelemetryContext = {},
  fields: TelemetryFields = {}
) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "finfold",
    request_id: context.requestId ?? null,
    trace_id: context.traceId ?? null,
    generation_run_id: context.generationRunId ?? null,
    user_id: context.userId ?? null,
    ...withoutUndefined(fields)
  };
}

export function logInfo(
  event: string,
  context?: TelemetryContext,
  fields?: TelemetryFields
): void {
  writeLog("info", event, context, fields);
}

export function logWarn(
  event: string,
  context?: TelemetryContext,
  fields?: TelemetryFields
): void {
  writeLog("warn", event, context, fields);
}

export function logError(
  event: string,
  context?: TelemetryContext,
  fields?: TelemetryFields
): void {
  writeLog("error", event, context, fields);
}

/**
 * Pricing is deployment configuration rather than hard-coded product truth.
 *
 * LLM_PRICING_USD_PER_1M example:
 * {
 *   "dashscope:qwen3.8-flash": { "input": 0.1, "output": 0.1 },
 *   "default:gpt-4o-mini": { "input": 0.15, "output": 0.6 }
 * }
 */
export function estimateModelCostUsd(
  provider: string,
  model: string,
  usage: TokenUsage,
  rawPricing = process.env[PRICING_ENV]
): number | null {
  if (!rawPricing) return null;
  try {
    const pricing = JSON.parse(rawPricing) as Record<
      string,
      { input?: unknown; output?: unknown }
    >;
    const entry = pricing[`${provider}:${model}`] ?? pricing[model];
    if (
      !entry ||
      typeof entry.input !== "number" ||
      !Number.isFinite(entry.input) ||
      entry.input < 0 ||
      typeof entry.output !== "number" ||
      !Number.isFinite(entry.output) ||
      entry.output < 0
    ) {
      return null;
    }
    const cost =
      (usage.inputTokens * entry.input + usage.outputTokens * entry.output) /
      1_000_000;
    return Number(cost.toFixed(8));
  } catch {
    return null;
  }
}

function withoutUndefined(fields: TelemetryFields): TelemetryFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
}

function writeLog(
  level: "info" | "warn" | "error",
  event: string,
  context: TelemetryContext = {},
  fields: TelemetryFields = {}
): void {
  if (process.env.NODE_ENV === "test") return;
  const record = buildLogRecord(level, event, context, fields);
  if (level === "error") {
    console.error(record);
  } else if (level === "warn") {
    console.warn(record);
  } else {
    console.info(record);
  }
}
