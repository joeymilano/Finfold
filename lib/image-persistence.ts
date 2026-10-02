import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import type { ImageGenerationOutcome } from "@/lib/image-gen";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  bytesToArrayBuffer,
  IMAGE_CONTENT_TYPES,
  readBytesWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";

const MEDIA_BUCKET = "media";
const MAX_GENERATED_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Uploads already-decoded image bytes into Supabase's `media` bucket under
 * the owning user's folder and returns the public URL, or null if
 * persistence failed for any reason (no Supabase configured, bytes fail
 * inspection, upload error). Shared by persistGeneratedImage (which has a
 * source URL to fall back to on null) and the Workers AI image path (whose
 * base64 response has no URL at all, so null here means the request has no
 * usable result).
 */
export async function persistGeneratedImageBytes(
  userId: string,
  bytes: Uint8Array,
  hintedContentType?: string,
  options: { firstPartyDelivery?: boolean } = {}
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  try {
    const inspection = inspectMediaUploadBytes(bytes);
    const contentType = inspection.ok ? inspection.contentType : hintedContentType;
    if (!contentType) {
      return null;
    }

    const arrayBuffer = bytesToArrayBuffer(bytes);
    const id = crypto.randomUUID();
    const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const path = `${userId}/covers/${id}.${ext}`;
    const { error: uploadError } = await admin.storage.from(MEDIA_BUCKET).upload(path, arrayBuffer, {
      upsert: true,
      contentType
    });
    if (uploadError) {
      console.warn("[image-persistence] upload failed:", uploadError.message);
      return null;
    }

    if (options.firstPartyDelivery) {
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.finfold.app";
      return new URL(`/api/generated-images/${userId}/${id}.${ext}`, origin).toString();
    }
    const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return urlData.publicUrl;
  } catch (error) {
    console.warn("[image-persistence] failed to persist bytes:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** New generations must be stored before success/charging. Browsers receive
 * a Finfold URL, so they never need to reach a model vendor or storage host. */
export async function persistGeneratedImageForDelivery(userId: string, outcome: ImageGenerationOutcome): Promise<string> {
  let bytes: Uint8Array;
  if (outcome.kind === "url") {
    const response = await safeExternalFetch(outcome.url, {}, {
      allowedContentTypes: IMAGE_CONTENT_TYPES, timeoutMs: 30_000,
      auditPurpose: "generated_image_delivery"
    });
    if (!response.ok) throw new Error("Generated image could not be retrieved.");
    bytes = await readBytesWithLimit(response, MAX_GENERATED_IMAGE_BYTES);
  } else {
    bytes = outcome.bytes;
  }
  if (bytes.length > MAX_GENERATED_IMAGE_BYTES || !inspectMediaUploadBytes(bytes).ok) {
    throw new Error("Generated image failed format or size validation.");
  }
  const url = await persistGeneratedImageBytes(userId, bytes, undefined, { firstPartyDelivery: true });
  if (!url) throw new Error("Generated image could not be stored.");
  return url;
}

/**
 * Fetches an Agnes-hosted cover image and re-uploads it into Supabase's
 * `media` bucket under the owning user's folder, returning the new stable
 * URL. Agnes CDN links rot (a kit opened a week later shows broken images —
 * see plan §4 "图片腐烂修复"), so this runs once at generation time rather
 * than leaving the hotlink as the persisted URL.
 *
 * Returns the original URL unchanged on any failure (network error,
 * unrecognized format, no Supabase configured) — a broken copy step should
 * never fail the whole kit generation, it should just leave the hotlink in
 * place as a graceful degradation.
 */
export async function persistGeneratedImage(userId: string, sourceUrl: string): Promise<string> {
  try {
    const response = await safeExternalFetch(
      sourceUrl,
      { headers: { Accept: "image/webp,image/png,image/jpeg" } },
      {
        allowedContentTypes: IMAGE_CONTENT_TYPES,
        timeoutMs: 15_000,
        auditPurpose: "generated_image_persistence"
      }
    );
    if (!response.ok) {
      return sourceUrl;
    }

    const bytes = await readBytesWithLimit(response, MAX_GENERATED_IMAGE_BYTES);
    const persistedUrl = await persistGeneratedImageBytes(userId, bytes);
    return persistedUrl ?? sourceUrl;
  } catch (error) {
    console.warn("[image-persistence] failed, keeping hotlink:", error instanceof Error ? error.message : error);
    return sourceUrl;
  }
}
