
import { NextResponse } from "next/server";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import {
  PIXABAY_API_BASE,
  pixabayAssetFromHit,
  pixabayImageExtension,
  type PixabayResponse
} from "@/lib/cover/pixabay";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  IMAGE_CONTENT_TYPES,
  readBytesWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const MEDIA_BUCKET = "media";
const MAX_STOCK_IMAGE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const apiKey = process.env.PIXABAY_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Pixabay search is not configured." }, { status: 503 });
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`pixabay-cache:${userId}:${ip}`, 40, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many stock image selections. Please try again later." }, { status: 429 });
    }

    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
    if (!/^\d{1,16}$/.test(id)) {
      return NextResponse.json({ error: "Invalid Pixabay image id." }, { status: 400 });
    }

    const lookup = new URLSearchParams({ key: apiKey, id, image_type: "photo" });
    const lookupResponse = await fetch(`${PIXABAY_API_BASE}?${lookup.toString()}`, {
      next: { revalidate: 60 * 60 * 24 }
    });
    if (!lookupResponse.ok) {
      return NextResponse.json({ error: "Unable to load this Pixabay image." }, { status: 502 });
    }

    const lookupData = (await lookupResponse.json()) as PixabayResponse;
    const hit = lookupData.hits?.[0];
    if (!hit || hit.type !== "photo") {
      return NextResponse.json({ error: "This Pixabay image is no longer available." }, { status: 404 });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Stock-image caching needs Finfold media storage. Please try again after storage is configured." },
        { status: 503 }
      );
    }

    const path = `stock/pixabay/${hit.id}.${pixabayImageExtension(hit.largeImageURL)}`;
    const { data: existing } = await admin.storage.from(MEDIA_BUCKET).download(path);
    const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    if (existing) {
      return NextResponse.json({ asset: pixabayAssetFromHit(hit, urlData.publicUrl), cached: true });
    }

    const imageResponse = await safeExternalFetch(
      hit.largeImageURL,
      { headers: { Accept: "image/webp,image/png,image/jpeg" } },
      {
        allowedContentTypes: IMAGE_CONTENT_TYPES,
        timeoutMs: 15_000,
        auditPurpose: "pixabay_image_cache"
      }
    );
    if (!imageResponse.ok) {
      return NextResponse.json({ error: "Unable to download this Pixabay image." }, { status: 502 });
    }

    const imageBytes = await readBytesWithLimit(imageResponse, MAX_STOCK_IMAGE_BYTES);
    const inspection = inspectMediaUploadBytes(imageBytes);
    if (!inspection.ok) {
      return NextResponse.json({ error: "This Pixabay result is not a supported image." }, { status: 422 });
    }

    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, imageBytes, {
        upsert: true,
        contentType: inspection.contentType,
        cacheControl: "31536000"
      });
    if (uploadError) {
      const message = uploadError.message || "Unable to cache this Pixabay image.";
      if (message.toLowerCase().includes("bucket")) {
        return NextResponse.json({ error: "Please create a public 'media' bucket in Supabase → Storage first." }, { status: 400 });
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ asset: pixabayAssetFromHit(hit, urlData.publicUrl), cached: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to cache a stock image." }, { status: 401 });
    }
    console.error("[pixabay] cache failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Unable to prepare this Pixabay image." }, { status: 502 });
  }
}
