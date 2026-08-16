
import { NextResponse } from "next/server";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  IMAGE_CONTENT_TYPES,
  readBytesWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import type { CoverAsset } from "@/lib/cover/stock-assets";

const PEXELS_API_BASE = "https://api.pexels.com/v1";
const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const MEDIA_BUCKET = "media";
const MAX_STOCK_IMAGE_BYTES = 15 * 1024 * 1024;

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string;
  photographer: string;
  photographer_url: string;
  src: { original?: string; large2x?: string; large?: string };
};

function extensionFor(contentType: string): "png" | "webp" | "jpg" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function asCoverAsset(photo: PexelsPhoto, persistedUrl: string): CoverAsset {
  return {
    id: `pexels-${photo.id}`,
    url: persistedUrl,
    previewUrl: persistedUrl,
    width: photo.width,
    height: photo.height,
    alt: photo.alt ?? "",
    provider: "pexels",
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    sourceUrl: photo.url,
    licenseName: "Pexels License",
    licenseUrl: PEXELS_LICENSE_URL,
    attributionRequired: false
  };
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const apiKey = process.env.PEXELS_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "Pexels search is not configured." }, { status: 503 });

    const ip = getClientIp(request);
    if (!checkRateLimit(`pexels-cache:${userId}:${ip}`, 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many stock image selections. Please try again later." }, { status: 429 });
    }

    const { id } = (await request.json()) as { id?: unknown };
    const photoId = typeof id === "string" || typeof id === "number" ? String(id) : "";
    if (!/^\d{1,16}$/.test(photoId)) return NextResponse.json({ error: "Invalid Pexels image id." }, { status: 400 });

    const photoResponse = await fetch(`${PEXELS_API_BASE}/photos/${photoId}`, { headers: { Authorization: apiKey } });
    if (!photoResponse.ok) return NextResponse.json({ error: "Unable to load this Pexels image." }, { status: 502 });
    const photo = (await photoResponse.json()) as PexelsPhoto;

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Stock-image caching needs Finfold media storage. Please try again after storage is configured." }, { status: 503 });
    }

    const sourceUrl = photo.src.large2x || photo.src.large || photo.src.original;
    if (!sourceUrl) return NextResponse.json({ error: "This Pexels image is no longer available." }, { status: 404 });

    const imageResponse = await safeExternalFetch(
      sourceUrl,
      // Keep content negotiation aligned with inspectMediaUploadBytes below.
      // Advertising AVIF here lets the CDN select a format Finfold then
      // rejects itself, turning a valid Pexels choice into a 422.
      { headers: { Accept: "image/webp,image/png,image/jpeg" } },
      {
        allowedContentTypes: IMAGE_CONTENT_TYPES,
        timeoutMs: 15_000,
        auditPurpose: "pexels_image_cache"
      }
    );
    if (!imageResponse.ok) return NextResponse.json({ error: "Unable to download this Pexels image." }, { status: 502 });

    const imageBytes = await readBytesWithLimit(imageResponse, MAX_STOCK_IMAGE_BYTES);
    const inspection = inspectMediaUploadBytes(imageBytes);
    if (!inspection.ok) return NextResponse.json({ error: "This Pexels result is not a supported image." }, { status: 422 });

    const path = `stock/pexels/${photo.id}.${extensionFor(inspection.contentType)}`;
    const { data: existing } = await admin.storage.from(MEDIA_BUCKET).download(path);
    const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    if (!existing) {
      const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, imageBytes, {
        upsert: true,
        contentType: inspection.contentType,
        cacheControl: "31536000"
      });
      if (error) return NextResponse.json({ error: error.message || "Unable to cache this Pexels image." }, { status: 502 });
    }

    return NextResponse.json({ asset: asCoverAsset(photo, urlData.publicUrl), cached: Boolean(existing) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to cache a stock image." }, { status: 401 });
    }
    console.error("[pexels] cache failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Unable to prepare this Pexels image." }, { status: 502 });
  }
}
