
import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { visualStorySchema } from "@/lib/visual-story";
import { visualStoryFormats, type VisualStoryFormatId } from "@/lib/visual-story-formats";

const formatIds = Object.keys(visualStoryFormats) as [VisualStoryFormatId, ...VisualStoryFormatId[]];
const visualStoryDraftSchema = z.object({
  story: visualStorySchema,
  formatId: z.enum(formatIds)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) return NextResponse.json({ error: persistenceUnavailableMessage("Visual story storage") }, { status: 503 });
      return NextResponse.json({ draft: null, persisted: false });
    }

    const output = await findOwnedOutput(admin, userId, kitId, outputId);
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    const { data, error } = await admin
      .from("visual_stories")
      .select("story_json, format_id, revision, updated_at")
      .eq("output_id", outputId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Failed to load the visual story.");
    if (!data) return NextResponse.json({ draft: null, persisted: true });

    const parsed = visualStoryDraftSchema.safeParse({ story: data.story_json, formatId: data.format_id });
    if (!parsed.success) return NextResponse.json({ draft: null, persisted: true });
    return NextResponse.json({ draft: { ...parsed.data, revision: data.revision, updatedAt: data.updated_at }, persisted: true });
  } catch (error) {
    return visualStoryError(error, "Failed to load the visual story.");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const input = visualStoryDraftSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) return NextResponse.json({ error: persistenceUnavailableMessage("Visual story storage") }, { status: 503 });
      return NextResponse.json({ draft: { ...input, revision: 1, updatedAt: new Date().toISOString() }, persisted: false });
    }

    const output = await findOwnedOutput(admin, userId, kitId, outputId);
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    const { data: existing, error: existingError } = await admin
      .from("visual_stories")
      .select("revision")
      .eq("output_id", outputId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw new Error("Failed to prepare the visual story save.");

    const now = new Date().toISOString();
    const revision = Number(existing?.revision ?? 0) + 1;
    const { data, error } = await admin
      .from("visual_stories")
      .upsert({
        user_id: userId,
        kit_id: kitId,
        output_id: outputId,
        platform: output.platform,
        story_json: input.story,
        format_id: input.formatId,
        revision,
        updated_at: now
      }, { onConflict: "output_id" })
      .select("revision, updated_at")
      .maybeSingle();
    if (error || !data) throw new Error("Failed to save the visual story.");

    return NextResponse.json({ draft: { ...input, revision: data.revision, updatedAt: data.updated_at }, persisted: true });
  } catch (error) {
    return visualStoryError(error, "Failed to save the visual story.");
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function findOwnedOutput(admin: AdminClient, userId: string, kitId: string, outputId: string) {
  const { data, error } = await admin
    .from("kit_outputs")
    .select("id, platform")
    .eq("id", outputId)
    .eq("kit_id", kitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Failed to verify the content output.");
  return data;
}

function visualStoryError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Please log in to save visual stories." }, { status: 401 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}
