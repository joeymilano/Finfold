/**
 * Magic-byte sniffing for uploads. Browser-supplied `file.type` is
 * client-controlled and trivially spoofed (e.g. an .svg or .html file
 * renamed with `type: "image/png"`), so storage routes that serve uploads
 * back from a public bucket must not trust it alone. This only allowlists
 * a small set of raster/video formats — no SVG, since SVG can embed
 * <script> and is a stored-XSS vector when served from your own origin.
 */

export type SniffedKind = "image" | "video" | null;

type Signature = {
  kind: SniffedKind;
  contentType: string;
  matches: (bytes: Uint8Array) => boolean;
};

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function isAsciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

const SIGNATURES: Signature[] = [
  { kind: "image", contentType: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { kind: "image", contentType: "image/png", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { kind: "image", contentType: "image/gif", matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  {
    kind: "image",
    contentType: "image/webp",
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && isAsciiAt(b, 8, "WEBP")
  },
  // MP4/MOV/M4V: ISO base media file format — 4-byte size, then "ftyp".
  { kind: "video", contentType: "video/mp4", matches: (b) => isAsciiAt(b, 4, "ftyp") },
  { kind: "video", contentType: "video/webm", matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  { kind: "video", contentType: "video/quicktime", matches: (b) => isAsciiAt(b, 4, "moov") || isAsciiAt(b, 4, "free") }
];

/**
 * Reads the first bytes of `blob` and returns the detected kind + a safe
 * content-type to store, or null if the content doesn't match any
 * allowlisted signature (caller should reject the upload in that case).
 */
export async function sniffFileKind(blob: Blob): Promise<{ kind: SniffedKind; contentType: string } | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  for (const sig of SIGNATURES) {
    if (sig.matches(head)) {
      return { kind: sig.kind, contentType: sig.contentType };
    }
  }
  return null;
}
