import { NextResponse } from "next/server";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import {
  GROWTH_REVIEW_CREDIT_COST,
  MissionReviewError,
  computeMissionReviewSnapshot,
  reviewOperationKey,
  runMissionReview
} from "@/lib/growth-loop/reviewer";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

/** Read-only snapshot: no billing, no model, deterministic counts only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const { missionId } = await params;
    const { snapshot } = await computeMissionReviewSnapshot(
      guard.context.admin,
      guard.context.userId,
      missionId
    );
    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof MissionReviewError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    return growthLoopErrorResponse(error);
  }
}

/**
 * Full review: code computes every number, the model only explains. Billed as
 * one idempotent operation per review version.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  const { admin, userId } = guard.context;
  try {
    const { missionId } = await params;

    const { mission } = await computeMissionReviewSnapshot(admin, userId, missionId);
    const history = mission.plan?.reviewHistory ?? [];
    const reviewVersion = history.length + 1;

    const billing = createAiUsageBilling({
      operationKey: reviewOperationKey(missionId, reviewVersion),
      userId,
      action: "growthMissionReview",
      cost: GROWTH_REVIEW_CREDIT_COST,
      source: "growth_loop",
      detail: { goalId: mission.goal_id, missionId, reviewVersion }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json(
        { error: "Not enough credits to review this mission.", code: "INSUFFICIENT_CREDITS" },
        { status: 402 }
      );
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json(
        { error: "This review version was already generated.", code: "REVIEW_ALREADY_GENERATED" },
        { status: 409 }
      );
    }

    try {
      const result = await runMissionReview(admin, userId, missionId);
      await billing.settle();
      return NextResponse.json(result);
    } catch (error) {
      await billing.refund("growth_review_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof MissionReviewError) {
      const status = error.code === "mission_not_found" ? 404 : error.code === "not_measuring" ? 409 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return growthLoopErrorResponse(error);
  }
}
