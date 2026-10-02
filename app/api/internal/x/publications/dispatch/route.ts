import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchXPublicationJobs } from "@/lib/x-pipeline/jobs";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "X publication persistence is unavailable." }, { status: 503 });
  try {
    const result = await dispatchXPublicationJobs(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[x-publication] dispatch failed:", error);
    return NextResponse.json({ error: "X publication dispatch failed." }, { status: 503 });
  }
}
