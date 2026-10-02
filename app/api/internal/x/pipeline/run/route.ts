import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { runXMorningGeneration } from "@/lib/x-pipeline/generate";
import { runXEngagementPass } from "@/lib/x-pipeline/replies";
import { xPipelineEnabled } from "@/lib/x-pipeline/settings";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!xPipelineEnabled()) {
    return NextResponse.json({ ok: true, skipped: "x_pipeline_disabled" });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "X pipeline persistence is unavailable." }, { status: 503 });
  let phase: unknown;
  try {
    const body = await request.json().catch(() => ({}));
    phase = (body as { phase?: unknown }).phase;
  } catch {
    phase = undefined;
  }
  try {
    // Morning cron: draft posts. Evening cron: engagement replies. A missing
    // phase runs both, which keeps manual smoke tests one call.
    if (phase !== "engagement") {
      const generation = await runXMorningGeneration(admin);
      if (phase === "generation") return NextResponse.json({ ok: true, generation });
    }
    const engagement = await runXEngagementPass(admin);
    return NextResponse.json({ ok: true, engagement });
  } catch (error) {
    console.error("[x-pipeline] run failed:", error);
    return NextResponse.json({ error: "X pipeline run failed." }, { status: 503 });
  }
}
