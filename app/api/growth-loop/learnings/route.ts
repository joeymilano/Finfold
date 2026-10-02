import { NextResponse } from "next/server";
import { listGrowthLearnings } from "@/lib/growth-loop/learnings";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

export async function GET(request: Request) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const goalId = new URL(request.url).searchParams.get("goalId") ?? undefined;
    const learnings = await listGrowthLearnings(guard.context.admin, guard.context.userId, { goalId });
    return NextResponse.json({ learnings });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
