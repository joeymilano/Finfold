import { afterEach, describe, expect, it } from "vitest";
import { resolveImageProviders, workersAiSupportsSize } from "@/lib/image-providers";

const originalEnv = {
  DASHSCOPE_FREE_API_KEY: process.env.DASHSCOPE_FREE_API_KEY,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  IMAGE_DASHSCOPE_FREE_ENABLED: process.env.IMAGE_DASHSCOPE_FREE_ENABLED,
  IMAGE_DASHSCOPE_FREE_API_BASE: process.env.IMAGE_DASHSCOPE_FREE_API_BASE,
  IMAGE_DASHSCOPE_FREE_PRO_MODEL: process.env.IMAGE_DASHSCOPE_FREE_PRO_MODEL,
  IMAGE_DASHSCOPE_FREE_MODEL: process.env.IMAGE_DASHSCOPE_FREE_MODEL,
  IMAGE_DASHSCOPE_ENABLED: process.env.IMAGE_DASHSCOPE_ENABLED,
  IMAGE_DASHSCOPE_API_BASE: process.env.IMAGE_DASHSCOPE_API_BASE,
  IMAGE_DASHSCOPE_QWEN_PRO_MODEL: process.env.IMAGE_DASHSCOPE_QWEN_PRO_MODEL,
  IMAGE_DASHSCOPE_QWEN_MODEL: process.env.IMAGE_DASHSCOPE_QWEN_MODEL,
  IMAGE_DASHSCOPE_WAN_PRO_MODEL: process.env.IMAGE_DASHSCOPE_WAN_PRO_MODEL,
  IMAGE_DASHSCOPE_MODEL: process.env.IMAGE_DASHSCOPE_MODEL,
  IMAGE_DASHSCOPE_THINKING: process.env.IMAGE_DASHSCOPE_THINKING,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_AI_TOKEN: process.env.CLOUDFLARE_AI_TOKEN,
  IMAGE_WORKERS_AI_ENABLED: process.env.IMAGE_WORKERS_AI_ENABLED,
  IMAGE_WORKERS_AI_COVER_MODEL: process.env.IMAGE_WORKERS_AI_COVER_MODEL,
  IMAGE_WORKERS_AI_MODEL: process.env.IMAGE_WORKERS_AI_MODEL,
  IMAGE_API_KEY: process.env.IMAGE_API_KEY,
  IMAGE_API_BASE: process.env.IMAGE_API_BASE,
  IMAGE_MODEL: process.env.IMAGE_MODEL
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
});

describe("resolveImageProviders", () => {
  it("returns an empty chain when no provider is configured", () => {
    delete process.env.DASHSCOPE_FREE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
    delete process.env.IMAGE_API_KEY;

    expect(resolveImageProviders()).toEqual([]);
  });

  it("reserves Pro quota and premium providers for an unreferenced cover", () => {
    process.env.DASHSCOPE_FREE_API_KEY = "free-key";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_AI_TOKEN = "token-1";
    process.env.IMAGE_API_KEY = "agnes-key";

    const providers = resolveImageProviders();

    expect(providers.map((p) => p.name)).toEqual([
      "dashscope-free-qwen-image-pro",
      "workers-ai",
      "dashscope-qwen-image-pro",
      "dashscope-qwen-image",
      "dashscope-wan",
      "agnes"
    ]);
    expect(providers[0]).toMatchObject({
      apiBase: "https://dashscope.aliyuncs.com",
      model: "qwen-image-3.0-pro",
      requestStyle: "qwen-image",
      outputResolution: "2k"
    });
    expect(providers[1]).toMatchObject({
      model: "@cf/black-forest-labs/flux-2-klein-9b"
    });
    expect(providers[2]).toMatchObject({
      model: "qwen-image-3.0-pro",
      outputResolution: "native"
    });
    expect(providers[4]).toMatchObject({
      apiBase: "https://dashscope.aliyuncs.com",
      model: "wan2.7-image",
      requestStyle: "wan",
      outputResolution: "2k",
      thinkingMode: true
    });
  });

  it("uses only Standard quality pools for batch illustrations", () => {
    process.env.DASHSCOPE_FREE_API_KEY = "free-key";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_AI_TOKEN = "token-1";
    process.env.IMAGE_API_KEY = "agnes-key";

    const providers = resolveImageProviders({ purpose: "illustration" });

    expect(providers.map((p) => p.name)).toEqual([
      "dashscope-free-qwen-image",
      "workers-ai",
      "dashscope-qwen-image",
      "dashscope-wan",
      "agnes"
    ]);
    expect(providers[1]).toMatchObject({ model: "@cf/black-forest-labs/flux-2-klein-4b" });
    expect(providers.map((p) => p.model)).not.toContain("wan2.7-image-pro");
  });

  it("routes referenced covers to Wan Pro without spending the Workers AI pool", () => {
    process.env.DASHSCOPE_FREE_API_KEY = "free-key";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_AI_TOKEN = "token-1";
    process.env.IMAGE_API_KEY = "agnes-key";

    const providers = resolveImageProviders({ purpose: "cover", hasReferenceImage: true });

    expect(providers.map((p) => p.name)).toEqual([
      "dashscope-free-qwen-image-pro",
      "dashscope-wan-pro",
      "dashscope-qwen-image-pro",
      "dashscope-qwen-image",
      "dashscope-wan",
      "agnes"
    ]);
    expect(providers[1]).toMatchObject({
      model: "wan2.7-image-pro",
      requestStyle: "wan",
      outputResolution: "2k"
    });
  });

  it("falls back to Agnes only when Workers AI credentials are missing", () => {
    delete process.env.DASHSCOPE_FREE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
    process.env.IMAGE_API_KEY = "agnes-key";

    const providers = resolveImageProviders();

    expect(providers.map((p) => p.name)).toEqual(["agnes"]);
  });

  it("excludes Workers AI when explicitly disabled even with credentials present", () => {
    delete process.env.DASHSCOPE_FREE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_AI_TOKEN = "token-1";
    process.env.IMAGE_WORKERS_AI_ENABLED = "false";
    process.env.IMAGE_API_KEY = "agnes-key";

    const providers = resolveImageProviders();

    expect(providers.map((p) => p.name)).toEqual(["agnes"]);
  });

  it("uses only Workers AI when Agnes is not configured", () => {
    delete process.env.DASHSCOPE_FREE_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct-1";
    process.env.CLOUDFLARE_AI_TOKEN = "token-1";
    delete process.env.IMAGE_API_KEY;

    const providers = resolveImageProviders();

    expect(providers).toEqual([{
      name: "workers-ai",
      kind: "cloudflare-rest",
      accountId: "acct-1",
      apiToken: "token-1",
      model: "@cf/black-forest-labs/flux-2-klein-9b"
    }]);
  });

  it("uses the workspace Wan endpoint and permits an explicit thinking opt-out", () => {
    delete process.env.DASHSCOPE_FREE_API_KEY;
    process.env.IMAGE_DASHSCOPE_FREE_ENABLED = "false";
    process.env.DASHSCOPE_API_KEY = "dashscope-key";
    process.env.IMAGE_DASHSCOPE_API_BASE = "https://workspace.cn-beijing.maas.aliyuncs.com/";
    process.env.IMAGE_DASHSCOPE_MODEL = "wan2.7-image";
    process.env.IMAGE_DASHSCOPE_THINKING = "false";
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
    delete process.env.IMAGE_API_KEY;

    expect(resolveImageProviders({ purpose: "illustration" })).toEqual([
      {
        name: "dashscope-qwen-image",
        kind: "dashscope-multimodal",
        apiBase: "https://workspace.cn-beijing.maas.aliyuncs.com",
        apiKey: "dashscope-key",
        model: "qwen-image-3.0",
        requestStyle: "qwen-image",
        outputResolution: "2k"
      },
      {
        name: "dashscope-wan",
        kind: "dashscope-multimodal",
        apiBase: "https://workspace.cn-beijing.maas.aliyuncs.com",
        apiKey: "dashscope-key",
        model: "wan2.7-image",
        requestStyle: "wan",
        outputResolution: "2k",
        thinkingMode: false
      }
    ]);
  });

  it("can consume free image quotas with a dedicated general-endpoint key", () => {
    process.env.DASHSCOPE_FREE_API_KEY = "free-key";
    delete process.env.DASHSCOPE_API_KEY;
    process.env.IMAGE_DASHSCOPE_FREE_API_BASE = "https://dashscope.aliyuncs.com/";
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_AI_TOKEN;
    delete process.env.IMAGE_API_KEY;

    expect(resolveImageProviders({ purpose: "cover" })).toEqual([
      {
        name: "dashscope-free-qwen-image-pro",
        kind: "dashscope-multimodal",
        apiBase: "https://dashscope.aliyuncs.com",
        apiKey: "free-key",
        model: "qwen-image-3.0-pro",
        requestStyle: "qwen-image",
        outputResolution: "2k"
      }
    ]);
    expect(resolveImageProviders({ purpose: "illustration" })).toEqual([
      {
        name: "dashscope-free-qwen-image",
        kind: "dashscope-multimodal",
        apiBase: "https://dashscope.aliyuncs.com",
        apiKey: "free-key",
        model: "qwen-image-3.0",
        requestStyle: "qwen-image",
        outputResolution: "2k"
      }
    ]);
  });
});

describe("workersAiSupportsSize", () => {
  it("returns true — width/height are confirmed real multipart fields, and an actual rejection still fails safely over to Agnes", () => {
    expect(workersAiSupportsSize()).toBe(true);
  });
});
