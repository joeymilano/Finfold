import { NextResponse } from "next/server";
import { growthEvidenceSchema } from "@/lib/growth-loop/contracts";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

/**
 * Manual/assisted publication evidence. The RPC rejects stale approvals,
 * enforces the Xiaohongshu host, and can only ever record 'user_reported' —
 * nothing on this path can mint a provider_verified claim (T07).
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
    const input = growthEvidenceSchema.parse(await request.json());

    const { data, error } = await admin.rpc("confirm_mission_publication", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_action_id: actionId,
      p_variant_key: input.variantKey,
      p_payload_hash: input.payloadHash,
      p_evidence_url: input.evidenceUrl,
      p_execution_mode: input.executionMode,
      p_window_days: input.windowDays
    });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("stale")) {
        return NextResponse.json(
          { error: "The approved content version has changed. Approve the new version first.", code: "APPROVAL_STALE" },
          { status: 409 }
        );
      }
      throw new Error(message);
    }
    return NextResponse.json({ result: data });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
