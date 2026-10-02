export type ExportImageSize = {
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
};

export type ExportProgressStage = "fonts" | "capture" | "encode" | "done";

export type ExportProgressCallback = (stage: ExportProgressStage, percent: number) => void;

/** Rough per-stage weight used to drive the estimated-time progress bar in CoverStudio. */
export const exportStageWeights: Record<ExportProgressStage, number> = {
  fonts: 0.15,
  capture: 0.35,
  encode: 0.85,
  done: 1
};

function downloadDataUrl(filename: string, dataUrl: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * `modern-screenshot` serializes the DOM at call time. A visible browser
 * preview is not enough: an off-screen export node can still be waiting for
 * its image, which otherwise produces a convincing but image-less PNG.
 */
async function waitForCoverImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map((image) => new Promise<void>((resolve, reject) => {
    if (image.complete) {
      if (image.naturalWidth > 0) resolve();
      else reject(new Error("The cover image could not be loaded for export."));
      return;
    }
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error("The cover image could not be loaded for export.")), { once: true });
  })));
}

/**
 * Render a poster node to a PNG and trigger a download.
 * Node must already be sized to `size.cssWidth × size.cssHeight` in CSS px;
 * `scale` blows it up to the true export resolution during capture.
 */
export async function exportCoverPng(
  node: HTMLElement,
  size: ExportImageSize,
  filename: string,
  onProgress?: ExportProgressCallback
): Promise<void> {
  onProgress?.("fonts", exportStageWeights.fonts);
  await document.fonts.ready;
  await waitForCoverImages(node);

  const { domToPng } = await import("modern-screenshot");
  const captureOptions = {
    scale: size.scale,
    width: size.cssWidth,
    height: size.cssHeight,
    font: false
  } as const;

  onProgress?.("capture", exportStageWeights.capture);

  // Safari sometimes returns a blank/partial capture on the first pass —
  // capturing twice and keeping the second result is modern-screenshot's
  // documented workaround.
  await domToPng(node, captureOptions);

  onProgress?.("encode", exportStageWeights.encode);

  const dataUrl = await domToPng(node, captureOptions);

  downloadDataUrl(filename, dataUrl);
  onProgress?.("done", exportStageWeights.done);
}

/**
 * Render a poster node to a PNG data URL (no download) — used to save a
 * template cover back as the kit output's cover image. Same Safari double-render
 * workaround as exportCoverPng.
 */
export async function exportCoverPngToDataUrl(
  node: HTMLElement,
  size: ExportImageSize,
  onProgress?: ExportProgressCallback
): Promise<string> {
  onProgress?.("fonts", exportStageWeights.fonts);
  await document.fonts.ready;
  await waitForCoverImages(node);
  const { domToPng } = await import("modern-screenshot");
  const captureOptions = { scale: size.scale, width: size.cssWidth, height: size.cssHeight, font: false } as const;
  onProgress?.("capture", exportStageWeights.capture);
  await domToPng(node, captureOptions);
  onProgress?.("encode", exportStageWeights.encode);
  const dataUrl = await domToPng(node, captureOptions);
  onProgress?.("done", exportStageWeights.done);
  return dataUrl;
}

export function coverFilename(platform: string, sizeId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `finfold-cover-${platform}-${sizeId}-${date}.png`;
}
