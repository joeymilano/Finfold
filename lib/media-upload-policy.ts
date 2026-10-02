export const MEDIA_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type MediaUploadMimeType = (typeof MEDIA_UPLOAD_MIME_TYPES)[number];

export const MEDIA_UPLOAD_ACCEPT = MEDIA_UPLOAD_MIME_TYPES.join(",");
export const MAX_MEDIA_DECODED_PIXELS = 20_000_000;

// Image dimensions live near the start of the supported formats. Keeping this
// window bounded avoids buffering an entire upload merely to validate it.
const MAX_IMAGE_HEADER_BYTES = 512 * 1024;
const MAX_CONTAINER_CHUNKS = 256;
const PNG_IEND_BYTES = [
  0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82
] as const;

type MediaUploadFailure = {
  ok: false;
  code:
    | "unsupported_type"
    | "invalid_dimensions"
    | "invalid_structure"
    | "animated_image"
    | "pixel_limit";
  width?: number;
  height?: number;
};

export type MediaUploadInspection =
  | {
      ok: true;
      contentType: MediaUploadMimeType;
      width: number;
      height: number;
      pixelCount: number;
    }
  | MediaUploadFailure;

type ImageDimensions = {
  width: number;
  height: number;
};

export function isAcceptedMediaUploadMimeType(value: string): value is MediaUploadMimeType {
  return MEDIA_UPLOAD_MIME_TYPES.some((contentType) => contentType === value);
}

/**
 * Browser MIME metadata is sometimes empty or incorrect. The client may use a
 * supported extension as a usability hint; the server remains authoritative
 * and validates magic bytes plus dimensions before persistence.
 */
export function isAcceptedMediaUploadFile(file: {
  name: string;
  type: string;
}): boolean {
  return (
    isAcceptedMediaUploadMimeType(file.type) ||
    /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
}

// These bounded checks reject unsupported formats, implausible dimensions,
// obvious container truncation, and animation markers. They are not a decoder,
// re-encoder, EXIF scrubber, or substitute for the remaining private pipeline.
export async function inspectMediaUpload(blob: Blob): Promise<MediaUploadInspection> {
  const header = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, MAX_IMAGE_HEADER_BYTES)).arrayBuffer()
  );
  const inspection = inspectMediaUploadHeaderBytes(header);
  if (!inspection.ok) return inspection;

  const structureFailure =
    inspection.contentType === "image/png"
      ? await inspectPngBlobStructure(blob)
      : inspection.contentType === "image/webp"
        ? await inspectWebpBlobStructure(blob, header)
        : null;

  return structureFailure ? { ok: false, code: structureFailure } : inspection;
}

export function inspectMediaUploadBytes(bytes: Uint8Array): MediaUploadInspection {
  const inspection = inspectMediaUploadHeaderBytes(bytes);
  if (!inspection.ok) return inspection;

  const structureFailure =
    inspection.contentType === "image/png"
      ? inspectPngBytesStructure(bytes)
      : inspection.contentType === "image/webp"
        ? inspectWebpBytesStructure(bytes)
        : null;

  return structureFailure ? { ok: false, code: structureFailure } : inspection;
}

/**
 * Reads only the bounded header window. Source-image discovery uses this to
 * rank remote candidates without buffering every full-resolution asset; the
 * selected image still goes through inspectMediaUploadBytes before storage.
 */
export function inspectMediaUploadHeaderBytes(bytes: Uint8Array): MediaUploadInspection {
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) {
    return validateDimensions("image/jpeg", readJpegDimensions(bytes));
  }

  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return validateDimensions("image/png", readPngDimensions(bytes));
  }

  if (asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WEBP")) {
    return validateDimensions("image/webp", readWebpDimensions(bytes));
  }

  return { ok: false, code: "unsupported_type" };
}

function validateDimensions(
  contentType: MediaUploadMimeType,
  dimensions: ImageDimensions | null
): MediaUploadInspection {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { ok: false, code: "invalid_dimensions" };
  }

  const { width, height } = dimensions;
  if (width > Math.floor(MAX_MEDIA_DECODED_PIXELS / height)) {
    return { ok: false, code: "pixel_limit", width, height };
  }

  return {
    ok: true,
    contentType,
    width,
    height,
    pixelCount: width * height
  };
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 33 ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    !asciiEquals(bytes, 12, "IHDR")
  ) {
    return null;
  }

  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20)
  };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (isStartOfFrameMarker(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        width: readUint16BigEndian(bytes, offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function isStartOfFrameMarker(marker: number): boolean {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 20) return null;

  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const chunkSize = readUint32LittleEndian(bytes, 16);

  if (chunkType === "VP8X") {
    if (chunkSize !== 10 || bytes.length < 30) return null;
    return {
      width: 1 + readUint24LittleEndian(bytes, 24),
      height: 1 + readUint24LittleEndian(bytes, 27)
    };
  }

  if (chunkType === "VP8L") {
    if (chunkSize < 5 || bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const packed = readUint32LittleEndian(bytes, 21);
    return {
      width: 1 + (packed & 0x3fff),
      height: 1 + ((packed >>> 14) & 0x3fff)
    };
  }

  if (chunkType === "VP8 ") {
    if (
      chunkSize < 10 ||
      bytes.length < 30 ||
      !matches(bytes, 23, [0x9d, 0x01, 0x2a])
    ) {
      return null;
    }
    return {
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff
    };
  }

  return null;
}

type ContainerFailure = "invalid_structure" | "animated_image" | null;

async function inspectPngBlobStructure(blob: Blob): Promise<ContainerFailure> {
  if (blob.size < 45) return "invalid_structure";

  const tail = await readBlobRange(blob, blob.size - PNG_IEND_BYTES.length, PNG_IEND_BYTES.length);
  if (!matches(tail, 0, [...PNG_IEND_BYTES])) return "invalid_structure";

  let offset = 8;
  for (let chunkIndex = 0; chunkIndex < MAX_CONTAINER_CHUNKS; chunkIndex += 1) {
    const header = await readBlobRange(blob, offset, 8);
    if (header.length !== 8) return "invalid_structure";

    const chunkLength = readUint32BigEndian(header, 0);
    const chunkType = asciiFromBytes(header, 4, 4);
    const nextOffset = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > blob.size) return "invalid_structure";

    if (offset === 8 && (chunkType !== "IHDR" || chunkLength !== 13)) {
      return "invalid_structure";
    }
    if (chunkType === "acTL") return "animated_image";
    if (chunkType === "IDAT") return null;
    if (chunkType === "IEND") return "invalid_structure";

    offset = nextOffset;
  }

  return "invalid_structure";
}

function inspectPngBytesStructure(bytes: Uint8Array): ContainerFailure {
  if (
    bytes.length < 45 ||
    !matches(bytes, bytes.length - PNG_IEND_BYTES.length, [...PNG_IEND_BYTES])
  ) {
    return "invalid_structure";
  }

  let offset = 8;
  for (let chunkIndex = 0; chunkIndex < MAX_CONTAINER_CHUNKS; chunkIndex += 1) {
    if (offset + 8 > bytes.length) return "invalid_structure";

    const chunkLength = readUint32BigEndian(bytes, offset);
    const chunkType = asciiFromBytes(bytes, offset + 4, 4);
    const nextOffset = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) return "invalid_structure";

    if (offset === 8 && (chunkType !== "IHDR" || chunkLength !== 13)) {
      return "invalid_structure";
    }
    if (chunkType === "acTL") return "animated_image";
    if (chunkType === "IDAT") return null;
    if (chunkType === "IEND") return "invalid_structure";

    offset = nextOffset;
  }

  return "invalid_structure";
}

async function inspectWebpBlobStructure(
  blob: Blob,
  header: Uint8Array
): Promise<ContainerFailure> {
  if (header.length < 20 || readUint32LittleEndian(header, 4) + 8 !== blob.size) {
    return "invalid_structure";
  }

  let offset = 12;
  let sawImageData = false;
  for (let chunkIndex = 0; chunkIndex < MAX_CONTAINER_CHUNKS; chunkIndex += 1) {
    if (offset === blob.size) return sawImageData ? null : "invalid_structure";

    const chunkHeader = await readBlobRange(blob, offset, 8);
    if (chunkHeader.length !== 8) return "invalid_structure";
    const chunkType = asciiFromBytes(chunkHeader, 0, 4);
    const chunkLength = readUint32LittleEndian(chunkHeader, 4);
    const paddedLength = chunkLength + (chunkLength % 2);
    const nextOffset = offset + 8 + paddedLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > blob.size) return "invalid_structure";

    if (chunkType === "VP8X") {
      if (offset !== 12 || chunkLength !== 10) return "invalid_structure";
      const flags = await readBlobRange(blob, offset + 8, 1);
      if (flags.length !== 1) return "invalid_structure";
      if ((flags[0] & 0x02) !== 0) return "animated_image";
    }
    if (chunkType === "ANIM" || chunkType === "ANMF") return "animated_image";
    if (chunkType === "VP8 " || chunkType === "VP8L") {
      const minimumLength = chunkType === "VP8 " ? 10 : 5;
      if (chunkLength < minimumLength) return "invalid_structure";
      sawImageData = true;
    }

    offset = nextOffset;
  }

  return "invalid_structure";
}

function inspectWebpBytesStructure(bytes: Uint8Array): ContainerFailure {
  if (bytes.length < 20 || readUint32LittleEndian(bytes, 4) + 8 !== bytes.length) {
    return "invalid_structure";
  }

  let offset = 12;
  let sawImageData = false;
  for (let chunkIndex = 0; chunkIndex < MAX_CONTAINER_CHUNKS; chunkIndex += 1) {
    if (offset === bytes.length) return sawImageData ? null : "invalid_structure";
    if (offset + 8 > bytes.length) return "invalid_structure";

    const chunkType = asciiFromBytes(bytes, offset, 4);
    const chunkLength = readUint32LittleEndian(bytes, offset + 4);
    const paddedLength = chunkLength + (chunkLength % 2);
    const nextOffset = offset + 8 + paddedLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) return "invalid_structure";

    if (chunkType === "VP8X") {
      if (offset !== 12 || chunkLength !== 10) return "invalid_structure";
      if ((bytes[offset + 8] & 0x02) !== 0) return "animated_image";
    }
    if (chunkType === "ANIM" || chunkType === "ANMF") return "animated_image";
    if (chunkType === "VP8 " || chunkType === "VP8L") {
      const minimumLength = chunkType === "VP8 " ? 10 : 5;
      if (chunkLength < minimumLength) return "invalid_structure";
      sawImageData = true;
    }

    offset = nextOffset;
  }

  return "invalid_structure";
}

async function readBlobRange(blob: Blob, offset: number, length: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
}

function asciiFromBytes(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}

function matches(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiEquals(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}
