import type { CoverAsset } from "@/lib/cover/stock-assets";

export const PIXABAY_API_BASE = "https://pixabay.com/api/";
export const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";

export type PixabayHit = {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
  userImageURL?: string;
};

export type PixabayResponse = { hits?: PixabayHit[] };

export function pixabayAssetFromHit(hit: PixabayHit, persistedUrl?: string): CoverAsset {
  return {
    id: `pixabay-${hit.id}`,
    // Pixabay only permits its image URL for temporary search-result display.
    // Once selected, the asset is copied into Finfold's media bucket and this
    // becomes a first-party stable URL.
    url: persistedUrl ?? (hit.largeImageURL || hit.webformatURL),
    previewUrl: persistedUrl ?? (hit.previewURL || hit.webformatURL),
    width: hit.imageWidth || hit.webformatWidth,
    height: hit.imageHeight || hit.webformatHeight,
    alt: hit.tags,
    provider: "pixabay",
    photographer: hit.user,
    photographerUrl: hit.userImageURL,
    sourceUrl: hit.pageURL,
    licenseName: "Pixabay Content License",
    licenseUrl: PIXABAY_LICENSE_URL,
    attributionRequired: true
  };
}

export function pixabayOrientationForCover(orientation: "portrait" | "landscape" | "square"): "vertical" | "horizontal" | "all" {
  if (orientation === "portrait") return "vertical";
  if (orientation === "landscape") return "horizontal";
  return "all";
}

export function pixabayImageExtension(sourceUrl: string): string {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
  } catch {
    // The API response is trusted separately; JPEG is the safe default.
  }
  return "jpg";
}

export function pixabayPreviewProxyUrl(sourceUrl: string): string {
  return `/api/stock/pixabay/preview?url=${encodeURIComponent(sourceUrl)}`;
}

export function isPixabayImageUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "pixabay.com" || host.endsWith(".pixabay.com"));
  } catch {
    return false;
  }
}
