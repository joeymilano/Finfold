import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceState = vi.hoisted(() => ({
  admin: null as object | null,
  bytes: new Uint8Array() as Uint8Array<ArrayBufferLike>
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => persistenceState.admin
}));

vi.mock("@/lib/safe-url", () => ({
  IMAGE_CONTENT_TYPES: ["image/*"],
  safeExternalFetch: async () => ({ ok: true }),
  readBytesWithLimit: async () => persistenceState.bytes,
  bytesToArrayBuffer: (bytes: Uint8Array) => {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  }
}));

import { persistGeneratedImage } from "@/lib/image-persistence";

describe("generated image persistence policy", () => {
  beforeEach(() => {
    persistenceState.bytes = new Uint8Array();
    persistenceState.admin = null;
  });

  it.each([
    ["GIF", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
    ["over-20MP PNG", makePng(5001, 4000)],
    ["truncated PNG", makePng(640, 480).slice(0, -12)]
  ])("keeps the remote URL and never stores a rejected %s", async (_label, bytes) => {
    const upload = vi.fn();
    persistenceState.admin = makeAdmin(upload);
    persistenceState.bytes = bytes;

    await expect(
      persistGeneratedImage("user-1", "https://images.example/source")
    ).resolves.toBe("https://images.example/source");
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads an inspected PNG with a migration-compatible MIME type", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    persistenceState.admin = makeAdmin(upload);
    persistenceState.bytes = makePng(640, 480);

    await expect(
      persistGeneratedImage("user-1", "https://images.example/source")
    ).resolves.toContain("/media/user-1/covers/");
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toMatch(/^user-1\/covers\/.+\.png$/);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/png" });
  });
});

function makeAdmin(upload: ReturnType<typeof vi.fn>): object {
  const bucket = {
    upload,
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://storage.example/media/${path}` }
    })
  };
  return {
    storage: {
      from: () => bucket
    }
  };
}

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

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
