import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createBusinessGrowthMissionFollowUp,
  type GrowthMission
} from "@/lib/agent/growth-missions";
import { refreshUserPatrol } from "@/lib/agent/patrol";
import { businessMissionReviewRequestSchema } from "@/lib/business-mission-review";
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
    const input = businessMissionReviewRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Mission reviews require durable storage." }, { status: 503 });
    }

    const { data: mutation, error } = await admin.rpc("review_business_growth_mission", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_decision: input.decision,
      p_bottleneck: input.bottleneck,
      p_evidence_note: input.evidenceNote,
      p_extension_days: input.extensionDays,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;

    const replayed = mutationFlag(mutation, "replayed");
    let nextMission: GrowthMission | null = null;
    let nextMissionExisting = false;
    let followUpError: string | null = null;

    if (input.decision !== "collect_more_evidence") {
      const followUp = await createBusinessGrowthMissionFollowUp(admin, userId, input.locale, missionId);
      nextMission = followUp.mission;
      nextMissionExisting = followUp.existing;
      followUpError = followUp.error ?? null;
    }

    if (!replayed) {
      try {
        await captureServerEvent(userId, "business_mission_review_confirmed", {
          mission_id: missionId,
          decision: input.decision,
          bottleneck: input.bottleneck,
          extension_days: input.extensionDays,
          next_mission_id: nextMission?.id ?? null
        });
      } catch (analyticsError) {
        console.error("[mission/review] Review analytics capture failed:", analyticsError);
      }
    }
    if (nextMission && !nextMissionExisting) {
      try {
        await captureServerEvent(
          userId,
          input.decision === "goal_achieved"
            ? "business_result_replication_mission_created"
            : "business_result_repair_mission_created",
          {
            source_mission_id: missionId,
            mission_id: nextMission.id,
            objective_type: nextMission.objectiveType,
            bottleneck: input.bottleneck
          }
        );
      } catch (analyticsError) {
        console.error("[mission/review] Follow-up analytics capture failed:", analyticsError);
      }
    }

    await refreshUserPatrol(admin, userId).catch((patrolError) => {
      console.error(`[mission/review] patrol refresh failed for user=${userId}:`, patrolError);
    });
    const detail = await loadMissionControlDetail(
      admin,
      userId,
      missionId,
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    );
    if (!detail) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });

    return NextResponse.json({
      ...detail,
      replayed,
      nextMission,
      nextMissionExisting,
      followUpError
    }, { status: nextMission && !nextMissionExisting ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to review this Growth Mission." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: error.issues[0]?.message ?? "Invalid mission review decision."
      }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to review this Growth Mission."
    }, { status: 400 });
  }
}

function mutationFlag(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)[key] === true);
}
