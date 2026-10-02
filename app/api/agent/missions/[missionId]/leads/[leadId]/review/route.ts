import { NextResponse } from "next/server";
import { z } from "zod";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const paramsSchema = z.object({
  missionId: z.string().uuid(),
  leadId: z.string().uuid()
});
const reviewSchema = z.object({ decision: z.enum(["qualify", "reject"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string; leadId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const identifiers = paramsSchema.parse(await params);
    const review = reviewSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Lead review requires durable storage." }, { status: 503 });
    }

    const { data, error } = await admin.rpc("review_native_lead_candidate", {
      p_user_id: userId,
      p_mission_id: identifiers.missionId,
      p_lead_submission_id: identifiers.leadId,
      p_decision: review.decision
    });
    if (error) throw error;
    const result = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    if (result.replayed !== true) {
      await captureServerEvent(userId, "native_lead_reviewed", {
        mission_id: identifiers.missionId,
        decision: review.decision,
        counted_as_lead: review.decision === "qualify"
      });
    }
    return NextResponse.json({
      status: result.status,
      replayed: result.replayed === true,
      countedAsLead: review.decision === "qualify"
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to review lead submissions." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Lead review request is invalid." }, { status: 400 });
    }
    const code = databaseErrorCode(error);
    if (code === "P0002") return NextResponse.json({ error: "Lead submission not found." }, { status: 404 });
    if (code === "P0001") return NextResponse.json({ error: "This lead can no longer be reviewed." }, { status: 409 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review this lead." },
      { status: 400 }
    );
  }
}

function databaseErrorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || null
    : null;
}
