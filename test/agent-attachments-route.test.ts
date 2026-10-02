import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  userId: "agent-user",
  admin: null as object | null
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => routeState.userId,
  createSupabaseAdminClient: () => routeState.admin
}));

import { POST } from "@/app/api/agent/attachments/route";

describe("POST /api/agent/attachments", () => {
  beforeEach(() => {
    routeState.userId = "agent-user";
    routeState.admin = makeAdmin();
  });

  it.each([
    ["brief.pdf", "application/pdf", ascii("%PDF-1.7\n")],
    ["launch.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])],
    ["products.json", "application/json", ascii('{"products":[{"name":"Finfold"}]}')],
    ["demo.mp4", "video/mp4", mp4Header()]
  ])("accepts a valid private %s attachment", async (name, type, bytes) => {
    const response = await POST(makeUploadRequest(makeFile(name, type, bytes)));
    const body = (await response.json()) as { attachments?: Array<{ name: string; storagePath: string; url: string }> };

    expect(response.status).toBe(200);
    expect(body.attachments?.[0]).toMatchObject({ name });
    expect(body.attachments?.[0]?.storagePath).toMatch(/^agent-user\//);
    expect(body.attachments?.[0]?.url).toContain("signed.example");
  });

  it("creates a private bucket with MIME and byte limits when needed", async () => {
    const createBucket = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeAdmin({ bucketExists: false, createBucket });

    const response = await POST(makeUploadRequest(makeFile("brief.pdf", "application/pdf", ascii("%PDF-1.7\n"))));

    expect(response.status).toBe(200);
    expect(createBucket).toHaveBeenCalledWith("agent-attachments", expect.objectContaining({
      public: false,
      fileSizeLimit: 25 * 1024 * 1024
    }));
  });

  it("upgrades an existing private bucket before accepting new data MIME types", async () => {
    const updateBucket = vi.fn().mockResolvedValue({ data: { message: "Successfully updated" }, error: null });
    routeState.admin = makeAdmin({ updateBucket });

    const response = await POST(makeUploadRequest(makeFile(
      "products.json",
      "application/json",
      ascii('{"product":"Finfold"}')
    )));

    expect(response.status).toBe(200);
    expect(updateBucket).toHaveBeenCalledWith("agent-attachments", expect.objectContaining({
      public: false,
      allowedMimeTypes: expect.arrayContaining(["application/json", "text/tab-separated-values"])
    }));
  });

  it("rejects extension and byte-signature mismatches before storage", async () => {
    const upload = vi.fn();
    routeState.admin = makeAdmin({ upload });
    const response = await POST(makeUploadRequest(makeFile("notes.pdf", "application/pdf", ascii("<html>fake</html>"))));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("does not match its file type");
    expect(upload).not.toHaveBeenCalled();
  });
});

function makeAdmin(options: {
  bucketExists?: boolean;
  createBucket?: ReturnType<typeof vi.fn>;
  updateBucket?: ReturnType<typeof vi.fn>;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const upload = options.upload ?? vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const bucket = {
    upload,
    remove,
    createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }))
  };
  return {
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: options.bucketExists === false ? null : { id: "agent-attachments" }, error: null }),
      updateBucket: options.updateBucket ?? vi.fn().mockResolvedValue({ data: { message: "Successfully updated" }, error: null }),
      createBucket: options.createBucket ?? vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn(() => bucket)
    }
  };
}

function makeUploadRequest(...files: File[]): Request {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  return { formData: async () => formData, headers: new Headers({ "accept-language": "en" }) } as Request;
}

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name, { type });
  Object.defineProperty(file, "arrayBuffer", { configurable: true, value: async () => buffer.slice(0) });
  Object.defineProperty(file, "slice", {
    configurable: true,
    value(start = 0, end = bytes.byteLength) {
      const sliced = bytes.slice(start, end);
      return { arrayBuffer: async () => sliced.buffer } as Blob;
    }
  });
  return file;
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function mp4Header(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set(ascii("ftyp"), 4);
  return bytes;
}
