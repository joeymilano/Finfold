import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { discoveryEnabled, enqueueSignalDiscovery, processSignalDiscovery } from "@/lib/signals/service";

export const maxDuration = 60;
export async function POST(request: Request) {
  if (!await verifyInternalWorkerRequest(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!discoveryEnabled()) return NextResponse.json({ ok: true, claimed: 0 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Signal storage unavailable." }, { status: 503 });
  try {
    // A separate minute owns scheduling/retention; work steps stay below 60 seconds.
    if (new Date().getUTCMinutes() % 15 === 0) {
      const due = await admin.rpc("due_signal_discovery_users");
      if (due.error) throw due.error;
      for (const row of due.data ?? []) await enqueueSignalDiscovery(admin, String(row.user_id), "scheduled");
      const cleanup = await admin.from("signal_discovery_jobs").delete().lt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).not("status", "in", "(queued,running)");
      if (cleanup.error) throw cleanup.error;
      return NextResponse.json({ ok: true, claimed: 0, scheduled: due.data?.length ?? 0 });
    }
    return NextResponse.json({ ok: true, ...await processSignalDiscovery(admin) });
  } catch (error) {
    console.error("[signal-discovery] process failed", error instanceof Error ? `${error.name}: ${error.message}` : "storage_error");
    return NextResponse.json({ error: "Signal discovery processing failed." }, { status: 503 });
  }
}
