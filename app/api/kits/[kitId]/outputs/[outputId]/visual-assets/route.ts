export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import type { VisualAsset } from "@/lib/content-schema";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { IMAGE_CONTENT_TYPES, readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const MEDIA_BUCKET = "media";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const saveVisualAssetSchema = z.object({
  remoteImageUrl: z.string().url().max(2048),
  positionIndex: z.number().int().min(0).max(11),
  role: z.enum(["concept", "process", "comparison", "evidence"]),
  sourceExcerpt: z.string().max(1000),
  placementHint: z.string().max(500),
  prompt: z.string().max(4000),
  altText: z.string().max(500),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const restoreVisualAssetSchema = z.object({ assetId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) return NextResponse.json({ error: persistenceUnavailableMessage("Visual asset storage") }, { status: 503 });
      return NextResponse.json({ assets: [], persisted: false });
    }

    const output = await findOwnedOutput(admin, userId, kitId, outputId);
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });
    const { data, error } = await admin
      .from("visual_assets")
      .select(VISUAL_ASSET_FIELDS)
      .eq("output_id", outputId)
      .eq("user_id", userId)
      .order("position_index", { ascending: true })
      .order("revision", { ascending: false });
    if (error) throw new Error("Failed to load visual asset history.");
    return NextResponse.json({ assets: (data ?? []).map(mapVisualAsset), persisted: true });
  } catch (error) {
    return visualAssetError(error, "Failed to load visual asset history.");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const input = saveVisualAssetSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    if (!admin) {
      if (!isLocalMockMode()) {
        return NextResponse.json({ error: persistenceUnavailableMessage("Visual asset storage") }, { status: 503 });
      }
      return NextResponse.json({ asset: localAsset(input), persisted: false });
    }

    const output = await findOwnedOutput(admin, userId, kitId, outputId);
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    const response = await safeExternalFetch(input.remoteImageUrl, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" }
    }, {
      allowedContentTypes: IMAGE_CONTENT_TYPES,
      timeoutMs: 15_000,
      auditPurpose: "visual_asset_persistence"
    });
    if (!response.ok) throw new Error("The generated image could not be downloaded for storage.");
    const bytes = await readBytesWithLimit(response, MAX_IMAGE_BYTES);
    const inspection = inspectMediaUploadBytes(bytes);
    if (!inspection.ok) throw new Error("The generated asset is not a supported image.");

    const storageId = crypto.randomUUID();
    const ext = inspection.contentType === "image/jpeg" ? "jpg" : inspection.contentType.split("/")[1];
    const path = `${userId}/article-illustrations/${outputId}/${storageId}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { upsert: true, contentType: inspection.contentType });
    if (uploadError) {
      const message = uploadError.message || "Visual asset upload failed.";
      if (message.toLowerCase().includes("bucket")) {
        return NextResponse.json({ error: "Please create a public 'media' bucket in Supabase → Storage first." }, { status: 400 });
      }
      throw new Error(message);
    }

    const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const now = new Date().toISOString();
    const { data: current, error: currentError } = await admin
      .from("visual_assets")
      .select("id, revision")
      .eq("output_id", outputId)
      .eq("asset_type", "article_illustration")
      .eq("position_index", input.positionIndex)
      .eq("is_current", true)
      .maybeSingle();
    if (currentError) {
      await admin.storage.from(MEDIA_BUCKET).remove([path]);
      throw new Error("Failed to prepare the image version.");
    }

    const row = {
      user_id: userId,
      kit_id: kitId,
      output_id: outputId,
      platform: output.platform,
      asset_type: "article_illustration",
      position_index: input.positionIndex,
      visual_role: input.role,
      source_excerpt: input.sourceExcerpt,
      placement_hint: input.placementHint,
      prompt: input.prompt,
      image_url: urlData.publicUrl,
      alt_text: input.altText,
      metadata: input.metadata,
      revision: Number(current?.revision ?? 0) + 1,
      is_current: true,
      updated_at: now
    };

    if (current) {
      const { error: retireError } = await admin
        .from("visual_assets")
        .update({ is_current: false, updated_at: now })
        .eq("id", current.id)
        .eq("user_id", userId);
      if (retireError) {
        await admin.storage.from(MEDIA_BUCKET).remove([path]);
        throw new Error("Failed to preserve the previous image version.");
      }
    }
    const { data: saved, error: saveError } = await admin
      .from("visual_assets")
      .insert(row)
      .select(VISUAL_ASSET_FIELDS)
      .maybeSingle();
    if (saveError || !saved) {
      if (current) await admin.from("visual_assets").update({ is_current: true, updated_at: now }).eq("id", current.id).eq("user_id", userId);
      await admin.storage.from(MEDIA_BUCKET).remove([path]);
      throw new Error("The image was stored but its placement could not be saved.");
    }

    return NextResponse.json({ asset: mapVisualAsset(saved), persisted: true });
  } catch (error) {
    return visualAssetError(error, "Failed to save the visual asset.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const input = restoreVisualAssetSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) return NextResponse.json({ error: persistenceUnavailableMessage("Visual asset storage") }, { status: 503 });
      return NextResponse.json({ error: "Version restore requires persistent storage." }, { status: 503 });
    }

    const output = await findOwnedOutput(admin, userId, kitId, outputId);
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });
    const { data: target, error: targetError } = await admin
      .from("visual_assets")
      .select(VISUAL_ASSET_FIELDS)
      .eq("id", input.assetId)
      .eq("output_id", outputId)
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError) throw new Error("Failed to load that image version.");
    if (!target) return NextResponse.json({ error: "Image version not found." }, { status: 404 });
    if (target.is_current) return NextResponse.json({ asset: mapVisualAsset(target), persisted: true });

    const now = new Date().toISOString();
    const { data: previous } = await admin
      .from("visual_assets")
      .select("id")
      .eq("output_id", outputId)
      .eq("asset_type", target.asset_type)
      .eq("position_index", target.position_index)
      .eq("is_current", true)
      .maybeSingle();
    const { error: retireError } = await admin
      .from("visual_assets")
      .update({ is_current: false, updated_at: now })
      .eq("output_id", outputId)
      .eq("asset_type", target.asset_type)
      .eq("position_index", target.position_index)
      .eq("user_id", userId)
      .eq("is_current", true);
    if (retireError) throw new Error("Failed to switch image versions.");

    const { data: restored, error: restoreError } = await admin
      .from("visual_assets")
      .update({ is_current: true, updated_at: now })
      .eq("id", input.assetId)
      .eq("user_id", userId)
      .select(VISUAL_ASSET_FIELDS)
      .maybeSingle();
    if (restoreError || !restored) {
      if (previous) await admin.from("visual_assets").update({ is_current: true, updated_at: now }).eq("id", previous.id).eq("user_id", userId);
      throw new Error("Failed to restore that image version.");
    }
    return NextResponse.json({ asset: mapVisualAsset(restored), persisted: true });
  } catch (error) {
    return visualAssetError(error, "Failed to restore the image version.");
  }
}

type SaveInput = z.infer<typeof saveVisualAssetSchema>;

function localAsset(input: SaveInput): VisualAsset {
  return {
    id: crypto.randomUUID(),
    assetType: "article_illustration",
    positionIndex: input.positionIndex,
    role: input.role,
    sourceExcerpt: input.sourceExcerpt,
    placementHint: input.placementHint,
    prompt: input.prompt,
    imageUrl: input.remoteImageUrl,
    altText: input.altText,
    metadata: input.metadata,
    revision: 1,
    isCurrent: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mapVisualAsset(row: Record<string, unknown>): VisualAsset {
  return {
    id: String(row.id),
    assetType: "article_illustration",
    positionIndex: Number(row.position_index),
    role: String(row.visual_role) as VisualAsset["role"],
    sourceExcerpt: String(row.source_excerpt ?? ""),
    placementHint: String(row.placement_hint ?? ""),
    prompt: String(row.prompt ?? ""),
    imageUrl: String(row.image_url),
    altText: String(row.alt_text ?? ""),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    revision: Number(row.revision ?? 1),
    isCurrent: row.is_current !== false,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

const VISUAL_ASSET_FIELDS = "id, asset_type, position_index, visual_role, source_excerpt, placement_hint, prompt, image_url, alt_text, metadata, revision, is_current, created_at, updated_at";
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

function visualAssetError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Please log in to save visual assets." }, { status: 401 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}
