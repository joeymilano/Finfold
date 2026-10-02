// Screenshot intake for the reply form: clipboard paste, drag-and-drop and
// the file picker all funnel through compressImage so one bounded jpeg data
// URL reaches the server regardless of the source size.

export const IMAGE_ERROR = { TOO_LARGE: "IMAGE_TOO_LARGE", INVALID: "IMAGE_INVALID" } as const;

const MAX_EDGE = 1280;
const MAX_DATA_URL = 1_400_000;

export async function compressImage(file: Blob): Promise<string> {
  if (!file.type.startsWith("image/") || file.size === 0) throw new Error(IMAGE_ERROR.INVALID);
  const bitmap = await loadBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error(IMAGE_ERROR.INVALID);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > MAX_DATA_URL && quality > 0.4) {
      quality -= 0.15;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrl.length > MAX_DATA_URL) throw new Error(IMAGE_ERROR.TOO_LARGE);
    return dataUrl;
  } finally {
    // ImageBitmap needs an explicit release; an <img> element has nothing to close.
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error(IMAGE_ERROR.INVALID);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageFromClipboard(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
