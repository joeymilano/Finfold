import { z } from "zod";
import { LLMRequestError } from "@/lib/llm-providers";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const generationRunStatusSchema = z.enum([
  "queued",
  "running",
  "partial_success",
  "succeeded",
  "failed",
  "cancelled"
]);

export const generationRunStepSchema = z.enum([
  "validate_request",
  "reserve_credits",
  "moderate_input",
  "load_context",
  "generate_outputs",
  "persist_kit",
  "finalize"
]);

export type GenerationRunStatus = z.infer<typeof generationRunStatusSchema>;
export type GenerationRunStep = z.infer<typeof generationRunStepSchema>;

export type GenerationRunRecord = {
  id: string;
  user_id: string;
  request_id: string;
  request_fingerprint: string;
  trace_id: string;
  lease_token: string;
  status: GenerationRunStatus;
  current_step: GenerationRunStep;
  attempt_count: number;
  platform_count: number;
  model_tier: "haiku" | "sonnet" | "opus" | null;
  credit_cost: number;
  credits_reserved: boolean;
  credits_refunded: boolean;
  content_kit_id: string | null;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  started_at: string | null;
  completed_at: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationRunClaim =
  | { outcome: "claimed"; run: GenerationRunRecord }
  | { outcome: "duplicate"; run: GenerationRunRecord }
  | { outcome: "conflict"; run: GenerationRunRecord };

export type GenerationFailure = {
  code:
    | "unauthorized"
    | "invalid_request"
    | "invalid_context"
    | "plan_limit"
    | "insufficient_credits"
    | "moderation_rejected"
    | "rate_limited"
    | "provider_unavailable"
    | "persistence_failed"
    | "execution_interrupted"
    | "generation_failed";
  message: string;
  retryable: boolean;
};

export class GenerationRunError extends Error {
  failure: GenerationFailure;

  constructor(failure: GenerationFailure) {
    super(failure.message);
    this.name = "GenerationRunError";
    this.failure = failure;
  }
}

const GENERATION_RUN_FIELDS = [
  "id",
  "user_id",
  "request_id",
  "request_fingerprint",
  "trace_id",
  "lease_token",
  "status",
  "current_step",
  "attempt_count",
  "platform_count",
  "model_tier",
  "credit_cost",
  "credits_reserved",
  "credits_refunded",
  "content_kit_id",
  "error_code",
  "error_message",
  "retryable",
  "started_at",
  "completed_at",
  "last_heartbeat_at",
  "created_at",
  "updated_at"
].join(",");

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * Client-supplied idempotency keys are opaque identifiers, never database
 * object names or query fragments. Missing/invalid keys become a fresh UUID
 * so old clients continue working without weakening the uniqueness boundary.
 */
export function resolveGenerationRequestId(headerValue: string | null): string {
  const candidate = headerValue?.trim();
  return candidate && IDEMPOTENCY_KEY_PATTERN.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A fingerprint detects accidental/malicious reuse of one idempotency key
 * with different input without retaining the user's raw source text.
 */
export async function hashGenerationRequest(input: unknown): Promise<string> {
  // Attribution is not generation input and must not invalidate idempotency.
  const payload = input && typeof input === "object" && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "analytics"))
    : input;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableJson(payload))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function decideGenerationRunClaim(
  existing: Pick<GenerationRunRecord, "request_fingerprint">,
  requestFingerprint: string
): "duplicate" | "conflict" {
  return existing.request_fingerprint === requestFingerprint
    ? "duplicate"
    : "conflict";
}

export async function claimGenerationRun(
  supabase: AdminClient,
  input: {
    userId: string;
    requestId: string;
    requestFingerprint: string;
    platformCount: number;
  }
): Promise<GenerationRunClaim> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("generation_runs")
    .insert({
      user_id: input.userId,
      request_id: input.requestId,
      request_fingerprint: input.requestFingerprint,
      status: "queued",
      current_step: "validate_request",
      platform_count: input.platformCount,
      last_heartbeat_at: now,
      updated_at: now
    })
    .select(GENERATION_RUN_FIELDS)
    .single();

  if (!error && data) {
    return {
      outcome: "claimed",
      run: data as unknown as GenerationRunRecord
    };
  }
  if (error?.code !== "23505") {
    throw error ?? new Error("Generation run was not created.");
  }

  const { data: existing, error: readError } = await supabase
    .from("generation_runs")
    .select(GENERATION_RUN_FIELDS)
    .eq("user_id", input.userId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) {
    throw new Error("Generation run disappeared while resolving idempotency.");
  }

  const run = existing as unknown as GenerationRunRecord;
  return {
    outcome: decideGenerationRunClaim(run, input.requestFingerprint),
    run
  };
}

export async function advanceGenerationRun(
  supabase: AdminClient,
  input: {
    runId: string;
    userId: string;
    leaseToken: string;
    step: GenerationRunStep;
    modelTier?: "haiku" | "sonnet" | "opus";
    creditCost?: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "running",
    current_step: input.step,
    last_heartbeat_at: now,
    updated_at: now,
    error_code: null,
    error_message: null,
    retryable: false
  };
  if (input.modelTier) patch.model_tier = input.modelTier;
  if (input.creditCost !== undefined) patch.credit_cost = input.creditCost;
  if (input.step === "reserve_credits") patch.started_at = now;

  const { data, error } = await supabase
    .from("generation_runs")
    .update(patch)
    .eq("id", input.runId)
    .eq("user_id", input.userId)
    .eq("lease_token", input.leaseToken)
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Generation run state could not be advanced.");
}

export async function completeGenerationRun(
  supabase: AdminClient,
  input: {
    runId: string;
    userId: string;
    leaseToken: string;
    contentKitId: string;
    partialSuccess?: boolean;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const partialSuccess = input.partialSuccess === true;
  const { data, error } = await supabase
    .from("generation_runs")
    .update({
      status: partialSuccess ? "partial_success" : "succeeded",
      current_step: "finalize",
      content_kit_id: input.contentKitId,
      completed_at: now,
      last_heartbeat_at: now,
      updated_at: now,
      error_code: partialSuccess ? "partial_platform_failure" : null,
      error_message: partialSuccess
        ? "Some requested platforms could not be generated; completed outputs were saved."
        : null,
      retryable: false
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId)
    .eq("lease_token", input.leaseToken)
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Generation run completion was not persisted.");
}

export async function reserveGenerationRunCredits(
  supabase: AdminClient,
  input: {
    runId: string;
    userId: string;
    leaseToken: string;
    amount: number;
    action: string;
    source: string;
    detail?: Record<string, unknown>;
  }
): Promise<number | null> {
  const { data, error } = await supabase.rpc(
    "reserve_generation_run_credits",
    {
      p_run_id: input.runId,
      p_user_id: input.userId,
      p_lease_token: input.leaseToken,
      p_amount: input.amount,
      p_action: input.action,
      p_source: input.source,
      p_detail: input.detail ?? null
    }
  );
  if (error) {
    console.error(
      "[generation-runs] atomic credit reservation failed:",
      JSON.stringify(error)
    );
    throw new Error("Failed to reserve credits. Please try again.");
  }
  const available = Number(data);
  return available < 0 ? null : available;
}

export async function assertGenerationRunLease(
  supabase: AdminClient,
  input: { runId: string; userId: string; leaseToken: string }
): Promise<void> {
  const { data, error } = await supabase
    .from("generation_runs")
    .select("id")
    .eq("id", input.runId)
    .eq("user_id", input.userId)
    .eq("lease_token", input.leaseToken)
    .eq("status", "running")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new GenerationRunError({
      code: "execution_interrupted",
      message: "This generation lease expired before the kit could be saved.",
      retryable: true
    });
  }
}

export async function failGenerationRun(
  supabase: AdminClient,
  input: {
    runId: string;
    userId: string;
    leaseToken: string;
    failure: GenerationFailure;
  }
): Promise<{ outcome: string; creditsRefunded: boolean }> {
  const { data, error } = await supabase.rpc("fail_generation_run", {
    p_run_id: input.runId,
    p_user_id: input.userId,
    p_lease_token: input.leaseToken,
    p_error_code: input.failure.code,
    p_error_message: input.failure.message,
    p_retryable: input.failure.retryable
  });
  if (error) throw error;
  const result = (data ?? {}) as {
    outcome?: string;
    creditsRefunded?: boolean;
  };
  return {
    outcome: result.outcome ?? "unknown",
    creditsRefunded: result.creditsRefunded === true
  };
}

export function classifyGenerationFailure(error: unknown): GenerationFailure {
  if (error instanceof GenerationRunError) {
    return error.failure;
  }
  const message =
    error instanceof Error
      ? error.message
      : "Failed to generate content kit.";
  const normalized = message.toLowerCase();

  if (message === "Unauthorized") {
    return {
      code: "unauthorized",
      message: "Please log in to generate content kits.",
      retryable: false
    };
  }
  if (error instanceof z.ZodError) {
    return { code: "invalid_request", message, retryable: false };
  }
  if (/plan supports|套餐最多支持/.test(normalized)) {
    return { code: "plan_limit", message, retryable: false };
  }
  if (/out of ai credits|创作点数已用完/.test(normalized)) {
    return { code: "insufficient_credits", message, retryable: false };
  }
  if (/growth mission|xiaohongshu workflow/.test(normalized)) {
    return { code: "invalid_context", message, retryable: false };
  }
  if (/moderation|内容安全|不支持生成/.test(normalized)) {
    return { code: "moderation_rejected", message, retryable: false };
  }
  if (error instanceof LLMRequestError && error.status === 429) {
    return { code: "rate_limited", message, retryable: true };
  }
  if (/\b429\b|rate.?limit|too many requests/.test(normalized)) {
    return { code: "rate_limited", message, retryable: true };
  }
  if (
    error instanceof LLMRequestError &&
    error.status >= 500
  ) {
    return { code: "provider_unavailable", message, retryable: true };
  }
  if (
    /llm request failed:\s*5\d\d|provider (?:down|unavailable)|all configured llm providers failed/.test(
      normalized
    )
  ) {
    return { code: "provider_unavailable", message, retryable: true };
  }
  if (/could not be saved|persistence|database|supabase/.test(normalized)) {
    return { code: "persistence_failed", message, retryable: true };
  }
  return { code: "generation_failed", message, retryable: true };
}

export function toPublicGenerationRun(run: GenerationRunRecord) {
  return {
    id: run.id,
    requestId: run.request_id,
    traceId: run.trace_id,
    status: run.status,
    currentStep: run.current_step,
    attemptCount: run.attempt_count,
    platformCount: run.platform_count,
    modelTier: run.model_tier,
    creditCost: run.credit_cost,
    creditsReserved: run.credits_reserved,
    creditsRefunded: run.credits_refunded,
    contentKitId: run.content_kit_id,
    error:
      run.error_code && run.error_message
        ? {
            code: run.error_code,
            message: run.error_message,
            retryable: run.retryable
          }
        : null,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    lastHeartbeatAt: run.last_heartbeat_at,
    createdAt: run.created_at,
    updatedAt: run.updated_at
  };
}
