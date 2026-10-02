import { NextResponse } from "next/server";
import { z } from "zod";
import { refreshUserPatrol } from "@/lib/agent/patrol";
import { measurementWindowRequestSchema } from "@/lib/business-mission-review";
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
    const input = measurementWindowRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Mission measurement requires durable storage." }, { status: 503 });
    }

    const { data: mutation, error } = await admin.rpc("set_business_mission_measurement_window", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_window_days: input.windowDays,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;

    const replayed = mutationFlag(mutation, "replayed");
    if (!replayed) {
      try {
        await captureServerEvent(userId, "business_mission_measurement_window_confirmed", {
          mission_id: missionId,
          window_days: input.windowDays
        });
      } catch (analyticsError) {
        console.error("[mission/measurement-window] Analytics capture failed:", analyticsError);
      }
    }
    await refreshUserPatrol(admin, userId).catch((patrolError) => {
      console.error(`[mission/measurement-window] patrol refresh failed for user=${userId}:`, patrolError);
    });

    const detail = await loadMissionControlDetail(
      admin,
      userId,
      missionId,
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    );
    if (!detail) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });
    return NextResponse.json({ ...detail, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to set the measurement window." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Choose a measurement window between 1 and 90 days." }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to set the measurement window."
    }, { status: 400 });
  }
}

function mutationFlag(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)[key] === true);
}
