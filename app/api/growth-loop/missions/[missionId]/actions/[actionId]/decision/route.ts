import { NextResponse } from "next/server";
import { growthActionDecisionSchema } from "@/lib/growth-loop/contracts";
import { appUrlFromRequest, growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

/**
 * Approve or cancel one specific version of one specific action. Publish
 * approvals must carry the payload hash; the RPC pins it and any later
 * content change makes the stored approval stale (T04).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string; actionId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  const { admin, userId } = guard.context;
  try {
    const { missionId, actionId } = await params;
    const input = growthActionDecisionSchema.parse(await request.json());

    const { data: action } = await admin
      .from("mission_actions")
      .select("kind, input")
      .eq("id", actionId)
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!action) {
      return NextResponse.json({ error: "Action not found." }, { status: 404 });
    }

    // Studio deep link mirrors lib/mission-control.ts so the workbench
    // bootstraps idea + platform + mission from the URL.
    const variantKey = typeof action.input?.variantKey === "string" ? action.input.variantKey : null;
    const workbenchIdea = typeof action.input?.workbenchIdea === "string" ? action.input.workbenchIdea : null;
    const workbenchHref =
      action.kind === "prepare_execution_draft" && variantKey && workbenchIdea
        ? `${appUrlFromRequest(request).replace(/\/$/, "")}/workbench?missionId=${encodeURIComponent(missionId)}&platform=xiaohongshu&variant=${encodeURIComponent(variantKey)}&idea=${encodeURIComponent(workbenchIdea)}`
        : null;

    const { data, error } = await admin.rpc("apply_mission_action_decision", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_action_id: actionId,
      p_decision: input.decision,
      p_workbench_href: workbenchHref,
      p_execution_state: input.decision === "approve" ? "awaiting_decision" : "closed",
      p_payload_hash: input.payloadHash ?? null
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ result: data, workbenchHref });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
