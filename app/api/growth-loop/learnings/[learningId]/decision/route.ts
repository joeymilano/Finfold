import { NextResponse } from "next/server";
import { growthLearningDecisionSchema } from "@/lib/growth-loop/contracts";
import { LearningDecisionError, decideGrowthLearning } from "@/lib/growth-loop/learnings";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ learningId: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  try {
    const { learningId } = await params;
    const input = growthLearningDecisionSchema.parse(await request.json());
    const learning = await decideGrowthLearning(
      guard.context.admin,
      guard.context.userId,
      learningId,
      input.decision
    );
    return NextResponse.json({ learning });
  } catch (error) {
    if (error instanceof LearningDecisionError) {
      const status = error.code === "not_found" ? 404 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return growthLoopErrorResponse(error);
  }
}
