import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { outputImageSourceSchema, sameSourceImage, sourceImageAssetSchema } from "@/lib/source-image";

const requestSchema = z.object({ sourceId: z.string().min(1).max(180) });

export async function POST(request: Request, { params }: { params: Promise<{ kitId: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { kitId } = await params;
    const { sourceId } = requestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Image rights confirmation needs persistent storage." }, { status: 503 });

    const { data: kit, error: kitError } = await admin
      .from("content_kits")
      .select("id, visual_source")
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (kitError) throw new Error("Could not load this content kit.");
    if (!kit) return NextResponse.json({ error: "Content kit not found." }, { status: 404 });

    const { data: rows, error: outputError } = await admin
      .from("kit_outputs")
      .select("id, image_source")
      .eq("kit_id", kitId)
      .eq("user_id", userId);
    if (outputError) throw new Error("Could not load the content kit images.");
    const kitSource = sourceImageAssetSchema.safeParse(kit.visual_source);
    const outputSources = (rows ?? []).flatMap((row) => {
      const parsed = outputImageSourceSchema.safeParse(row.image_source);
      return parsed.success ? [{ row, source: parsed.data }] : [];
    });
    const selectedSource = kitSource.success && kitSource.data.id === sourceId
      ? kitSource.data
      : outputSources.find((item) => item.source.id === sourceId)?.source;
    if (!selectedSource) return NextResponse.json({ error: "The selected source no longer matches this content kit." }, { status: 409 });
    const confirmedAt = new Date().toISOString();
    const confirmedSource = { ...selectedSource, rightsConfirmedAt: confirmedAt };
    if (kitSource.success && sameSourceImage(kitSource.data, confirmedSource)) {
      const { error: kitUpdateError } = await admin
        .from("content_kits")
        .update({ visual_source: { ...kitSource.data, rightsConfirmedAt: confirmedAt } })
        .eq("id", kitId)
        .eq("user_id", userId);
      if (kitUpdateError) throw new Error("Could not save the image rights confirmation.");
    }
    await Promise.all(outputSources.map(async ({ row, source }) => {
      if (!sameSourceImage(source, confirmedSource)) return;
      const { error } = await admin.from("kit_outputs").update({
        image_source: { ...source, rightsConfirmedAt: confirmedAt }
      }).eq("id", row.id).eq("kit_id", kitId).eq("user_id", userId);
      if (error) throw new Error("Could not save the image rights confirmation.");
    }));

    return NextResponse.json({ source: confirmedSource, confirmedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to confirm image rights." }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid image rights confirmation." }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not confirm image rights." }, { status: 400 });
  }
}
