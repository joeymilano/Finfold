
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  getCurrentUserId
} from "@/lib/supabase";
import {
  isLocalMockMode,
  persistenceUnavailableMessage
} from "@/lib/runtime-mode";

type RecoveryResult = {
  outcome?:
    | "recovered"
    | "reconciled"
    | "busy"
    | "terminal"
    | "not_found";
  status?: string;
  creditsRefunded?: boolean;
};

export async function POST(
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
          { error: "Generation recovery is unavailable in local mock mode." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Generation recovery") },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc(
      "recover_stale_generation_run",
      {
        p_run_id: runId,
        p_user_id: userId
      }
    );
    if (error) throw error;

    const result = (data ?? {}) as RecoveryResult;
    if (result.outcome === "not_found") {
      return NextResponse.json(
        { error: "Generation run not found." },
        { status: 404 }
      );
    }
    if (result.outcome === "busy") {
      return NextResponse.json(
        {
          recovered: false,
          outcome: "busy",
          error: "Generation is still active and cannot be recovered yet."
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      recovered:
        result.outcome === "recovered" ||
        result.outcome === "reconciled",
      outcome: result.outcome ?? "unknown",
      status: result.status ?? null,
      creditsRefunded: result.creditsRefunded === true
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to recover this generation." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to recover generation."
      },
      { status: 400 }
    );
  }
}
