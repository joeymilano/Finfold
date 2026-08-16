
import { NextResponse } from "next/server";
import { isPixabayImageUrl } from "@/lib/cover/pixabay";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  bytesToArrayBuffer,
  IMAGE_CONTENT_TYPES,
  readBytesWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";

const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

/**
 * Pixabay permits temporary result previews but rejects direct browser loads
 * in some contexts. This narrowly-scoped proxy keeps previews first-party,
 * caches them for the provider-required 24 hours, and refuses every host
 * outside Pixabay so it cannot become a generic fetch proxy.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`pixabay-preview:${ip}`, 240, 60 * 60 * 1000)) {
    return new NextResponse(null, { status: 429 });
  }

  const sourceUrl = new URL(request.url).searchParams.get("url") ?? "";
  if (sourceUrl.length > 2048 || !isPixabayImageUrl(sourceUrl)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const response = await safeExternalFetch(
      sourceUrl,
      { headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" } },
      {
        allowedContentTypes: IMAGE_CONTENT_TYPES,
        timeoutMs: 10_000,
        auditPurpose: "pixabay_image_preview"
      }
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return new NextResponse(null, { status: 502 });
    }
    const bytes = await readBytesWithLimit(response, MAX_PREVIEW_BYTES);

    return new NextResponse(bytesToArrayBuffer(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.warn("[pixabay] preview failed:", error instanceof Error ? error.message : String(error));
    return new NextResponse(null, { status: 502 });
  }
}
