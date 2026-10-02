import { NextResponse } from "next/server";
import { z } from "zod";
import { xTweetDraftSchema } from "@/lib/x-pipeline/content";
import { approveXPublicationJob, closeXPublicationJob } from "@/lib/x-pipeline/jobs";
import { guardXPipelineRequest, xPipelineErrorResponse } from "@/lib/x-pipeline/settings";

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject", "cancel"]),
  revisedTweets: z.array(xTweetDraftSchema).min(1).max(12).optional(),
  scheduledFor: z.string().datetime().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const { jobId } = await context.params;
    const input = decisionSchema.parse(await request.json());
    if (input.decision === "approve") {
      const job = await approveXPublicationJob(
        guard.context.admin,
        guard.context.userId,
        jobId,
        { revisedTweets: input.revisedTweets, scheduledFor: input.scheduledFor }
      );
      if (!job) {
        return NextResponse.json({ error: "The job is not awaiting review." }, { status: 409 });
      }
      return NextResponse.json({ job });
    }
    const closed = await closeXPublicationJob(
      guard.context.admin,
      guard.context.userId,
      jobId,
      input.decision === "reject" ? "rejected" : "cancelled"
    );
    if (!closed) {
      return NextResponse.json({ error: "The job can no longer be closed." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}
