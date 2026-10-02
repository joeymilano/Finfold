export const maxDuration = 60;

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import {
  IMAGE_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { inspectMediaUpload, MAX_MEDIA_DECODED_PIXELS } from "@/lib/media-upload-policy";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import {
  normalizeReplacementImageSource,
  outputImageSourceSchema,
  sameSourceImage,
  type OutputImageSource
} from "@/lib/source-image";

const MEDIA_BUCKET = "media";
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB cover PNG — plenty for a 2x render
const generatedCoverSchema = z.object({
  imageUrl: z.string().url().max(2048).refine((value) => new URL(value).protocol === "https:", "Cover URL must use HTTPS."),
  imageSource: outputImageSourceSchema.optional()
});

/**
 * Saves a template cover (rendered client-side via CoverStudio →
 * exportCoverPngToDataUrl) back to the kit output's `image_url`, so a cover
 * built in the studio becomes the persisted cover for that platform rather
 * than something the user can only download to disk (plan §3 P1-2 增强).
 *
 * The blob is inspected from its bytes (not trusted by client-declared type)
 * before it is uploaded to the public `media` bucket — same guard as /api/media.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;

    const formData = await parseBoundedFormData(request, IMAGE_MULTIPART_MAX_BYTES);
    const file = formData.get("file");
    const sourceField = formData.get("imageSource");
    const requestedImageSource = typeof sourceField === "string"
      ? outputImageSourceSchema.parse(JSON.parse(sourceField))
      : undefined;
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing cover image." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Cover image is too large." }, { status: 400 });
    }

    const inspection = await inspectMediaUpload(file);
    if (!inspection.ok) {
      if (inspection.code === "pixel_limit") {
        return NextResponse.json(
          {
            error: `Cover image exceeds the ${MAX_MEDIA_DECODED_PIXELS / 1_000_000}-megapixel decoded image limit (${inspection.width}×${inspection.height}).`
          },
          { status: 400 }
        );
      }
      if (inspection.code === "animated_image") {
        return NextResponse.json(
          { error: "Animated cover images are not supported." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "Cover must be a supported JPEG, PNG, or WebP image within the structural limits." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (!isLocalMockMode()) {
        return NextResponse.json({ error: persistenceUnavailableMessage("Cover upload") }, { status: 503 });
      }
      // Local mock: can't persist, but report success with an empty url so the
      // UI doesn't block. (No storage configured locally.)
      return NextResponse.json({ imageUrl: "" });
    }

    // Scope-check: this output must belong to this user + this kit before we
    // write anything to storage or the row.
    const { data: existing, error: fetchError } = await admin
      .from("kit_outputs")
      .select("id, kit_id, user_id, image_url, image_source")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[cover] fetch failed:", JSON.stringify(fetchError));
      throw new Error("Failed to load the output to update.");
    }
    if (!existing) {
      return NextResponse.json({ error: "Output not found." }, { status: 404 });
    }
    const existingImageSource = outputImageSourceSchema.safeParse(existing.image_source);
    let imageSource: OutputImageSource | undefined = requestedImageSource
      ? existingImageSource.success && sameSourceImage(requestedImageSource, existingImageSource.data)
        ? {
          ...requestedImageSource,
          rightsConfirmedAt: existingImageSource.data.rightsConfirmedAt,
          renderStatus: "ready"
        }
        : { ...normalizeReplacementImageSource(requestedImageSource), renderStatus: "ready" }
      : existingImageSource.success
        ? { ...existingImageSource.data, renderStatus: "ready" }
        : undefined;

    const id = crypto.randomUUID();
    const ext = inspection.contentType === "image/jpeg" ? "jpg" : inspection.contentType.split("/")[1];
    const path = `${userId}/covers/${id}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, arrayBuffer, { upsert: true, contentType: inspection.contentType });

    if (uploadError) {
      const msg = uploadError.message;
      if (msg.includes("Bucket not found") || msg.toLowerCase().includes("bucket")) {
        return NextResponse.json(
          { error: "Please create a public 'media' bucket in Supabase → Storage first." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: msg || "Upload failed." }, { status: 400 });
    }

    let imageUrl: string;
    const updatedAt = new Date().toISOString();
    try {
      const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      imageUrl = urlData.publicUrl;
      if (imageSource?.provider === "user_upload") {
        imageSource = {
          ...imageSource,
          cachedUrl: imageUrl,
          originalUrl: imageUrl,
          pageUrl: imageUrl,
          domain: new URL(imageUrl).hostname
        };
      }

      const { error: updateError } = await admin
        .from("kit_outputs")
        .update({ image_url: imageUrl, image_source: imageSource ?? null, updated_at: updatedAt })
        .eq("id", outputId)
        .eq("kit_id", kitId)
        .eq("user_id", userId);

      if (updateError) {
        console.error("[cover] image_url update failed:", JSON.stringify(updateError));
        throw new Error("Failed to save the cover. Please try again.");
      }
    } catch (error) {
      await removeCoverAfterFailure(admin, path);
      throw error;
    }

    return NextResponse.json({ imageUrl, imageSource, updatedAt });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Cover upload request is too large (max 17MB including multipart framing)." },
        { status: 413 }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save a cover." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the cover." },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;
    const { imageUrl, imageSource } = generatedCoverSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: persistenceUnavailableMessage("Cover save") }, { status: 503 });

    const { data: existing, error: existingError } = await admin
      .from("kit_outputs")
      .select("id, image_source")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw new Error("Failed to load the cover source.");
    if (!existing) return NextResponse.json({ error: "Output not found." }, { status: 404 });
    const priorSource = outputImageSourceSchema.safeParse(existing.image_source);
    const nextSource = imageSource && priorSource.success && sameSourceImage(imageSource, priorSource.data)
      ? { ...imageSource, rightsConfirmedAt: priorSource.data.rightsConfirmedAt }
      : imageSource
        ? normalizeReplacementImageSource(imageSource)
        : undefined;

    const updatedAt = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("kit_outputs")
      .update({ image_url: imageUrl, ...(nextSource ? { image_source: nextSource } : {}), updated_at: updatedAt })
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .select("image_url, image_source")
      .maybeSingle();

    if (error) throw new Error("Failed to save the generated visual.");
    if (!updated?.image_url) return NextResponse.json({ error: "Output not found." }, { status: 404 });
    return NextResponse.json({ imageUrl: updated.image_url, imageSource: outputImageSourceSchema.safeParse(updated.image_source).data, updatedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save a cover." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the generated visual." },
      { status: 400 }
    );
  }
}

async function removeCoverAfterFailure(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  path: string
): Promise<void> {
  try {
    const { error } = await admin.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) console.error("[cover] Uploaded object cleanup failed.");
  } catch (error) {
    console.error(
      "[cover] Uploaded object cleanup threw:",
      error instanceof Error ? error.name : "UnknownError"
    );
  }
}
