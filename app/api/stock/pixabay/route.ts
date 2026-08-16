
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
    per_page: "18",
    lang: language
  });
  if (query) params.set("q", query);

  try {
    const response = await fetch(`${PIXABAY_API_BASE}?${params.toString()}`, {
      // Pixabay requires API results to be cached for at least 24 hours.
      next: { revalidate: 60 * 60 * 24 }
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("[pixabay] search failed:", response.status, message.slice(0, 160));
      return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
    }

    const data = (await response.json()) as PixabayResponse;
    return NextResponse.json({
      assets: (data.hits ?? []).map((hit) => ({
        ...pixabayAssetFromHit(hit),
        previewUrl: pixabayPreviewProxyUrl(hit.previewURL)
      })),
      configured: true
    });
  } catch (error) {
    console.error("[pixabay] request failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
  }
}
