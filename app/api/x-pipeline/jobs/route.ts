import { NextResponse } from "next/server";
import { listXPublicationJobs } from "@/lib/x-pipeline/jobs";
import { guardXPipelineRequest, xPipelineErrorResponse } from "@/lib/x-pipeline/settings";
import { xPublicationStatuses, type XPublicationStatus } from "@/lib/x-pipeline/content";

export async function GET(request: Request) {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const statuses = statusParam
      ? (statusParam
          .split(",")
          .map((value) => value.trim())
          .filter((value) => (xPublicationStatuses as readonly string[]).includes(value)) as XPublicationStatus[])
      : undefined;
    const jobs = await listXPublicationJobs(guard.context.admin, guard.context.userId, {
      statuses: statuses?.length ? statuses : undefined,
      limit: 100
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}
