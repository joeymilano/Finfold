import { NextResponse } from "next/server";
import { growthGoalInputSchema } from "@/lib/growth-loop/contracts";
import { createGrowthLoopGoal, listGrowthLoopGoals } from "@/lib/growth-loop/goals";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

export async function GET() {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const goals = await listGrowthLoopGoals(guard.context.admin, guard.context.userId);
    return NextResponse.json({ goals });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const input = growthGoalInputSchema.parse(await request.json());
    const goal = await createGrowthLoopGoal(guard.context.admin, guard.context.userId, input);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
