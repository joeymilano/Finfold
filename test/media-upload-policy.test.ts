import { describe, expect, it } from "vitest";
import { mediaAssetSchema } from "@/lib/content-schema";
import {
  inspectMediaUpload,
  inspectMediaUploadBytes,
  isAcceptedMediaUploadFile,
  isAcceptedMediaUploadMimeType,
  MAX_MEDIA_DECODED_PIXELS,
  MEDIA_UPLOAD_ACCEPT
} from "@/lib/media-upload-policy";

describe("media upload policy", () => {
  it("exposes an exact client-side MIME allowlist", () => {
    expect(MEDIA_UPLOAD_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(isAcceptedMediaUploadMimeType("image/jpeg")).toBe(true);
    expect(isAcceptedMediaUploadMimeType("image/png")).toBe(true);
    expect(isAcceptedMediaUploadMimeType("image/webp")).toBe(true);
    expect(isAcceptedMediaUploadMimeType("image/gif")).toBe(false);
    expect(isAcceptedMediaUploadMimeType("image/svg+xml")).toBe(false);
    expect(isAcceptedMediaUploadMimeType("video/mp4")).toBe(false);
    expect(isAcceptedMediaUploadFile({ name: "photo.jpeg", type: "" })).toBe(true);
    expect(isAcceptedMediaUploadFile({ name: "photo.png", type: "video/mp4" })).toBe(true);
    expect(isAcceptedMediaUploadFile({ name: "animation.gif", type: "image/gif" })).toBe(false);
  });

  it.each([
    ["JPEG", makeJpeg(1600, 900), "image/jpeg"],
    ["PNG", makePng(1200, 1500), "image/png"],
    ["WebP VP8X", makeWebpVp8x(1280, 720), "image/webp"],
    ["WebP VP8L", makeWebpVp8l(640, 640), "image/webp"],
    ["WebP VP8", makeWebpVp8(1920, 1080), "image/webp"]
  ] as const)("accepts %s magic bytes and dimensions", (_label, bytes, contentType) => {
    const result = inspectMediaUploadBytes(bytes);

    expect(result).toMatchObject({ ok: true, contentType });
    if (result.ok) {
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.pixelCount).toBe(result.width * result.height);
    }
  });

  it("uses file bytes instead of a spoofed browser MIME value", async () => {
    const validPngClaimingToBeVideo = makeArrayBufferBlob(makePng(300, 200), "video/mp4");
    const htmlClaimingToBePng = makeArrayBufferBlob(
      new TextEncoder().encode("<html>not an image</html>"),
      "image/png"
    );

    await expect(inspectMediaUpload(validPngClaimingToBeVideo)).resolves.toMatchObject({
      ok: true,
      contentType: "image/png",
      width: 300,
      height: 200
    });
    await expect(inspectMediaUpload(htmlClaimingToBePng)).resolves.toEqual({
      ok: false,
      code: "unsupported_type"
    });
  });

  it.each([
    ["GIF", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
    ["MP4", bytesWithAscii(12, 4, "ftyp")],
    ["HTML", new TextEncoder().encode("<html></html>")]
  ])("rejects %s uploads", (_label, bytes) => {
    expect(inspectMediaUploadBytes(bytes)).toEqual({
      ok: false,
      code: "unsupported_type"
    });
  });

  it("rejects a recognized image whose dimensions cannot be read", () => {
    expect(inspectMediaUploadBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      ok: false,
      code: "invalid_dimensions"
    });
  });

  it("rejects obviously truncated PNG and WebP containers", () => {
    expect(inspectMediaUploadBytes(makePng(320, 240).slice(0, -12))).toEqual({
      ok: false,
      code: "invalid_structure"
    });
    expect(inspectMediaUploadBytes(makeWebpVp8l(320, 240).slice(0, -1))).toEqual({
      ok: false,
      code: "invalid_structure"
    });
  });

  it("rejects APNG and animated WebP containers", () => {
    expect(inspectMediaUploadBytes(makeApng(320, 240))).toEqual({
      ok: false,
      code: "animated_image"
    });
    expect(inspectMediaUploadBytes(makeAnimatedWebp(320, 240))).toEqual({
      ok: false,
      code: "animated_image"
    });
  });

  it("applies animation checks through the bounded Blob path", async () => {
    await expect(
      inspectMediaUpload(makeArrayBufferBlob(makeApng(320, 240), "image/png"))
    ).resolves.toEqual({ ok: false, code: "animated_image" });
    await expect(
      inspectMediaUpload(makeArrayBufferBlob(makeAnimatedWebp(320, 240), "image/webp"))
    ).resolves.toEqual({ ok: false, code: "animated_image" });
  });

  it("accepts the decoded-pixel boundary and rejects the first larger image", () => {
    const atLimit = inspectMediaUploadBytes(makePng(5000, 4000));
    const overLimit = inspectMediaUploadBytes(makePng(5001, 4000));

    expect(MAX_MEDIA_DECODED_PIXELS).toBe(20_000_000);
    expect(atLimit).toMatchObject({ ok: true, pixelCount: MAX_MEDIA_DECODED_PIXELS });
    expect(overLimit).toEqual({
      ok: false,
      code: "pixel_limit",
      width: 5001,
      height: 4000
    });
  });

  it("keeps legacy video assets readable while denying new video upload MIME types", () => {
    expect(
      mediaAssetSchema.parse({
        id: "legacy-video",
        name: "launch.mp4",
        type: "video",
        size: 1024,
        url: "https://example.com/launch.mp4"
      }).type
    ).toBe("video");
    expect(isAcceptedMediaUploadMimeType("video/mp4")).toBe(false);
  });
});

function makePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(57);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeUint32BigEndian(bytes, 8, 13);
  writeAscii(bytes, 12, "IHDR");
  writeUint32BigEndian(bytes, 16, width);
  writeUint32BigEndian(bytes, 20, height);
  writeUint32BigEndian(bytes, 33, 0);
  writeAscii(bytes, 37, "IDAT");
  writeUint32BigEndian(bytes, 45, 0);
  writeAscii(bytes, 49, "IEND");
  bytes.set([0xae, 0x42, 0x60, 0x82], 53);
  return bytes;
}

function makeApng(width: number, height: number): Uint8Array {
  const png = makePng(width, height);
  const bytes = new Uint8Array(png.length + 20);
  bytes.set(png.slice(0, 33), 0);
  writeUint32BigEndian(bytes, 33, 8);
  writeAscii(bytes, 37, "acTL");
  writeUint32BigEndian(bytes, 41, 1);
  writeUint32BigEndian(bytes, 45, 0);
  bytes.set(png.slice(33), 53);
  return bytes;
}

function makeJpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(19);
  bytes.set([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x07, 0x08]);
  writeUint16BigEndian(bytes, 13, height);
  writeUint16BigEndian(bytes, 15, width);
  bytes.set([0xff, 0xd9], 17);
  return bytes;
}

function makeWebpVp8x(width: number, height: number): Uint8Array {
  const bytes = makeWebpContainer("VP8X", 10, 48);
  writeUint24LittleEndian(bytes, 24, width - 1);
  writeUint24LittleEndian(bytes, 27, height - 1);
  writeAscii(bytes, 30, "VP8 ");
  writeUint32LittleEndian(bytes, 34, 10);
  return bytes;
}

function makeAnimatedWebp(width: number, height: number): Uint8Array {
  const bytes = makeWebpVp8x(width, height);
  bytes[20] |= 0x02;
  return bytes;
}

function makeWebpVp8l(width: number, height: number): Uint8Array {
  const bytes = makeWebpContainer("VP8L", 5, 26);
  bytes[20] = 0x2f;
  const packedDimensions = (width - 1) | ((height - 1) << 14);
  writeUint32LittleEndian(bytes, 21, packedDimensions);
  return bytes;
}

function makeWebpVp8(width: number, height: number): Uint8Array {
  const bytes = makeWebpContainer("VP8 ", 10, 30);
  bytes.set([0x9d, 0x01, 0x2a], 23);
  writeUint16LittleEndian(bytes, 26, width);
  writeUint16LittleEndian(bytes, 28, height);
  return bytes;
}

function makeWebpContainer(chunkType: string, chunkSize: number, totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  writeAscii(bytes, 0, "RIFF");
  writeUint32LittleEndian(bytes, 4, totalBytes - 8);
  writeAscii(bytes, 8, "WEBP");
  writeAscii(bytes, 12, chunkType);
  writeUint32LittleEndian(bytes, 16, chunkSize);
  return bytes;
}

function bytesWithAscii(length: number, offset: number, value: string): Uint8Array {
  const bytes = new Uint8Array(length);
  writeAscii(bytes, offset, value);
  return bytes;
}

function makeArrayBufferBlob(bytes: Uint8Array, type: string): Blob {
  return {
    size: bytes.byteLength,
    type,
    slice(start = 0, end = bytes.byteLength) {
      const sliced = bytes.slice(start, end);
      return {
        arrayBuffer: async () => sliced.buffer
      } as Blob;
    }
  } as Blob;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function writeUint16BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint16LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint24LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint32LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
