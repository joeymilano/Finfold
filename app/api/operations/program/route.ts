import { NextResponse } from "next/server";
import {
  assertOperatingProgramCanActivate,
  EMPTY_OPERATING_PROGRAM,
  mapOperatingProgram,
  normalizeOperatingProgramInput,
  OPERATING_PROGRAM_FIELDS,
  toOperatingProgramRow
} from "@/lib/operations/program";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { ensureOperatingProgramWeeklyTasks } from "@/lib/operations/weekly-tasks";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json({ program: null, defaults: EMPTY_OPERATING_PROGRAM, persisted: false });
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Operating program") },
        { status: 503 }
      );
    }

    const { data, error } = await admin
      .from("operating_programs")
      .select(OPERATING_PROGRAM_FIELDS)
      .eq("user_id", userId)
      .in("status", ["draft", "active", "paused"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      program: data ? mapOperatingProgram(data as never) : null,
      defaults: EMPTY_OPERATING_PROGRAM,
      persisted: Boolean(data)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load your operating program." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load the operating program." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = normalizeOperatingProgramInput(await request.json());
    if (input.platform !== "xiaohongshu") {
      throw new Error("Only Xiaohongshu operating programs are currently available.");
    }
    assertOperatingProgramCanActivate(input);
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        const now = new Date().toISOString();
        return NextResponse.json({
          program: { ...input, id: "local-operating-program", createdAt: now, updatedAt: now },
          persisted: false
        });
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Operating program") },
        { status: 503 }
      );
    }

    const { data, error } = await admin
      .from("operating_programs")
      .upsert(toOperatingProgramRow(input, userId), { onConflict: "user_id,platform" })
      .select(OPERATING_PROGRAM_FIELDS)
      .single();
    if (error) throw error;

    const program = mapOperatingProgram(data as never);
    let queue = null;
    if (program.status === "active") {
      try {
        queue = await ensureOperatingProgramWeeklyTasks(admin, userId, program);
      } catch (error) {
        // The business brief has already been saved. A transient queue refresh
        // must not make the user retry the write and accidentally duplicate it;
        // Dashboard and the scheduled patrol will reconcile idempotently.
        console.error("[operations/program] weekly queue refresh failed:", error);
      }
    }

    return NextResponse.json({ program, queue, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save your operating program." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the operating program." },
      { status: 400 }
    );
  }
}
