import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { contentPipelineKillSwitchOn } from "@/lib/content-pipeline/settings";
import { runDailyArticleGeneration } from "@/lib/content-pipeline/generate";
import { runDailyCardGeneration } from "@/lib/content-pipeline/cards";

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!contentPipelineKillSwitchOn()) {
    return NextResponse.json({ ok: true, skipped: "content_pipeline_disabled" });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Content pipeline persistence is unavailable." }, { status: 503 });
  let phase: unknown;
  let userId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    phase = (body as { phase?: unknown }).phase;
    const rawUserId = (body as { userId?: unknown }).userId;
    if (typeof rawUserId === "string" && rawUserId.length > 0) userId = rawUserId;
  } catch {
    phase = undefined;
  }
  try {
    // Morning cron (10:30) drafts articles; night cron (21:30) builds card
    // sets. A missing phase runs both, which keeps manual smoke tests one call.
    if (phase !== "cards") {
      const generation = await runDailyArticleGeneration(admin, userId ? { userId } : {});
      if (phase === "articles") return NextResponse.json({ ok: true, generation });
    }
    const cards = await runDailyCardGeneration(admin, userId ? { userId } : {});
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    console.error("[content-pipeline] run failed:", error);
    return NextResponse.json({ error: "Content pipeline run failed." }, { status: 503 });
  }
}
