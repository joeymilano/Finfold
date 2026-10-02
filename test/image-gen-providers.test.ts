import { afterEach, describe, expect, it, vi } from "vitest";

const providerState = vi.hoisted(() => ({
  providers: [] as Array<Record<string, unknown>>,
  lastOptions: null as null | Record<string, unknown>
}));
const budgetState = vi.hoisted(() => ({
  allowed: true,
  released: 0,
  estimate: 100 as number | null,
  estimatedModels: [] as string[]
}));

vi.mock("@/lib/image-providers", () => ({
  resolveImageProviders: (options: Record<string, unknown>) => {
    providerState.lastOptions = options;
    return providerState.providers;
  },
  workersAiSupportsSize: () => true,
  WORKERS_AI_MAX_REFERENCE_IMAGE_DIMENSION: 512
}));

vi.mock("@/lib/workers-ai-budget", () => ({
  estimateImageNeurons: (_size: string, _referenceCount: number, model: string) => {
    budgetState.estimatedModels.push(model);
    return budgetState.estimate;
  },
  reserveNeurons: async () => ({ allowed: budgetState.allowed }),
  releaseNeurons: async (n: number) => {
    budgetState.released += n;
  }
}));

vi.mock("@/lib/observability", () => ({
  logInfo: () => undefined,
  logWarn: () => undefined
}));

import {
  generateImage,
  normalizeNativeDashScopeOutputSize,
  normalizeWanOutputSize
} from "@/lib/image-gen";

const dashscopeProvider = {
  name: "dashscope-wan" as const,
  kind: "dashscope-multimodal" as const,
  apiBase: "https://workspace.cn-beijing.maas.aliyuncs.com",
  apiKey: "dashscope-key",
  model: "wan2.7-image",
  requestStyle: "wan" as const,
  outputResolution: "2k" as const,
  thinkingMode: true
};

const qwenImageProvider = {
  name: "dashscope-free-qwen-image-pro" as const,
  kind: "dashscope-multimodal" as const,
  apiBase: "https://dashscope.aliyuncs.com",
  apiKey: "free-key",
  model: "qwen-image-3.0-pro",
  requestStyle: "qwen-image" as const,
  outputResolution: "2k" as const
};

const paidQwenProProvider = {
  ...qwenImageProvider,
  name: "dashscope-qwen-image-pro" as const,
  apiBase: "https://workspace.cn-beijing.maas.aliyuncs.com",
  apiKey: "dashscope-key",
  outputResolution: "native" as const
};

const workersAiProvider = {
  name: "workers-ai" as const,
  kind: "cloudflare-rest" as const,
  accountId: "acct-1",
  apiToken: "cf-token",
  model: "@cf/black-forest-labs/flux-2-klein-4b"
};

const agnesProvider = {
  name: "agnes" as const,
  kind: "openai-compatible" as const,
  apiBase: "https://apihub.agnes-ai.com",
  apiKey: "agnes-key",
  model: "agnes-image-2.1-flash"
};

afterEach(() => {
  vi.restoreAllMocks();
  providerState.providers = [];
  providerState.lastOptions = null;
  budgetState.allowed = true;
  budgetState.released = 0;
  budgetState.estimate = 100;
  budgetState.estimatedModels = [];
});

describe("generateImage provider chain", () => {
  it("passes the requested purpose into provider resolution", async () => {
    providerState.providers = [agnesProvider];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
        { status: 200 }
      )
    );

    await generateImage("an article diagram", "1024x1024", undefined, { purpose: "illustration" });

    expect(providerState.lastOptions).toEqual({ purpose: "illustration", hasReferenceImage: false });
  });

  it("uses Qwen Image free quota first with prompt enhancement and near-2K output", async () => {
    providerState.providers = [qwenImageProvider, dashscopeProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("multimodal-generation/generation")) {
        return new Response(JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: "https://qwen.example/result.png" }] } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("qwen.example")) {
        return new Response(makePng(1168, 2048).buffer, {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const outcome = await generateImage("premium social cover", "768x1344");

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      model: "qwen-image-3.0-pro",
      parameters: {
        size: "1168*2048",
        n: 1,
        watermark: false,
        prompt_extend: true,
        prompt_extend_mode: "agent"
      }
    });
    expect(body.parameters).not.toHaveProperty("thinking_mode");
    expect(outcome).toMatchObject({ kind: "bytes", contentType: "image/png" });
  });

  it("moves from an exhausted Qwen Image free pool to the next configured provider", async () => {
    const standardProvider = {
      ...qwenImageProvider,
      name: "dashscope-free-qwen-image" as const,
      model: "qwen-image-3.0"
    };
    providerState.providers = [qwenImageProvider, standardProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("multimodal-generation/generation")) {
        const callIndex = fetchSpy.mock.calls.length;
        if (callIndex === 1) {
          return new Response(JSON.stringify({ code: "AllocationQuota.FreeTierOnly" }), { status: 403 });
        }
        return new Response(JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: "https://qwen.example/result.png" }] } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(makePng(2048, 2048).buffer, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    });

    await generateImage("a prompt", "1024x1024");

    const generationBodies = fetchSpy.mock.calls
      .filter(([input]) => String(input).includes("multimodal-generation/generation"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).model);
    expect(generationBodies).toEqual(["qwen-image-3.0-pro", "qwen-image-3.0"]);
  });

  it("keeps paid Qwen Pro at the native social size for the 1K price tier", async () => {
    providerState.providers = [paidQwenProProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("multimodal-generation/generation")) {
        return new Response(JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: "https://qwen.example/result.png" }] } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(makePng(1344, 768).buffer, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    });

    await generateImage("premium social cover", "1344x768");

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      model: "qwen-image-3.0-pro",
      parameters: { size: "1344*768", prompt_extend: true }
    });
  });

  it("uses Wan first with quality thinking, near-2K output, and persists the expiring result as bytes", async () => {
    providerState.providers = [dashscopeProvider, workersAiProvider, agnesProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("multimodal-generation/generation")) {
        return new Response(JSON.stringify({
          output: {
            choices: [{ message: { content: [{ type: "image", image: "https://wan.example/result.png" }] } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("wan.example")) {
        return new Response(makePng(2048, 2048).buffer, {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const outcome = await generateImage("premium social cover", "768x1344");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      model: "wan2.7-image",
      parameters: { size: "1168*2048", n: 1, watermark: false, thinking_mode: true }
    });
    expect(outcome).toMatchObject({ kind: "bytes", contentType: "image/png" });
  });

  it("fails over from Wan to Workers AI when Alibaba is busy", async () => {
    providerState.providers = [dashscopeProvider, workersAiProvider, agnesProvider];
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { image: btoa("fake-image-bytes") }, success: true }), { status: 200 })
      );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy);

    const outcome = await generateImage("a prompt", "1024x1024");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("multimodal-generation/generation");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("api.cloudflare.com");
    expect(outcome.kind).toBe("bytes");
  });

  it("uses Workers AI and returns base64 bytes when the budget allows it", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: { image: btoa("fake-image-bytes") }, success: true }), { status: 200 })
    );

    const outcome = await generateImage("a prompt", "1024x1024");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("api.cloudflare.com");
    expect(budgetState.estimatedModels).toEqual(["@cf/black-forest-labs/flux-2-klein-4b"]);
    expect(outcome.kind).toBe("bytes");
  });

  it("fails closed to the next provider when a Workers AI model has no approved estimate", async () => {
    providerState.providers = [
      { ...workersAiProvider, model: "@cf/example/unpriced-image-model" },
      agnesProvider
    ];
    budgetState.estimate = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
        { status: 200 }
      )
    );

    const outcome = await generateImage("a prompt", "1024x1024");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("apihub.agnes-ai.com");
    expect(outcome).toEqual({ kind: "url", url: "https://agnes.example/cover.png", revisedPrompt: null });
  });

  it("sends the Workers AI request as multipart/form-data with prompt/width/height fields", async () => {
    // Regression guard: flux-2-klein-4b's REST input is a required
    // `multipart` object, NOT a JSON body — confirmed against Cloudflare's
    // own changelog example. A plain JSON body gets rejected with
    // "AiError: Bad input: Error: required properties at '/' are 'multipart'".
    providerState.providers = [workersAiProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: { image: btoa("fake-image-bytes") }, success: true }), { status: 200 })
    );

    await generateImage("a sunset at the alps", "1024x1024");

    const [, init] = fetchSpy.mock.calls[0];
    const body = (init as RequestInit).body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("prompt")).toBe("a sunset at the alps");
    expect(form.get("width")).toBe("1024");
    expect(form.get("height")).toBe("1024");
    // fetch must set its own multipart boundary — never send a JSON
    // Content-Type alongside a FormData body.
    expect((init as RequestInit).headers).not.toHaveProperty("Content-Type");
  });

  it("silently skips Workers AI and falls to Agnes when the neuron budget is exhausted", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    budgetState.allowed = false;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
        { status: 200 }
      )
    );

    const outcome = await generateImage("a prompt", "1024x1024");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("apihub.agnes-ai.com");
    expect(outcome).toEqual({ kind: "url", url: "https://agnes.example/cover.png", revisedPrompt: null });
  });

  it("uses Workers AI for a non-1024x1024 size — width/height are confirmed real multipart fields", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: { image: btoa("fake-image-bytes") }, success: true }), { status: 200 })
    );

    await generateImage("a prompt", "768x1344");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("api.cloudflare.com");
    const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get("width")).toBe("768");
    expect(form.get("height")).toBe("1344");
  });

  it("skips Workers AI for a reference image over its 512x512 limit and goes straight to Agnes", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("product.example")) {
        return new Response(makePng(1024, 1024).buffer, { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response(
        JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
        { status: 200 }
      );
    });

    await generateImage("a prompt", "1024x1024", "https://product.example/shot.png");

    // 1 fetch to download+inspect the reference, 1 fetch to Agnes — Workers
    // AI is never called because the reference exceeds its 512x512 limit.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const workersAiCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes("api.cloudflare.com"));
    expect(workersAiCalls).toHaveLength(0);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain("apihub.agnes-ai.com");
  });

  it("sends a reference image under 512x512 to Workers AI as input_image_0", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("product.example")) {
        return new Response(makePng(256, 256).buffer, { status: 200, headers: { "content-type": "image/png" } });
      }
      if (url.includes("api.cloudflare.com")) {
        return new Response(JSON.stringify({ result: { image: btoa("fake-image-bytes") }, success: true }), {
          status: 200
        });
      }
      return new Response(
        JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
        { status: 200 }
      );
    });

    const outcome = await generateImage("a prompt", "1024x1024", "https://product.example/shot.png");

    const workersAiCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("api.cloudflare.com"));
    expect(workersAiCall).toBeDefined();
    const form = (workersAiCall![1] as RequestInit).body as FormData;
    expect(form.get("input_image_0")).toBeInstanceOf(Blob);
    expect(outcome.kind).toBe("bytes");
  });

  it("releases reserved neurons when Workers AI fails after reserving", async () => {
    providerState.providers = [workersAiProvider, agnesProvider];
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ url: "https://agnes.example/cover.png", revised_prompt: null }] }),
          { status: 200 }
        )
      );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchSpy);

    await generateImage("a prompt", "1024x1024");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(budgetState.released).toBe(100);
  });

  it("throws when no provider is configured", async () => {
    providerState.providers = [];
    await expect(generateImage("a prompt")).rejects.toThrow("not configured");
  });
});

describe("normalizeWanOutputSize", () => {
  it("keeps the requested aspect ratio while using Wan's 2K long edge", () => {
    expect(normalizeWanOutputSize("1024x1024")).toBe("2048*2048");
    expect(normalizeWanOutputSize("1440x720")).toBe("2048*1024");
    expect(normalizeWanOutputSize("720x1440")).toBe("1024*2048");
  });

  it("falls back to Wan's documented 2K preset for malformed sizes", () => {
    expect(normalizeWanOutputSize("bad-size")).toBe("2K");
  });
});

describe("normalizeNativeDashScopeOutputSize", () => {
  it("preserves Finfold's native one-megapixel publish sizes", () => {
    expect(normalizeNativeDashScopeOutputSize("1344x768")).toBe("1344*768");
    expect(normalizeNativeDashScopeOutputSize("768x1344")).toBe("768*1344");
    expect(normalizeNativeDashScopeOutputSize("1024x1024")).toBe("1024*1024");
  });

  it("fails safely to a valid 1K square for malformed input", () => {
    expect(normalizeNativeDashScopeOutputSize("bad-size")).toBe("1024*1024");
  });
});

function makePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(57));
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
