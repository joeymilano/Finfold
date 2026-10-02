import type { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { GenerationRunRecord } from "@/lib/generation-runs";
import { normalizeGenerationAnalytics, type GenerationAnalyticsContext } from "@/lib/generation-analytics-context";
import { captureServerEvent } from "@/lib/posthog-server";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const fields = "id,user_id,request_id,status,platform_count,content_kit_id,credit_cost,error_code,created_at,completed_at";
export type AnalyticsRun = Pick<GenerationRunRecord, "id" | "user_id" | "request_id" | "status" | "platform_count" | "content_kit_id" | "credit_cost" | "error_code" | "created_at" | "completed_at">;

export function generationOutcomeEvent(run: AnalyticsRun): string | null {
  if ((run.status === "succeeded" || run.status === "partial_success") && run.content_kit_id) return "kit_generation_completed";
  if (run.status === "failed") return "kit_generation_failed";
  if (run.status === "cancelled") return "kit_generation_cancelled";
  return null;
}

/** Reads durable state, never infers completion from a closed browser stream.
 * Recovery reads can retry delivery with the same UUID and original timestamp.
 * PostHog deduplication is eventual; analytical queries should also dedupe run_id.
 */
export async function capturePersistedGenerationOutcome(
  admin: AdminClient,
  runId: string,
  userId: string,
  context?: GenerationAnalyticsContext
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    const { data, error } = await admin.from("generation_runs").select(fields).eq("id", runId).eq("user_id", userId).maybeSingle();
    if (error || !data) return;
    const run = data as AnalyticsRun;
    const event = generationOutcomeEvent(run);
    if (!event || !run.completed_at) return;
    if (!context) {
      const { data: job } = await admin.from("generation_jobs").select("analytics:payload->analytics").eq("run_id", runId).eq("user_id", userId).maybeSingle();
      if (!job?.analytics) return; // Never replace original context with guesses during recovery.
      context = normalizeGenerationAnalytics(job.analytics);
    }
    const duration = Date.parse(run.completed_at) - Date.parse(run.created_at);
    await captureServerEvent(userId, event, {
      ...context,
      is_test_traffic: context.traffic_class === "qa" ? "true" : context.traffic_class === "production" ? "false" : "unknown",
      analytics_version: 2,
      outcome_source: "persisted_run",
      generationRunId: run.id,
      generationRequestId: run.request_id,
      kit_id: run.content_kit_id,
      status: run.status,
      platformCount: run.platform_count,
      credit_cost: run.credit_cost,
      error_code: run.error_code,
      ...(Number.isFinite(duration) && duration >= 0 ? { durationMs: duration } : {})
    }, { idempotencyKey: `generation:${run.id}:${event}`, timestamp: run.completed_at });
  } catch {
    // Telemetry cannot turn a persisted success into a failure/refund.
    console.warn("[generation-analytics] outcome delivery unavailable");
  }
}
