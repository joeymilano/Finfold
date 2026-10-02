import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  admin: null as object | null,
  avatarUpdateError: null as { message: string } | null,
  previousAvatarUrl: null as string | null,
  ocrRaw: '{"summary":"Useful screenshot","keyPoints":["Visible product update"]}',
  refund: vi.fn(async () => undefined),
  settle: vi.fn(async () => undefined)
}));

vi.mock("@/lib/payment", () => ({
  ACTION_CREDITS: { quickResearch: 1 },
  ensurePlanCredits: async () => undefined
}));

vi.mock("@/lib/payment/entitlements", () => ({
  getActiveSubscription: () => null,
  resolveEffectivePlan: () => "starter"
}));

vi.mock("@/lib/payment/ai-usage-billing", () => ({
  createAiUsageBilling: () => ({
    reserveAndStart: async () => ({ outcome: "authorized", available: 99 }),
    settle: routeState.settle,
    refund: routeState.refund
  })
}));

vi.mock("@/lib/generation-runs", () => ({
  hashGenerationRequest: async () => "test-fingerprint",
  resolveGenerationRequestId: () => "test-request-id"
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => "upload-test-user",
  createSupabaseAdminClient: () => routeState.admin,
  hasSupabaseConfig: () => true,
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "upload-test-user",
            user_metadata: { avatar_url: routeState.previousAvatarUrl }
          }
        }
      }),
      updateUser: async () => ({ error: routeState.avatarUpdateError })
    }
  })
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => false,
  persistenceUnavailableMessage: () => "unavailable"
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => true
}));

vi.mock("@/lib/llm", () => ({
  sendRawPromptWithImages: async () => routeState.ocrRaw
}));

import { POST as captureImage } from "@/app/api/capture/image/route";
import { POST as saveCover } from "@/app/api/kits/[kitId]/outputs/[outputId]/cover/route";
import { POST as uploadAvatar } from "@/app/api/auth/avatar/route";

describe("user image upload cleanup", () => {
  beforeEach(() => {
    routeState.admin = null;
    routeState.avatarUpdateError = null;
    routeState.previousAvatarUrl = null;
    routeState.ocrRaw = '{"summary":"Useful screenshot","keyPoints":["Visible product update"]}';
    routeState.refund.mockClear();
    routeState.settle.mockClear();
    vi.restoreAllMocks();
  });

  it("removes a cover object when the database update fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeCoverAdmin(upload, remove, { message: "database unavailable" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await saveCover(makeFileRequest(makePngFile()), {
      params: Promise.resolve({ kitId: "kit-1", outputId: "output-1" })
    });

    expect(response.status).toBe(400);
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("removes an avatar object when the metadata update fails", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeStorageAdmin(upload, remove);
    routeState.avatarUpdateError = { message: "metadata unavailable" };

    const response = await uploadAvatar(makeFileRequest(makePngFile(), true));

    expect(response.status).toBe(400);
    expect(upload.mock.calls[0][0]).toMatch(
      /^upload-test-user\/avatar-[0-9a-f-]+\.png$/
    );
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("removes the previous owned avatar only after metadata succeeds", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    routeState.admin = makeStorageAdmin(upload, remove);
    routeState.previousAvatarUrl =
      "https://project.supabase.co/storage/v1/object/public/avatars/upload-test-user/avatar.png?t=old";

    const response = await uploadAvatar(makeFileRequest(makePngFile(), true));

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(["upload-test-user/avatar.png"]);
    expect(remove).not.toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it("waits for temporary OCR object cleanup before responding", async () => {
    let finishCleanup: ((value: { error: null }) => void) | undefined;
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockImplementation(
      () => new Promise<{ error: null }>((resolve) => {
        finishCleanup = resolve;
      })
    );
    routeState.admin = makeStorageAdmin(upload, remove);

    let responseSettled = false;
    const responsePromise = captureImage(makeFileRequest(makePngFile())).then((response) => {
      responseSettled = true;
      return response;
    });

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(responseSettled).toBe(false);

    finishCleanup?.({ error: null });
    const response = await responsePromise;
    expect(response.status).toBe(200);
  });

  it("logs an OCR cleanup marker without exposing the storage error message", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockRejectedValue(
      new Error("sensitive/user/path-and-provider-detail")
    );
    routeState.admin = makeStorageAdmin(upload, remove);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await captureImage(makeFileRequest(makePngFile()));

    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      "[capture/image] Temporary OCR object cleanup threw:",
      "Error"
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive/user/path");
  });

  it("refunds malformed vision output and reports a retryable provider error", async () => {
    routeState.admin = makeStorageAdmin(
      vi.fn().mockResolvedValue({ error: null }),
      vi.fn().mockResolvedValue({ error: null })
    );
    routeState.ocrRaw = "not json";

    const response = await captureImage(makeFileRequest(makePngFile()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "unusable_model_response" });
    expect(routeState.refund).toHaveBeenCalledWith("image_capture_unusable_response");
    expect(routeState.settle).not.toHaveBeenCalled();
  });

  it("refunds a valid empty extraction and distinguishes it from a provider error", async () => {
    routeState.admin = makeStorageAdmin(
      vi.fn().mockResolvedValue({ error: null }),
      vi.fn().mockResolvedValue({ error: null })
    );
    routeState.ocrRaw = '{"summary":"","keyPoints":[]}';

    const response = await captureImage(makeFileRequest(makePngFile()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "no_usable_content" });
    expect(routeState.refund).toHaveBeenCalledWith("image_capture_no_content");
    expect(routeState.settle).not.toHaveBeenCalled();
  });
});

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
    },
    from: (table: string) => makeBillingQuery(table)
  };
}

function makeBillingQuery(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: table === "profiles" ? { plan: "starter" } : null, error: null })
  };
  return query;
}

function makeCoverAdmin(
  upload: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>,
  updateError: { message: string } | null
): object {
  const admin = makeStorageAdmin(upload, remove) as {
    storage: object;
    from?: (table: string) => object;
  };
  const selectChain = {
    select: () => selectChain,
    eq: () => selectChain,
    maybeSingle: async () => ({
      data: { id: "output-1", kit_id: "kit-1", user_id: "upload-test-user" },
      error: null
    })
  };
  const updateChain = {
    error: updateError,
    eq: () => updateChain
  };
  admin.from = () => ({
    select: () => selectChain,
    update: () => updateChain
  });
  return admin;
}

function makeFileRequest(file: File, includeUserId = false): Request {
  const formData = new FormData();
  formData.append("file", file);
  if (includeUserId) formData.append("userId", "upload-test-user");
  return {
    headers: new Headers(),
    formData: async () => formData
  } as Request;
}

function makePngFile(): File {
  const bytes = makePng(640, 480);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], "safe.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: async () => buffer.slice(0)
  });
  Object.defineProperty(file, "slice", {
    configurable: true,
    value(start = 0, end = bytes.byteLength) {
      const sliced = bytes.slice(start, end);
      return { arrayBuffer: async () => sliced.buffer } as Blob;
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
