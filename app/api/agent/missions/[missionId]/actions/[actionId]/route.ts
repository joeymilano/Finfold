import { NextResponse } from "next/server";
import { z } from "zod";
import { getGrowthMission } from "@/lib/agent/growth-missions";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const requestSchema = z.object({ decision: z.enum(["approve", "cancel"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string; actionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { missionId, actionId } = await params;
    const input = requestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Mission decisions require durable storage." }, { status: 503 });

    const { data: action, error } = await admin
      .from("mission_actions")
      .select("id, kind, status, input")
      .eq("id", actionId)
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!action) return NextResponse.json({ error: "Mission action not found." }, { status: 404 });
    if (action.status !== "awaiting_approval") {
      return NextResponse.json({ error: "This action is no longer waiting for approval." }, { status: 409 });
    }

    if (input.decision === "cancel") {
      const { error: decisionError } = await admin.rpc("apply_mission_action_decision", {
        p_user_id: userId,
        p_mission_id: missionId,
        p_action_id: actionId,
        p_decision: "cancel",
        p_workbench_href: null,
        p_execution_state: null
      });
      if (decisionError) throw decisionError;
      return NextResponse.json({ decision: "cancelled" });
    }

    const mission = await getGrowthMission(admin, userId, missionId);
    if (!mission) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });
    if (action.kind !== "prepare_execution_draft" && action.kind !== "review_and_publish") {
      return NextResponse.json({ error: "This action type cannot be executed here yet." }, { status: 400 });
    }
    const workbenchHref = action.kind === "review_and_publish" && mission.kitId
      ? `/kits/${mission.kitId}`
      : `/workbench?missionId=${encodeURIComponent(mission.id)}&platform=${encodeURIComponent(mission.platform)}&idea=${encodeURIComponent(mission.workbenchIdea)}`;
    const nextExecutionState = action.kind === "review_and_publish" ? "awaiting_decision" : "generating";
    const { error: decisionError } = await admin.rpc("apply_mission_action_decision", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_action_id: actionId,
      p_decision: "approve",
      p_workbench_href: workbenchHref,
      p_execution_state: nextExecutionState
    });
    if (decisionError) throw decisionError;
    await captureServerEvent(userId, "mission_action_approved", { mission_id: missionId, action_id: actionId, kind: action.kind });
    return NextResponse.json({ decision: "approved", workbenchHref });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to approve mission actions." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to apply mission decision." }, { status: 400 });
  }
}
