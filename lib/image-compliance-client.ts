import jsQR from "jsqr";
import type { MediaAsset } from "@/lib/content-schema";

export type QrCodeScanStatus = "detected" | "not-detected" | "unavailable";

export type ImageComplianceResult = {
  qrCode: QrCodeScanStatus;
};

const MAX_SCAN_EDGE = 2048;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

/**
 * Best-effort, entirely local QR scan. Image pixels never leave the browser
 * for this check and decoded QR payloads are deliberately not retained.
 */
export async function inspectImageCompliance(blob: Blob): Promise<ImageComplianceResult> {
  try {
    const image = await loadImage(blob);
    try {
      const regions = scanRegions(image.width, image.height);
      for (const region of regions) {
        if (scanRegion(image.source, region)) return { qrCode: "detected" };
      }
      return { qrCode: "not-detected" };
    } finally {
      image.dispose();
    }
  } catch {
    // Compliance scanning is advisory. An unsupported browser must not make a
    // valid image impossible to upload, but the UI will avoid claiming it was
    // checked successfully.
    return { qrCode: "unavailable" };
  }
}

export function hasQrCodeRisk(asset: Pick<MediaAsset, "compliance">): boolean {
  return asset.compliance?.qrCode === "detected";
}

async function loadImage(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close()
    };
  }

  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Image decoding is unavailable.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl)
  };
}

type ScanRegion = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

function scanRegions(width: number, height: number): ScanRegion[] {
  const full = { sourceX: 0, sourceY: 0, sourceWidth: width, sourceHeight: height };
  if (Math.max(width, height) <= MAX_SCAN_EDGE) return [full];

  // A whole-image pass catches normal layouts. Overlapping quadrant passes
  // preserve small corner QR codes that could disappear when a large product
  // screenshot is reduced to the whole-image scan size.
  const regionWidth = Math.ceil(width * 0.58);
  const regionHeight = Math.ceil(height * 0.58);
  return [
    full,
    { sourceX: 0, sourceY: 0, sourceWidth: regionWidth, sourceHeight: regionHeight },
    { sourceX: width - regionWidth, sourceY: 0, sourceWidth: regionWidth, sourceHeight: regionHeight },
    { sourceX: 0, sourceY: height - regionHeight, sourceWidth: regionWidth, sourceHeight: regionHeight },
    { sourceX: width - regionWidth, sourceY: height - regionHeight, sourceWidth: regionWidth, sourceHeight: regionHeight }
  ];
}

function scanRegion(source: CanvasImageSource, region: ScanRegion): boolean {
  if (typeof document === "undefined") throw new Error("Canvas is unavailable.");
  const scale = Math.min(1, MAX_SCAN_EDGE / Math.max(region.sourceWidth, region.sourceHeight));
  const width = Math.max(1, Math.round(region.sourceWidth * scale));
  const height = Math.max(1, Math.round(region.sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas pixels are unavailable.");

  context.drawImage(
    source,
    region.sourceX,
    region.sourceY,
    region.sourceWidth,
    region.sourceHeight,
    0,
    0,
    width,
    height
  );
  const pixels = context.getImageData(0, 0, width, height);
  return Boolean(jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" }));
}
