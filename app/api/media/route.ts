
import { NextResponse } from "next/server";
import type { MediaAsset } from "@/lib/content-schema";
import {
  inspectMediaUpload,
  MAX_MEDIA_DECODED_PIXELS,
  type MediaUploadMimeType
} from "@/lib/media-upload-policy";
import {
  MEDIA_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per file
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILE_COUNT = 6;
const MEDIA_BUCKET = "media";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const formData = await parseBoundedFormData(request, MEDIA_MULTIPART_MAX_BYTES);
    const entries = Array.from(formData.entries());
    if (
      entries.some(([name, value]) => name !== "files" || !(value instanceof File))
    ) {
      return NextResponse.json(
        { error: "The media request contains unsupported form fields." },
        { status: 400 }
      );
    }
    const files = entries.map(([, file]) => file as File);

    if (files.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    if (files.length > MAX_FILE_COUNT) {
      return NextResponse.json(
        { error: `Upload at most ${MAX_FILE_COUNT} files at a time.` },
        { status: 400 }
      );
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "The combined upload exceeds the 25MB file limit." },
        { status: 400 }
      );
    }

    const validatedFiles: Array<{ file: File; contentType: MediaUploadMimeType }> = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `"${file.name}" exceeds the 25MB limit.` },
          { status: 400 }
        );
      }

      // Browser MIME values and file extensions are client-controlled. Read a
      // bounded header window and validate both magic bytes and dimensions
      // before any file is persisted, including in local mock mode.
      const inspection = await inspectMediaUpload(file);
      if (!inspection.ok) {
        if (inspection.code === "pixel_limit") {
          return NextResponse.json(
            {
              error: `"${file.name}" exceeds the ${MAX_MEDIA_DECODED_PIXELS / 1_000_000}-megapixel decoded image limit (${inspection.width}×${inspection.height}).`
            },
            { status: 400 }
          );
        }
        if (
          inspection.code === "invalid_dimensions" ||
          inspection.code === "invalid_structure"
        ) {
          return NextResponse.json(
            { error: `"${file.name}" is incomplete or has unreadable image dimensions.` },
            { status: 400 }
          );
        }
        if (inspection.code === "animated_image") {
          return NextResponse.json(
            { error: `"${file.name}" is animated. Animated images are not supported.` },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            error: `"${file.name}" must be a JPEG, PNG, or WebP image. GIF, video, and other file types are not supported.`
          },
          { status: 400 }
        );
      }

      validatedFiles.push({ file, contentType: inspection.contentType });
    }

    const admin = createSupabaseAdminClient();

    // Without storage configured, fall back to metadata-only assets so the
    // picker still works locally (files are not persisted in that case).
    if (!admin) {
      if (!isLocalMockMode()) {
        return NextResponse.json({ error: persistenceUnavailableMessage("Media uploads") }, { status: 503 });
      }
      const assets: MediaAsset[] = validatedFiles.map(({ file }) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: "image"
      }));
      return NextResponse.json({ assets, persisted: false });
    }

    const assets: MediaAsset[] = [];
    const uploadedPaths: string[] = [];
    const rollbackUploadedPaths = async () => {
      if (uploadedPaths.length === 0) return;
      try {
        const { error: cleanupError } = await admin.storage
          .from(MEDIA_BUCKET)
          .remove(uploadedPaths);
        if (cleanupError) {
          console.error("[api/media] Partial upload cleanup failed:", cleanupError.message);
        }
      } catch (cleanupError) {
        console.error(
          "[api/media] Partial upload cleanup threw:",
          cleanupError instanceof Error ? cleanupError.name : "UnknownError"
        );
      }
    };

    try {
      for (const { file, contentType } of validatedFiles) {
        const id = crypto.randomUUID();
        const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
        const path = `${userId}/${id}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();

        const { error: uploadError } = await admin.storage
          .from(MEDIA_BUCKET)
          .upload(path, arrayBuffer, {
            upsert: true,
            contentType
          });

        if (uploadError) {
          await rollbackUploadedPaths();
          const msg = uploadError.message;
          if (msg.includes("Bucket not found") || msg.toLowerCase().includes("bucket")) {
            return NextResponse.json(
              { error: "Please create a public 'media' bucket in Supabase → Storage first." },
              { status: 400 }
            );
          }
          return NextResponse.json({ error: msg || "Upload failed." }, { status: 400 });
        }

        uploadedPaths.push(path);

        const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

        assets.push({
          id,
          name: file.name,
          size: file.size,
          type: "image",
          url: urlData.publicUrl
        });
      }
    } catch (error) {
      await rollbackUploadedPaths();
      throw error;
    }

    return NextResponse.json({ assets, persisted: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "The multipart upload exceeds the 27MB request limit." },
        { status: 413 }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to upload media." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process media." },
      { status: 400 }
    );
  }
}
