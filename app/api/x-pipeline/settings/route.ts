import { NextResponse } from "next/server";
import {
  getXPipelineSettings,
  guardXPipelineRequest,
  updateXPipelineSettings,
  xPipelineErrorResponse,
  xPipelineSettingsPatchSchema
} from "@/lib/x-pipeline/settings";

export async function GET() {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const settings = await getXPipelineSettings(guard.context.admin, guard.context.userId);
    return NextResponse.json({ settings });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const patch = xPipelineSettingsPatchSchema.parse(await request.json());
    const settings = await updateXPipelineSettings(
      guard.context.admin,
      guard.context.userId,
      patch
    );
    return NextResponse.json({ settings });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}
