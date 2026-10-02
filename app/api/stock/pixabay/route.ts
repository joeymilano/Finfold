
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  PIXABAY_API_BASE,
  pixabayAssetFromHit,
  pixabayOrientationForCover,
  pixabayPreviewProxyUrl,
  type PixabayResponse
} from "@/lib/cover/pixabay";

const MAX_QUERY_LENGTH = 80;
const STOCK_PROVIDER_TIMEOUT_MS = 8_000;
const STOCK_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400";

export async function GET(request: Request) {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Pixabay search is not configured. Set PIXABAY_API_KEY.", configured: false, assets: [] }
    );
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`pixabay:${ip}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many stock photo searches. Please try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  const requestedOrientation = searchParams.get("orientation");
  const orientation = requestedOrientation === "portrait" || requestedOrientation === "landscape" || requestedOrientation === "square"
    ? requestedOrientation
    : "portrait";
  const language = searchParams.get("lang") === "zh" ? "zh" : "en";

  const params = new URLSearchParams({
    key: apiKey,
    image_type: "photo",
    orientation: pixabayOrientationForCover(orientation),
    safesearch: "true",
    per_page: "12",
    lang: language
  });
  if (query) params.set("q", query);

  const edgeCache = await cloudflareStockCache();
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await edgeCache?.match(cacheKey);
  if (cached) return withCacheStatus(cached, "HIT");

  try {
    const response = await fetch(`${PIXABAY_API_BASE}?${params.toString()}`, {
      // Pixabay requires API results to be cached for at least 24 hours.
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(STOCK_PROVIDER_TIMEOUT_MS)
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("[pixabay] search failed:", response.status, message.slice(0, 160));
      return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
    }

    const data = (await response.json()) as PixabayResponse;
    const result = NextResponse.json(
      {
        assets: (data.hits ?? []).map((hit) => ({
          ...pixabayAssetFromHit(hit),
          previewUrl: pixabayPreviewProxyUrl(hit.previewURL)
        })),
        configured: true
      },
      { headers: { "Cache-Control": STOCK_CACHE_CONTROL } }
    );
    result.headers.set("X-Finfold-Stock-Cache", "MISS");
    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, result.clone());
      } catch (error) {
        console.warn("[pixabay] edge cache write failed:", error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  } catch (error) {
    console.error("[pixabay] request failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
  }
}

async function cloudflareStockCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open("finfold-stock-v1");
  } catch {
    return null;
  }
}

function withCacheStatus(response: Response, status: "HIT" | "MISS"): Response {
  const hit = new Response(response.body, response);
  hit.headers.set("X-Finfold-Stock-Cache", status);
  return hit;
}
