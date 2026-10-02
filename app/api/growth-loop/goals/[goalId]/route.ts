import { NextResponse } from "next/server";
import { growthGoalDecisionSchema } from "@/lib/growth-loop/contracts";
import { loadGrowthGoalDetail, setGoalStatus } from "@/lib/growth-loop/goals";
import { appUrlFromRequest, growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const { goalId } = await params;
    const detail = await loadGrowthGoalDetail(
      guard.context.admin,
      guard.context.userId,
      goalId,
      { appUrl: appUrlFromRequest(request) }
    );
    if (!detail) return NextResponse.json({ error: "Growth goal not found." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const { goalId } = await params;
    const input = growthGoalDecisionSchema.parse(await request.json());
    const goal = await setGoalStatus(
      guard.context.admin,
      guard.context.userId,
      goalId,
      input.decision === "pause" ? "paused" : "active"
    );
    if (!goal) return NextResponse.json({ error: "Growth goal not found." }, { status: 404 });
    return NextResponse.json({ goal });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
