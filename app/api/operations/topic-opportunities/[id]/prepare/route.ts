import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import {
  buildTopicOpportunityGenerationRequest,
  loadTopicOpportunity
} from "@/lib/trends/service";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(120);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const idempotencyKey = idempotencyKeySchema.parse(request.headers.get("Idempotency-Key") ?? "");
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Opportunity preparation requires persistent storage." }, { status: 503 });
    const body = await request.json().catch(() => ({})) as { outcome?: unknown };
    if (body.outcome === "failed") {
      const { error } = await admin
        .from("topic_opportunities")
        .update({ preparation_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("preparation_idempotency_key", idempotencyKey)
        .neq("preparation_status", "ready");
      if (error) throw error;
      return NextResponse.json({ status: "failed" });
    }

    const opportunity = await loadTopicOpportunity(admin, userId, id, { personalize: true });
    if (!opportunity) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

    const { data: claims, error: claimError } = await admin.rpc("claim_topic_opportunity_preparation", {
      p_opportunity_id: id,
      p_user_id: userId,
      p_idempotency_key: idempotencyKey
    });
    if (claimError) throw claimError;
    const claim = Array.isArray(claims) ? claims[0] : claims;
    const outcome = String(claim?.outcome ?? "not_found");
    if (outcome === "not_found") return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    if (outcome === "inactive") return NextResponse.json({ error: "This opportunity is no longer active." }, { status: 409 });
    if (outcome === "conflict") {
      return NextResponse.json({ error: "This opportunity was already confirmed with another request." }, { status: 409 });
    }
    if (outcome === "invalid_key") return NextResponse.json({ error: "Invalid idempotency key." }, { status: 400 });
    if (claim?.existing_content_kit_id) {
      return NextResponse.json({
        status: "ready",
        contentKitId: String(claim.existing_content_kit_id),
        replayed: true
      });
    }

    const generationRequest = await buildTopicOpportunityGenerationRequest(admin, userId, opportunity);
    return NextResponse.json({
      status: "confirmed",
      replayed: outcome === "replayed",
      idempotencyKey,
      generationRequest
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "登录后才能让 Agent 准备内容。" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare this opportunity." }, { status: 400 });
  }
}
