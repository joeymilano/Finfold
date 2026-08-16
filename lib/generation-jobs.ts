import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { GenerateRequest } from "@/lib/content-schema";
import type { ModelAttemptAudit } from "@/lib/llm";
import {
  generationRunStatusSchema,
  type GenerationFailure,
  type GenerationRunRecord
} from "@/lib/generation-runs";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  getStagingGenerationFaultMode
} from "@/lib/staging-fault-injection";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const generationJobMessageSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().uuid(),
  runId: z.string().uuid()
});

export type GenerationJobMessage = z.infer<
  typeof generationJobMessageSchema
>;

export type GenerationJobRecord = {
  id: string;
  run_id: string;
  user_id: string;
  schema_version: number;
  payload: GenerateRequest;
  status:
    | "pending"
    | "published"
    | "processing"
    | "partial_success"
    | "succeeded"
    | "failed"
    | "cancelled";
  dispatch_attempt_count: number;
  attempt_count: number;
  available_at: string;
  published_at: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationJobClaim =
  | {
      outcome: "claimed";
      run: GenerationRunRecord;
      job: GenerationJobRecord;
      leaseToken: string;
      attemptNumber: number;
    }
  | { outcome: "busy" | "not_found" }
  | {
      outcome: "terminal";
      status: z.infer<typeof generationRunStatusSchema>;
      run: GenerationRunRecord;
    }
  // The content kit this job was supposed to produce already exists —
  // a prior invocation died after persisting it but before the terminal
  // write. claim_generation_job reconciled the run to succeeded instead
  // of re-running (and re-billing) generation.
  | { outcome: "reconciled"; contentKitId: string };

export type QueuedGenerationClaim = {
  outcome: "claimed" | "duplicate" | "conflict";
  run: GenerationRunRecord;
  job: GenerationJobRecord | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseRun(value: unknown): GenerationRunRecord {
  const run = asRecord(value) as GenerationRunRecord;
  generationRunStatusSchema.parse(run.status);
  return run;
}

function parseJob(value: unknown): GenerationJobRecord {
  const job = asRecord(value) as GenerationJobRecord;
  generationJobMessageSchema.shape.jobId.parse(job.id);
  generationJobMessageSchema.shape.runId.parse(job.run_id);
  return job;
}

export async function createQueuedGenerationRun(
  admin: AdminClient,
  input: {
    userId: string;
    requestId: string;
    requestFingerprint: string;
    platformCount: number;
    payload: GenerateRequest;
  }
): Promise<QueuedGenerationClaim> {
  const { data, error } = await admin.rpc("create_generation_job", {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_request_fingerprint: input.requestFingerprint,
    p_platform_count: input.platformCount,
    p_payload: input.payload
  });
  if (error) throw error;
  const result = asRecord(data);
  const outcome = result.outcome;
  if (
    outcome !== "claimed" &&
    outcome !== "duplicate" &&
    outcome !== "conflict"
  ) {
    throw new Error("Generation job returned an invalid claim outcome.");
  }
  return {
    outcome,
    run: parseRun(result.run),
    job: result.job ? parseJob(result.job) : null
  };
}

export async function publishGenerationJob(
  admin: AdminClient,
  job: Pick<GenerationJobRecord, "id" | "run_id">
): Promise<void> {
  const { env } = getCloudflareContext();
  if (!env.GENERATION_QUEUE) {
    throw new Error("Generation queue binding is unavailable.");
  }
  const message: GenerationJobMessage = {
    schemaVersion: 1,
    jobId: job.id,
    runId: job.run_id
  };
  // Resolve before the first side effect so a production misconfiguration
  // fails closed without publishing even one test-controlled message.
  const faultMode = getStagingGenerationFaultMode();
  await env.GENERATION_QUEUE.send(message, { contentType: "json" });
  if (faultMode === "duplicate_queue_delivery") {
    await env.GENERATION_QUEUE.send(message, { contentType: "json" });
  }
  const { error } = await admin.rpc("mark_generation_job_published", {
    p_job_id: job.id,
    p_run_id: job.run_id
  });
  if (error) throw error;
}

export async function claimGenerationJob(
  admin: AdminClient,
  rawMessage: unknown,
  options: { leaseSeconds?: number } = {}
): Promise<GenerationJobClaim> {
  const message = generationJobMessageSchema.parse(rawMessage);
  const leaseSeconds = options.leaseSeconds ?? 900;
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
    throw new Error("Generation job lease must be between 5 and 900 seconds.");
  }
  const { data, error } = await admin.rpc("claim_generation_job", {
    p_job_id: message.jobId,
    p_run_id: message.runId,
    p_lease_seconds: leaseSeconds
  });
  if (error) throw error;
  const result = asRecord(data);
  if (result.outcome === "busy" || result.outcome === "not_found") {
    return { outcome: result.outcome };
  }
  if (result.outcome === "terminal") {
    return {
      outcome: "terminal",
      status: generationRunStatusSchema.parse(result.status),
      run: parseRun(result.run)
    };
  }
  if (result.outcome === "reconciled") {
    return {
      outcome: "reconciled",
      contentKitId: z.string().uuid().parse(result.contentKitId)
    };
  }
  if (result.outcome !== "claimed") {
    throw new Error("Generation job returned an invalid lease outcome.");
  }
  return {
    outcome: "claimed",
    run: parseRun(result.run),
    job: parseJob(result.job),
    leaseToken: z.string().uuid().parse(result.leaseToken),
    attemptNumber: z.number().int().positive().parse(result.attemptNumber)
  };
}

export async function heartbeatGenerationJob(
  admin: AdminClient,
  input: {
    jobId: string;
    runId: string;
    leaseToken: string;
    step: string;
  }
): Promise<void> {
  const { data, error } = await admin.rpc("heartbeat_generation_job", {
    p_job_id: input.jobId,
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_step: input.step,
    p_lease_seconds: 900
  });
  if (error) throw error;
  if (data !== true) throw new Error("Generation job lease was lost.");
}

export async function recordGenerationAttemptModel(
  admin: AdminClient,
  input: {
    runId: string;
    leaseToken: string;
    audit: ModelAttemptAudit;
  }
): Promise<void> {
  const { data, error } = await admin.rpc("record_generation_attempt_model", {
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_provider: input.audit.provider,
    p_model: input.audit.model,
    p_prompt_version: input.audit.promptVersion,
    p_input_tokens: input.audit.inputTokens,
    p_output_tokens: input.audit.outputTokens,
    p_total_tokens: input.audit.totalTokens,
    p_estimated_cost_usd: input.audit.estimatedCostUsd
  });
  if (error) throw error;
  if (data !== true) throw new Error("Generation attempt audit lease was lost.");
}

export async function finishGenerationJob(
  admin: AdminClient,
  input: {
    jobId: string;
    runId: string;
    leaseToken: string;
    status: "partial_success" | "succeeded" | "failed" | "cancelled";
    failure?: GenerationFailure;
  }
): Promise<void> {
  const { data, error } = await admin.rpc("finish_generation_job", {
    p_job_id: input.jobId,
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_status: input.status,
    p_error_code: input.failure?.code ?? null,
    p_error_message: input.failure?.message ?? null
  });
  if (error) throw error;
  if (data !== true) throw new Error("Generation job terminal write was lost.");
}

export async function retryGenerationJob(
  admin: AdminClient,
  input: {
    jobId: string;
    runId: string;
    leaseToken: string;
    failure: GenerationFailure;
    delaySeconds: number;
  }
): Promise<void> {
  const { data, error } = await admin.rpc("retry_generation_job", {
    p_job_id: input.jobId,
    p_run_id: input.runId,
    p_lease_token: input.leaseToken,
    p_error_code: input.failure.code,
    p_error_message: input.failure.message,
    p_delay_seconds: input.delaySeconds
  });
  if (error) throw error;
  if (data !== true) throw new Error("Generation job retry lease was lost.");
}

export async function deadLetterGenerationJob(
  admin: AdminClient,
  rawMessage: unknown,
  errorMessage?: string
): Promise<Record<string, unknown>> {
  const message = generationJobMessageSchema.parse(rawMessage);
  const { data, error } = await admin.rpc("dead_letter_generation_job", {
    p_job_id: message.jobId,
    p_run_id: message.runId,
    p_error_message:
      errorMessage ?? "Generation exhausted its queue retries."
  });
  if (error) throw error;
  return asRecord(data);
}

// A job whose lease has expired this many times without reaching a
// terminal state is not going to complete by being republished again —
// claim_generation_job's own cap would fail it anyway (see migration 073),
// but reaping it here first avoids a wasted queue round-trip and Worker
// invocation, and gives this dispatch pass visibility into how many jobs
// were dropped rather than retried.
const MAX_OUTBOX_REPUBLISH_ATTEMPTS = 5;

export async function dispatchGenerationOutbox(
  admin: AdminClient,
  limit = 50
): Promise<{ published: number; failed: number; reaped: number }> {
  const now = new Date();
  const stalePublishedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const [pendingResult, staleResult, abandonedResult] = await Promise.all([
    admin
      .from("generation_jobs")
      .select("id, run_id, user_id, attempt_count")
      .eq("status", "pending")
      .lte("available_at", now.toISOString())
      .order("created_at", { ascending: true })
      .limit(limit),
    admin
      .from("generation_jobs")
      .select("id, run_id, user_id, attempt_count")
      .eq("status", "published")
      .lte("available_at", now.toISOString())
      .lt("published_at", stalePublishedAt)
      .order("published_at", { ascending: true })
      .limit(limit),
    admin
      .from("generation_jobs")
      .select("id, run_id, user_id, attempt_count")
      .eq("status", "processing")
      .lt("lease_expires_at", now.toISOString())
      .order("lease_expires_at", { ascending: true })
      .limit(limit)
  ]);
  if (pendingResult.error) throw pendingResult.error;
  if (staleResult.error) throw staleResult.error;
  if (abandonedResult.error) throw abandonedResult.error;

  const jobs = new Map<
    string,
    { id: string; run_id: string; user_id: string; attempt_count: number }
  >();
  for (const job of [
    ...(pendingResult.data ?? []),
    ...(staleResult.data ?? []),
    ...(abandonedResult.data ?? [])
  ]) {
    jobs.set(job.id, job);
  }

  let published = 0;
  let failed = 0;
  let reaped = 0;
  for (const job of jobs.values()) {
    if (job.attempt_count >= MAX_OUTBOX_REPUBLISH_ATTEMPTS) {
      try {
        await admin.rpc("recover_stale_generation_run", {
          p_run_id: job.run_id,
          p_user_id: job.user_id
        });
        reaped += 1;
      } catch (error) {
        failed += 1;
        console.error("[generation-outbox] reap failed:", {
          jobId: job.id,
          runId: job.run_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }
    try {
      await publishGenerationJob(admin, job);
      published += 1;
    } catch (error) {
      failed += 1;
      console.error("[generation-outbox] publish failed:", {
        jobId: job.id,
        runId: job.run_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { published, failed, reaped };
}
