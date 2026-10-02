import { NextResponse } from "next/server";
import { deadLetterGenerationJob } from "@/lib/generation-jobs";
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
    const body = (await request.json()) as {
      message?: unknown;
      error?: string;
    };
    const result = await deadLetterGenerationJob(
      admin,
      body.message,
      body.error
    );
    if (result.outcome === "busy") {
      return NextResponse.json(
        { ok: false, ...result },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[generation-dlq] terminalization failed:", error);
    return NextResponse.json(
      { error: "Generation dead-letter handling failed." },
      { status: 503 }
    );
  }
}
