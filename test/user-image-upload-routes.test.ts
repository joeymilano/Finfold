import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_MULTIPART_MAX_BYTES,
  IMAGE_MULTIPART_MAX_BYTES
} from "@/lib/bounded-form-data";

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => "upload-test-user",
  createSupabaseAdminClient: () => null,
  hasSupabaseConfig: () => true,
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "upload-test-user" } } }),
      updateUser: async () => ({ error: null })
    }
  })
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => true,
  persistenceUnavailableMessage: () => "unavailable"
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => true
}));

vi.mock("@/lib/llm", () => ({
  sendRawPromptWithImages: async () => "{}"
}));

import { POST as captureImage } from "@/app/api/capture/image/route";
import { POST as saveCover } from "@/app/api/kits/[kitId]/outputs/[outputId]/cover/route";
import { POST as uploadAvatar } from "@/app/api/auth/avatar/route";

const uploadRoutes = [
  {
    name: "capture image",
    maxRequestBytes: IMAGE_MULTIPART_MAX_BYTES,
    invoke: (request: Request) => captureImage(request)
  },
  {
    name: "cover",
    maxRequestBytes: IMAGE_MULTIPART_MAX_BYTES,
    invoke: (request: Request) =>
      saveCover(request, {
        params: Promise.resolve({ kitId: "kit-1", outputId: "output-1" })
      })
  },
  {
    name: "avatar",
    maxRequestBytes: AVATAR_MULTIPART_MAX_BYTES,
    invoke: (request: Request) => uploadAvatar(request)
  }
];

describe.each(uploadRoutes)("$name upload policy", ({ invoke, maxRequestBytes }) => {
  it("rejects GIF bytes even when the browser claims PNG", async () => {
    const response = await invoke(
      makeFileRequest(
        makeFile(
          "spoofed.png",
          "image/png",
          Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
        ),
        maxRequestBytes === AVATAR_MULTIPART_MAX_BYTES
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("rejects images above 20 megapixels", async () => {
    const response = await invoke(
      makeFileRequest(
        makeFile("oversized.png", "image/png", makePng(5001, 4000)),
        maxRequestBytes === AVATAR_MULTIPART_MAX_BYTES
      )
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("20");
    expect(body.error).toContain("5001×4000");
  });

  it("rejects an oversized actual stream without Content-Length", async () => {
    const response = await invoke(makeOversizedMultipartRequest(maxRequestBytes));

    expect(response.status).toBe(413);
  });
});

function makeFileRequest(file: File, includeUserId = false): Request {
  const formData = new FormData();
  formData.append("file", file);
  if (includeUserId) formData.append("userId", "upload-test-user");
  return {
    formData: async () => formData
  } as Request;
}

function makeOversizedMultipartRequest(maxBytes: number): Request {
  const boundary = "finfold-route-limit";
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let emitted = 0; emitted <= maxBytes; emitted += chunk.byteLength) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });

  return {
    body,
    headers: new Headers({
      "content-type": `multipart/form-data; boundary=${boundary}`
    }),
    formData: vi.fn()
  } as unknown as Request;
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
