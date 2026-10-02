import { capturePersistedGenerationOutcome } from "@/lib/generation-analytics";

import { NextResponse } from "next/server";
import {
  generationRunStatusSchema,
  generationRunStepSchema,
  toPublicGenerationRun,
  type GenerationRunRecord
} from "@/lib/generation-runs";
import {
  createSupabaseAdminClient,
  getCurrentUserId
} from "@/lib/supabase";
import {
  isLocalMockMode,
  persistenceUnavailableMessage
} from "@/lib/runtime-mode";

const RUN_FIELDS = [
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { runId } = await params;
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      if (isLocalMockMode()) {
        return NextResponse.json(
          { error: "Generation run tracking is not persisted in local mock mode." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Generation run") },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_FIELDS)
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Generation run not found." },
        { status: 404 }
      );
    }

    const run = data as unknown as GenerationRunRecord;
    generationRunStatusSchema.parse(run.status);
    generationRunStepSchema.parse(run.current_step);
    if (["succeeded", "partial_success", "failed", "cancelled"].includes(run.status)) {
      await capturePersistedGenerationOutcome(supabase, run.id, userId);
    }
    return NextResponse.json({ run: toPublicGenerationRun(run) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to view this generation run." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load generation run."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { runId } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Generation cancellation") },
        { status: 503 }
      );
    }

    const { data: result, error: cancelError } = await supabase.rpc(
      "cancel_generation_run",
      { p_run_id: runId, p_user_id: userId }
    );
    if (cancelError) throw cancelError;
    const outcome = (result ?? {}) as { outcome?: string };
    if (outcome.outcome === "not_found") {
      return NextResponse.json(
        { error: "Generation run not found." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("generation_runs")
      .select(RUN_FIELDS)
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Generation run not found." },
        { status: 404 }
      );
    }
    const run = data as unknown as GenerationRunRecord;
    if (["succeeded", "partial_success", "failed", "cancelled"].includes(run.status)) {
      await capturePersistedGenerationOutcome(supabase, run.id, userId);
    }
    return NextResponse.json({ run: toPublicGenerationRun(run) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to cancel this generation run." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to cancel generation run."
      },
      { status: 400 }
    );
  }
}
