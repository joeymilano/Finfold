import { NextResponse } from "next/server";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { ExperimentPlanError, GROWTH_PLAN_CREDIT_COST, generateExperimentPlan, materializeExperiment, planOperationKey } from "@/lib/growth-loop/planner";
import { getGrowthLoopGoal, ensureGoalAcceptingWork } from "@/lib/growth-loop/policy";
import { appUrlFromRequest, growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  const { admin, userId } = guard.context;
  try {
    const { goalId } = await params;
    const goal = await getGrowthLoopGoal(admin, userId, goalId);
    if (!goal) return NextResponse.json({ error: "Growth goal not found." }, { status: 404 });
    ensureGoalAcceptingWork(goal);

    const { count } = await admin
      .from("growth_missions")
      .select("id", { count: "exact", head: true })
      .eq("goal_id", goal.id)
      .eq("user_id", userId)
      .eq("mission_kind", "growth_loop");
    const planVersion = (count ?? 0) + 1;

    const billing = createAiUsageBilling({
      operationKey: planOperationKey(goal.id, planVersion),
      userId,
      action: "growthExperimentPlan",
      cost: GROWTH_PLAN_CREDIT_COST,
      source: "growth_loop",
      detail: { goalId: goal.id, planVersion }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json(
        { error: "Not enough credits to plan an experiment.", code: "INSUFFICIENT_CREDITS" },
        { status: 402 }
      );
    }
    if (reservation.outcome === "existing" && reservation.status === "settled") {
      return NextResponse.json(
        { error: "This experiment round was already generated. Open the goal to continue.", code: "PLAN_ALREADY_GENERATED" },
        { status: 409 }
      );
    }
    if (reservation.outcome === "existing" && reservation.status === "started") {
      return NextResponse.json(
        { error: "An experiment plan for this round is still being generated.", code: "PLAN_IN_PROGRESS" },
        { status: 409 }
      );
    }

    try {
      const result = await generateExperimentPlan(admin, userId, goal);
      const materialized = await materializeExperiment(admin, userId, goal, result, {
        appUrl: appUrlFromRequest(request)
      });
      await billing.settle();
      return NextResponse.json(
        {
          missionId: materialized.missionId,
          trackingLinks: materialized.trackingLinks,
          plan: {
            hypothesis: result.plan.hypothesis,
            primaryVariable: result.plan.primaryVariable,
            designType: result.plan.designType,
            variants: result.plan.variants,
            missingInputs: result.plan.missingInputs,
            usedLearningIds: result.plan.usedLearningIds
          },
          cost: GROWTH_PLAN_CREDIT_COST
        },
        { status: 201 }
      );
    } catch (error) {
      await billing.refund("growth_plan_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof ExperimentPlanError) {
      const status = error.code === "active_mission_exists" ? 409 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return growthLoopErrorResponse(error);
  }
}
