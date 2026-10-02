import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { createSupabaseAdminClient } from "@/lib/supabase";

// One-off / on-demand admin surface for the generation re-claim-loop
// incident (2026-08-06): queue invocations were dying silently after the
// paid model call, and nothing capped how many times a job could be
// re-claimed, so some generation_runs sat in "queued"/"running" for hours
// while their content_kit had already been persisted. Migration 073 stops
// new runs from getting stuck this way; this endpoint reconciles runs that
// were already stuck before that migration deployed, without waiting for
// the per-minute cron to work through them one lease-expiry at a time.
//
// Reuses recover_stale_generation_run (the same RPC dispatchGenerationOutbox
// calls to reap attempt-exhausted jobs) so every run is finalized through
// the audited path: a run with an already-persisted content_kit is marked
// succeeded and linked to it; a run with no kit is failed and its reserved
// credits refunded exactly once. No bespoke SQL, no double-refund risk.
const STALE_RUN_AGE_MS = 20 * 60 * 1000;

type ReconcileOutcome = {
  runId: string;
  outcome: string;
  status?: string;
  contentKitId?: string;
  creditsRefunded?: boolean;
  error?: string;
};

export async function POST() {
  try {
    await requireAdmin();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Generation persistence is unavailable." },
        { status: 503 }
      );
    }

    const staleBefore = new Date(Date.now() - STALE_RUN_AGE_MS).toISOString();
    const { data: staleRuns, error: fetchError } = await admin
      .from("generation_runs")
      .select("id, user_id, status, created_at")
      .in("status", ["queued", "running"])
      .lt("created_at", staleBefore);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const results: ReconcileOutcome[] = [];
    for (const run of staleRuns ?? []) {
      try {
        const { data, error } = await admin.rpc(
          "recover_stale_generation_run",
          { p_run_id: run.id, p_user_id: run.user_id }
        );
        if (error) throw error;
        const outcome = (data ?? {}) as {
          outcome?: string;
          status?: string;
          contentKitId?: string;
          creditsRefunded?: boolean;
        };
        results.push({
          runId: run.id,
          outcome: outcome.outcome ?? "unknown",
          status: outcome.status,
          contentKitId: outcome.contentKitId,
          creditsRefunded: outcome.creditsRefunded === true
        });
      } catch (runError) {
        results.push({
          runId: run.id,
          outcome: "error",
          error:
            runError instanceof Error ? runError.message : String(runError)
        });
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: staleRuns?.length ?? 0,
      reconciled: results.filter((r) => r.outcome === "reconciled").length,
      recovered: results.filter((r) => r.outcome === "recovered").length,
      busy: results.filter((r) => r.outcome === "busy").length,
      errors: results.filter((r) => r.outcome === "error").length,
      results
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "Forbidden") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Please log in." }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Request failed." }, { status: 400 });
  }
}
