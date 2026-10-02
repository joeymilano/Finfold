import { NextResponse } from "next/server";
import { z } from "zod";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { logInfo } from "@/lib/observability";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { IMAGE_CONTENT_TYPES, readBytesWithLimit, safeExternalFetch, validateExternalHttpUrl } from "@/lib/safe-url";
import { sourceImageAssetSchema } from "@/lib/source-image";
import { sha256Hex } from "@/lib/source-image-discovery";
import { verifySourceImageSelection } from "@/lib/source-image-token";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const requestSchema = z.object({ selectionToken: z.string().min(20).max(12_000) });
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MEDIA_BUCKET = "media";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const ip = getClientIp(request);
    if (!checkRateLimit(`source-image-cache:${userId}:${ip}`, 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many image selections. Please try again later." }, { status: 429 });
    }
    const input = requestSchema.parse(await request.json());
    const selection = await verifySourceImageSelection(input.selectionToken, userId);
    const pageUrl = validateExternalHttpUrl(selection.pageUrl);
    const imageUrl = validateExternalHttpUrl(selection.imageUrl);
    if (pageUrl.hostname.toLowerCase() !== selection.domain.toLowerCase()) {
      return NextResponse.json({ error: "Image source provenance no longer matches the page." }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Image caching needs Finfold media storage." }, { status: 503 });

    const imageHash = await sha256Hex(imageUrl.toString());
    const path = `${userId}/source-images/${imageHash}`;
    const { data: existing } = await admin.storage.from(MEDIA_BUCKET).download(path);
    let bytes: Uint8Array;
    if (existing) {
      if (existing.size > MAX_SOURCE_IMAGE_BYTES) {
        return NextResponse.json({ error: "The cached source image is too large." }, { status: 422 });
      }
      bytes = new Uint8Array(await existing.arrayBuffer());
    } else {
      const response = await safeExternalFetch(
        imageUrl.toString(),
        { headers: { Accept: "image/webp,image/png,image/jpeg" } },
        {
          allowedContentTypes: IMAGE_CONTENT_TYPES,
          timeoutMs: 15_000,
          auditPurpose: "source_image_cache"
        }
      );
      if (!response.ok) {
        return NextResponse.json({ error: "The selected source image could not be downloaded." }, { status: 502 });
      }
      bytes = await readBytesWithLimit(response, MAX_SOURCE_IMAGE_BYTES);
    }

    const inspection = inspectMediaUploadBytes(bytes);
    if (!inspection.ok) {
      return NextResponse.json({ error: "The selected source is not a supported static JPEG, PNG, or WebP image." }, { status: 422 });
    }
    if (!existing) {
      const { error: uploadError } = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, {
        upsert: true,
        contentType: inspection.contentType,
        cacheControl: "31536000"
      });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message || "The source image could not be cached." }, { status: 502 });
      }
    }
    const { data: publicUrl } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const asset = sourceImageAssetSchema.parse({
      id: `source-${imageHash.slice(0, 24)}`,
      cachedUrl: publicUrl.publicUrl,
      originalUrl: imageUrl.toString(),
      pageUrl: pageUrl.toString(),
      provider: selection.provider,
      title: selection.title,
      domain: selection.domain,
      width: inspection.width,
      height: inspection.height,
      alt: selection.alt,
      rightsStatus: "official_unverified",
      confidence: selection.confidence,
      focalPoint: selection.focalPoint,
      capturedAt: new Date().toISOString()
    });
    logInfo("source_image_cached", { userId }, {
      provider: asset.provider,
      domain: asset.domain,
      confidence: asset.confidence,
      url_hash: imageHash,
      cached: Boolean(existing)
    });
    await admin.from("usage_events").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      event_name: "source_image_selected",
      metadata: {
        provider: asset.provider,
        domain: asset.domain,
        confidence: asset.confidence,
        urlHash: imageHash
      }
    }).then(({ error }) => {
      if (error) console.error("[source-assets/cache] analytics insert failed:", error.message);
    });
    return NextResponse.json({ asset, cached: Boolean(existing) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to select a source image." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid or expired image selection." }, { status: 400 });
    }
    console.error("[source-assets/cache] failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare this source image." }, { status: 400 });
  }
}
