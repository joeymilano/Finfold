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
 *   "zhipu:glm-4-flash": { "input": 0.1, "output": 0.1 },
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
