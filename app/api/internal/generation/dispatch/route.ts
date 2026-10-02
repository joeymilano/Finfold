import { NextResponse } from "next/server";
import { dispatchGenerationOutbox } from "@/lib/generation-jobs";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Generation persistence is unavailable." },
      { status: 503 }
    );
  }
  try {
    const result = await dispatchGenerationOutbox(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[generation-outbox] dispatch failed:", error);
    return NextResponse.json(
      { error: "Generation outbox dispatch failed." },
      { status: 503 }
    );
  }
}
