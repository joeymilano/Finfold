import { NextResponse } from "next/server";
import { manualOutcomeSchema } from "@/lib/mission-attribution";
import { loadMissionControlDetail } from "@/lib/mission-control";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { missionId } = await params;
    const input = manualOutcomeSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Mission outcomes require durable storage." }, { status: 503 });
    const { data: mutation, error } = await admin.rpc("record_mission_outcome", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_event_type: input.eventType,
      p_quantity: input.count,
      p_value: input.value,
      p_currency: input.currency,
      p_note: input.note,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;

    const replayed = Boolean(
      mutation
      && typeof mutation === "object"
      && !Array.isArray(mutation)
      && (mutation as Record<string, unknown>).replayed === true
    );
    if (!replayed) {
      await captureServerEvent(userId, "mission_outcome_recorded", {
        mission_id: missionId,
        event_type: input.eventType,
        count: input.count,
        value: input.value,
        currency: input.currency,
        source: "manual"
      });
    }
    const refreshed = await loadMissionControlDetail(
      admin,
      userId,
      missionId,
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    );
    if (!refreshed) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });
    return NextResponse.json({ ...refreshed, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to record mission outcomes." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record mission outcome." }, { status: 400 });
  }
}
