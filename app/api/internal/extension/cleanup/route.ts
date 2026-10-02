import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Extension cleanup is not configured." }, { status: 503 });
  }
  const { error } = await supabase.rpc("cleanup_extension_v1_records");
  if (error) {
    console.error("[extension-cleanup] scheduled run failed");
    return NextResponse.json({ error: "Extension cleanup failed." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
