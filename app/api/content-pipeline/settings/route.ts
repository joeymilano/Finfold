import { NextResponse } from "next/server";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  contentPipelineErrorResponse,
  getContentPipelineSettings,
  guardContentPipelineRequest,
  updateContentPipelineSettings,
  contentPipelineSettingsPatchSchema
} from "@/lib/content-pipeline/settings";

export async function GET() {
  const guard = await guardContentPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const [settings, leadTools] = await Promise.all([
      getContentPipelineSettings(guard.context.admin, guard.context.userId),
      listPublishedLeadTools(guard.context.admin, guard.context.userId)
    ]);
    return NextResponse.json({ settings, leadTools });
  } catch (error) {
    return contentPipelineErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const guard = await guardContentPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const patch = contentPipelineSettingsPatchSchema.parse(await request.json());
    const settings = await updateContentPipelineSettings(guard.context.admin, guard.context.userId, patch);
    return NextResponse.json({ settings });
  } catch (error) {
    return contentPipelineErrorResponse(error);
  }
}

/** Published lead-buddy tools the magnet editor can link a hook to (/t/slug). */
async function listPublishedLeadTools(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
): Promise<Array<{ slug: string; title: string }>> {
  const { data, error } = await admin
    .from("lead_tools")
    .select("slug, title")
    .eq("user_id", userId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? [])
    .filter((row) => typeof row.slug === "string" && typeof row.title === "string" && row.slug.length > 0)
    .map((row) => ({ slug: row.slug, title: row.title }));
}
