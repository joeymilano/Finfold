import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  admin: null as object | null,
  localMock: true
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => "media-test-user",
  createSupabaseAdminClient: () => routeState.admin
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => routeState.localMock,
  persistenceUnavailableMessage: () => "unavailable"
}));

import { POST } from "@/app/api/media/route";

describe("POST /api/media format boundary", () => {
  beforeEach(() => {
    routeState.admin = null;
    routeState.localMock = true;
  });

  it.each([
    ["GIF", makeFile("animation.gif", "image/gif", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))],
    ["video", makeFile("clip.mp4", "video/mp4", makeMp4Header())],
    ["other", makeFile("page.png", "image/png", new TextEncoder().encode("<html></html>"))]
  ])("explicitly rejects %s uploads", async (_label, file) => {
    const response = await POST(makeUploadRequest(file));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("must be a JPEG, PNG, or WebP image");
  });

  it("rejects an image above the decoded-pixel limit", async () => {
    const response = await POST(
      makeUploadRequest(makeFile("too-large.png", "image/png", makePng(5001, 4000)))
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("20-megapixel decoded image limit");
    expect(body.error).toContain("5001×4000");
  });

  it("accepts a supported PNG container and always creates a new image asset", async () => {
    const response = await POST(
      makeUploadRequest(makeFile("screenshot.bin", "video/mp4", makePng(1200, 800)))
    );
    const body = (await response.json()) as {
      persisted?: boolean;
      assets?: Array<{ name: string; type: string; size: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.persisted).toBe(false);
    expect(body.assets).toMatchObject([
      { name: "screenshot.bin", type: "image", size: 57 }
    ]);
  });

  it("returns 413 before parsing a declared oversized multipart request", async () => {
    const response = await POST(
      new Request("https://www.finfold.app/api/media", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=oversized",
          "content-length": String(28 * 1024 * 1024)
        },
        body: "x"
      })
    );

    expect(response.status).toBe(413);
  });

  it("removes earlier objects when a later storage upload fails", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "storage unavailable" } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeStorageAdmin(upload, remove);
    routeState.localMock = false;

    const response = await POST(
      makeUploadRequest(
        makeFile("first.png", "image/png", makePng(640, 480)),
        makeFile("second.png", "image/png", makePng(800, 600))
      )
    );

    expect(response.status).toBe(400);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("removes earlier objects when a later file read throws", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeStorageAdmin(upload, remove);
    routeState.localMock = false;
    const second = makeFile("second.png", "image/png", makePng(800, 600));
    Object.defineProperty(second, "arrayBuffer", {
      configurable: true,
      value: async () => {
        throw new Error("file read failed");
      }
    });

    const response = await POST(
      makeUploadRequest(
        makeFile("first.png", "image/png", makePng(640, 480)),
        second
      )
    );

    expect(response.status).toBe(400);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
});

function makeUploadRequest(...files: File[]): Request {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return {
    formData: async () => formData
  } as Request;
}

function makeStorageAdmin(
  upload: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>
): object {
  const bucket = {
    upload,
    remove,
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://storage.example/${path}` }
    })
  };
  return {
    storage: {
      from: () => bucket
    }
  };
}

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: async () => buffer.slice(0)
  });
  Object.defineProperty(file, "slice", {
    configurable: true,
    value(start = 0, end = bytes.byteLength) {
      const sliced = bytes.slice(start, end);
      return {
        arrayBuffer: async () => sliced.buffer
      } as Blob;
    }
  });
  return file;
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

function makeMp4Header(): Uint8Array {
  const bytes = new Uint8Array(12);
  writeAscii(bytes, 4, "ftyp");
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
