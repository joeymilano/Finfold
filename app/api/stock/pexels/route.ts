
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { CoverAsset } from "@/lib/cover/stock-assets";

const PEXELS_API_BASE = "https://api.pexels.com/v1";
const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const MAX_QUERY_LENGTH = 80;

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    portrait: string;
    landscape: string;
  };
};

type PexelsResponse = { photos?: PexelsPhoto[] };

export async function GET(request: Request) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Pexels search is not configured. Set PEXELS_API_KEY.", configured: false, assets: [] }
    );
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(`pexels:${ip}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many stock photo searches. Please try again later." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  const orientationParam = searchParams.get("orientation");
  const orientation = orientationParam === "portrait" || orientationParam === "landscape" || orientationParam === "square"
    ? orientationParam
    : "portrait";

  const endpoint = query ? `${PEXELS_API_BASE}/search` : `${PEXELS_API_BASE}/curated`;
  const params = new URLSearchParams({ per_page: "18" });
  if (query) params.set("query", query);
  if (query) params.set("orientation", orientation);

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Authorization: apiKey },
      next: { revalidate: 60 * 60 * 12 }
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("[pexels] search failed:", response.status, message.slice(0, 160));
      return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
    }

    const data = (await response.json()) as PexelsResponse;
    const assets: CoverAsset[] = (data.photos ?? []).map((photo) => ({
      id: `pexels-${photo.id}`,
      url: photo.src.large2x || photo.src.original,
      previewUrl: photo.src.medium ?? photo.src.large,
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
    }));

    return NextResponse.json({ assets, configured: true });
  } catch (error) {
    console.error("[pexels] request failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Stock photo search is temporarily unavailable." }, { status: 502 });
  }
}
