import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKitOutputs, sendRawPromptWithImages } from "@/lib/llm";
import type { GenerateRequest } from "@/lib/content-schema";

const request: GenerateRequest = {
  ideaText: "Launch OS helps B2B AI teams turn product updates into platform-native launch content with stronger hooks and clearer positioning.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["linkedin"],
  mediaAssets: [],
  language: "en"
};

const originalEnv = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_BASE: process.env.LLM_API_BASE,
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  LETTA_API_KEY: process.env.LETTA_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  HUMAN_WRITING_ENABLED: process.env.HUMAN_WRITING_ENABLED,
  LLM_VISION: process.env.LLM_VISION
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function setDeepseekQwenChain() {
  process.env.DEEPSEEK_API_KEY = "ds-key";
  process.env.DASHSCOPE_API_KEY = "qwen-key";
  process.env.LLM_PROVIDERS = JSON.stringify([
    {
      name: "deepseek",
      base: "https://api.deepseek.com",
      keyEnv: "DEEPSEEK_API_KEY",
      models: { haiku: "deepseek-v4-flash", sonnet: "deepseek-v4-pro", opus: "deepseek-v4-pro" },
      jsonMode: "object"
    },
    {
      name: "qwen",
      base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      keyEnv: "DASHSCOPE_API_KEY",
      models: { haiku: "qwen3.8-flash", sonnet: "qwen3.8-flash", opus: "qwen3.8-flash", vision: "qwen3.8-flash" },
      supportsVideo: true,
      enableThinking: false,
      jsonMode: "object"
    }
  ]);
  delete process.env.LETTA_API_KEY;
  process.env.HUMAN_WRITING_ENABLED = "false";
}

function outputsPayload() {
  return JSON.stringify({
    outputs: [{ platform: "linkedin", title: "t", body: "b", cta: "c", notes: "n", strategy: "s" }]
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
});

describe("DeepSeek-first provider chain", () => {
  it("sends the first request to DeepSeek when both DeepSeek and Qwen are configured", async () => {
    setDeepseekQwenChain();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), { status: 200 })
    );

    await generateKitOutputs(request, { modelTier: "haiku" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("api.deepseek.com");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("deepseek-v4-flash");
  });

  it("maps sonnet/opus tiers to deepseek-v4-pro", async () => {
    setDeepseekQwenChain();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), { status: 200 })
    );

    await generateKitOutputs(request, { modelTier: "sonnet" });

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("deepseek-v4-pro");
  });

  it("moves to Qwen immediately on a DeepSeek 402 (insufficient balance) without retrying DeepSeek", async () => {
    setDeepseekQwenChain();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.deepseek.com")) {
        return new Response(JSON.stringify({ error: "Insufficient Balance" }), { status: 402 });
      }
      if (url.includes("dashscope.aliyuncs.com")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), {
          status: 200
        });
      }
      return new Response("unexpected", { status: 404 });
    });

    const outputs = await generateKitOutputs(request, { modelTier: "haiku" });

    const deepseekCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes("api.deepseek.com"));
    const qwenCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes("dashscope.aliyuncs.com"));
    expect(deepseekCalls).toHaveLength(1); // 402 is non-retryable, so no same-provider retry
    expect(qwenCalls.length).toBeGreaterThanOrEqual(1);
    expect(outputs).toHaveLength(1);
  });

  it("retries DeepSeek once on a 429 before failing over to Qwen", async () => {
    setDeepseekQwenChain();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.deepseek.com")) {
        return new Response(JSON.stringify({ error: "Rate Limit Reached" }), { status: 429 });
      }
      if (url.includes("dashscope.aliyuncs.com")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), {
          status: 200
        });
      }
      return new Response("unexpected", { status: 404 });
    });

    await generateKitOutputs(request, { modelTier: "haiku" });

    const deepseekCalls = fetchSpy.mock.calls.filter(([input]) => String(input).includes("api.deepseek.com"));
    expect(deepseekCalls).toHaveLength(2); // 1 attempt + 1 retry on the same (retryable) provider
  });

  it("sends response_format: json_object to both DeepSeek and Qwen", async () => {
    setDeepseekQwenChain();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), { status: 200 })
    );

    await generateKitOutputs(request, { modelTier: "haiku" });

    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("routes a request with media assets to Qwen (the vision-capable provider) first, even though DeepSeek is chain-first", async () => {
    // DeepSeek has no visionModel at all, so it must never receive media.
    setDeepseekQwenChain();
    const requestWithMedia: GenerateRequest = {
      ...request,
      mediaAssets: [{ id: "asset-1", type: "image", url: "https://cdn.example/product.png", name: "shot.png", size: 1024 }]
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), { status: 200 })
    );

    await generateKitOutputs(requestWithMedia, { modelTier: "haiku" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("dashscope.aliyuncs.com");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("qwen3.8-flash");
    expect(body.messages.at(-1).content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "image_url" })])
    );
  });

  it("routes video evidence to Qwen's multimodal model and preserves the video content part", async () => {
    setDeepseekQwenChain();
    const requestWithVideo: GenerateRequest = {
      ...request,
      mediaAssets: [{ id: "video-1", type: "video", url: "https://cdn.example/demo.mp4", name: "demo.mp4", size: 2048 }]
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: outputsPayload() } }] }), { status: 200 })
    );

    await generateKitOutputs(requestWithVideo, { modelTier: "haiku" });

    expect(String(fetchSpy.mock.calls[0][0])).toContain("dashscope.aliyuncs.com");
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.model).toBe("qwen3.8-flash");
    expect(body.messages.at(-1).content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "video_url" })])
    );
  });

  it("does not silently discard Workbench media when vision is disabled", async () => {
    setDeepseekQwenChain();
    process.env.LLM_VISION = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(generateKitOutputs({
      ...request,
      mediaAssets: [{ id: "asset-1", type: "image", url: "https://cdn.example/product.png", name: "shot.png", size: 1024 }]
    }, { modelTier: "haiku" })).rejects.toThrow("did not generate without the attached image or video evidence");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sendRawPromptWithImages throws instead of sending images to a text-only DeepSeek model", async () => {
    // Only DeepSeek configured, no vision-capable provider at all.
    process.env.DEEPSEEK_API_KEY = "ds-key";
    process.env.LLM_PROVIDERS = JSON.stringify([
      {
        name: "deepseek",
        base: "https://api.deepseek.com",
        keyEnv: "DEEPSEEK_API_KEY",
        models: { haiku: "deepseek-v4-flash", sonnet: "deepseek-v4-pro", opus: "deepseek-v4-pro" },
        jsonMode: "object"
      }
    ]);
    delete process.env.LLM_API_KEY;
    delete process.env.LETTA_API_KEY;

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendRawPromptWithImages("describe this", ["https://cdn.example/shot.png"])).rejects.toThrow(
      "vision model"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sendRawPromptWithImages fails closed when vision is explicitly disabled", async () => {
    setDeepseekQwenChain();
    process.env.LLM_VISION = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendRawPromptWithImages("describe this", ["https://cdn.example/shot.png"])).rejects.toThrow(
      "LLM_VISION=false"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
