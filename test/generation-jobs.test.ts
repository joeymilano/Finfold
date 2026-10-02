import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { generationJobMessageSchema } from "@/lib/generation-jobs";

// Self-host (www.finfold.cn) runs plain `next start`: there is no Cloudflare
// runtime, so the context accessor throws exactly like it does outside a
// Worker. The behavioral test below locks in the fallback contract.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("getCloudflareContext was called in a non-Cloudflare context.");
  }
}));

import { publishGenerationJob } from "@/lib/generation-jobs";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const TEST_JOB = {
  id: "4f2ae18d-3c41-49d3-89f1-10f6e6c9863a",
  run_id: "a8e77c3e-2687-40f2-849f-b90f67c548eb"
} as const;

describe("durable generation jobs", () => {
  it("accepts only opaque, versioned queue messages", () => {
    expect(
      generationJobMessageSchema.parse({
        schemaVersion: 1,
        jobId: "4f2ae18d-3c41-49d3-89f1-10f6e6c9863a",
        runId: "a8e77c3e-2687-40f2-849f-b90f67c548eb"
      })
    ).toMatchObject({ schemaVersion: 1 });
    expect(() =>
      generationJobMessageSchema.parse({
        schemaVersion: 2,
        jobId: "private prompt leaked into queue"
      })
    ).toThrow();
  });

  it("ships a transactional outbox, database leases, attempts, and terminal payload erasure", () => {
    const migration = source(
      "supabase/migrations/058_durable_generation_jobs.sql"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.generation_jobs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.generation_run_attempts");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_generation_job");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_generation_job");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("v_job.available_at > now()");
    expect(migration).toContain("lease_expires_at > now()");
    expect(migration).toContain("payload = '{}'::jsonb");
    expect(migration).toContain("record_generation_attempt_model");
    expect(migration).toContain("'partial_success'");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("configures one-at-a-time Queue batches, bounded concurrency, retries, DLQ, and cron recovery", () => {
    const config = source("wrangler.toml");
    const worker = source("worker.ts");
    const scheduling = source("lib/worker-scheduling.ts");

    expect(config).toContain('main = "worker.ts"');
    expect(config).toContain('queue = "finfold-generation-jobs"');
    expect(config).toContain("max_batch_size = 1");
    // The concurrency cap is tuned operationally (see the wrangler.toml
    // comment), so assert a sane bounded cap exists rather than pinning a
    // specific number — pinning it breaks CI on every legitimate throughput
    // adjustment (e.g. the 3 -> 6 staged increase).
    const concurrencyMatch = config.match(/max_concurrency = (\d+)/);
    expect(concurrencyMatch).not.toBeNull();
    expect(Number(concurrencyMatch![1])).toBeGreaterThanOrEqual(3);
    expect(config).toContain('dead_letter_queue = "finfold-generation-jobs-dlq"');
    expect(config).toContain('GENERATION_QUEUE_NAME = "finfold-generation-jobs"');
    expect(config).toContain('GENERATION_DLQ_NAME = "finfold-generation-jobs-dlq"');
    // The exact cron list grows with scheduled features (e.g. the X pipeline
    // daily runs); the generation queue only needs the every-minute recovery
    // cron and the daily outbox sweep to be present.
    const cronsMatch = config.match(/crons = \[([^\]]+)\]/);
    expect(cronsMatch).not.toBeNull();
    const declaredCrons = cronsMatch![1].match(/"[^"]+"/g) ?? [];
    expect(declaredCrons).toContain('"* * * * *"');
    expect(declaredCrons).toContain('"17 2 * * *"');
    expect(worker).toContain("configuredQueueNames(env)");
    expect(worker).toContain("batch.queue === queueNames.generation");
    expect(worker).toContain("batch.queue === queueNames.deadLetter");
    expect(worker).toContain("message.ack()");
    expect(worker).toContain("message.retry(");
    expect(worker).toContain("MAX_INTERNAL_RESPONSE_BYTES");
    expect(worker).toContain("/api/internal/generation/dead-letter");
    expect(worker).toContain("runWorkerSchedule");
    expect(scheduling).toContain("/api/internal/generation/dispatch");
    expect(scheduling).toContain("generation_outbox_dispatch_completed");
    expect(scheduling).toContain("generation_outbox_schedule_failed");
  });

  it("keeps the public request short and executes generation only through a claimed internal job", () => {
    const route = source("app/api/generate/route.ts");

    expect(route).toContain('process.env.GENERATION_EXECUTION_MODE === "queue"');
    expect(route).toContain("createQueuedGenerationRun");
    expect(route).toContain('emit("queued"');
    expect(route).toContain("claimGenerationJob");
    expect(route).toContain("queueAttempt: claim.attemptNumber");
    expect(route).toContain("recordGenerationAttemptModel");
    expect(route).toContain("model-call heartbeat failed");
    expect(route).toContain("retryGenerationJob");
    expect(route).toContain("finishGenerationJob");
    expect(route).toContain('claim.outcome === "reconciled"');
  });

  it("caps re-claims and reconciles an already-persisted kit instead of re-running generation forever", () => {
    const migration = source(
      "supabase/migrations/073_generation_attempt_containment.sql"
    );

    expect(migration).toContain("v_max_attempts CONSTANT integer := 5");
    expect(migration).toContain("'attempt_limit_exhausted'");
    expect(migration).toContain("'outcome', 'reconciled'");
    expect(migration).toContain("FROM public.content_kits");
    expect(migration).toContain("v_run.created_at > now() - interval '20 minutes'");
  });

  it("reaps attempt-exhausted jobs from the outbox instead of republishing them forever", () => {
    const jobs = source("lib/generation-jobs.ts");
    const scheduling = source("lib/worker-scheduling.ts");

    expect(jobs).toContain("MAX_OUTBOX_REPUBLISH_ATTEMPTS");
    expect(jobs).toContain("recover_stale_generation_run");
    expect(jobs).toContain("reaped");
    expect(scheduling).toContain("reaped: result.reaped");
  });

  it("raises the Worker CPU limit to the Paid-plan maximum so generation is never CPU-killed", () => {
    // The account is now on the Workers Paid plan, so [limits] cpu_ms is
    // supported (the Free plan rejected it with "CPU limits are not supported
    // for the Free plan"). We raise it to the 5-minute Paid ceiling (300000ms)
    // so multi-platform generation — Qwen/DeepSeek failover plus image gen
    // across many platforms — can never be killed mid-run by Cloudflare
    // Error 1102 (CPU exceeded) the way it was under the Free 10ms/50ms cap.
    // Migration 073's attempt cap + reconcile-before-reclaim keep a killed
    // invocation safe regardless.
    const config = source("wrangler.toml");
    expect(config).toMatch(/^\[limits\]/m);
    expect(config).toContain("cpu_ms = 300000");
    expect(config).toContain("Paid plan is now active");
  });

  it("defers dispatch instead of throwing when no Cloudflare runtime exists (self-host CN deploy)", async () => {
    // Outside a Cloudflare Worker, publishing must resolve quietly and leave
    // the outbox row pending (no mark_generation_job_published RPC) so the
    // local scheduler daemon can claim it. Throwing here would make every
    // CN-site generation log a spurious dispatch delay.
    const rpc = vi.fn();
    await expect(
      publishGenerationJob(
        rpc as unknown as Parameters<typeof publishGenerationJob>[0],
        TEST_JOB
      )
    ).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ships a self-host scheduler that mirrors the Cloudflare consumer and cron contracts", () => {
    const scheduler = source("scripts/cn/scheduler.mjs");
    const deployGuide = source("docs/deploy-cn.md");

    // Queue-consumer contract parity with worker.ts.
    expect(scheduler).toContain("/api/generate");
    expect(scheduler).toContain('"x-finfold-internal-worker-secret"');
    expect(scheduler).toContain('"x-finfold-queue-attempt"');
    expect(scheduler).toContain("parseWorkerOutcome");
    // Outbox selection matches dispatchGenerationOutbox's pending sweep.
    expect(scheduler).toContain("&status=eq.pending&available_at=lte.");
    // All four main-Worker crons plus the watch-poller schedules, in UTC.
    for (const cron of [
      '"* * * * *"',
      '"17 2 * * *"',
      '"0 0 * * *"',
      '"30 12 * * *"',
      '"30 * * * *"',
      '"15 1 * * *"',
      '"0 4 * * 1"'
    ]) {
      expect(scheduler).toContain(cron);
    }
    // The watch-poller jobs stay wired (trends, performance, patrol, demand).
    expect(scheduler).toContain("/api/internal/trends/sync");
    expect(scheduler).toContain("/api/performance/poll");
    expect(scheduler).toContain("/api/performance/distill");
    expect(scheduler).toContain("/api/agent/patrol");
    expect(scheduler).toContain("/api/operations/demand-signals");
    // Deployment artifacts exist alongside the daemon.
    expect(deployGuide).toContain("finfold-scheduler.service");
    expect(source("scripts/cn/finfold-web.service")).toContain("EnvironmentFile=/opt/finfold/.env.cn");
    expect(source("scripts/cn/finfold-scheduler.service")).toContain("scripts/cn/scheduler.mjs");
  });
});
