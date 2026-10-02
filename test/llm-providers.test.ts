import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLLMProviders, withProviderFailover, LLMRequestError } from "@/lib/llm-providers";

const originalEnv = {
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_BASE: process.env.LLM_API_BASE,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_MODEL_SONNET: process.env.LLM_MODEL_SONNET,
  LLM_MODEL_OPUS: process.env.LLM_MODEL_OPUS,
  LLM_VISION_MODEL: process.env.LLM_VISION_MODEL,
  LLM_VIDEO: process.env.LLM_VIDEO,
  PRIMARY_KEY: process.env.PRIMARY_KEY,
  BACKUP_KEY: process.env.BACKUP_KEY
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
});

describe("resolveLLMProviders", () => {
  it("falls back to a single provider built from legacy LLM_API_BASE/KEY when LLM_PROVIDERS is unset", () => {
    delete process.env.LLM_PROVIDERS;
    process.env.LLM_API_KEY = "legacy-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    process.env.LLM_MODEL_SONNET = "sonnet-model";
    process.env.LLM_VISION_MODEL = "vision-model";
    process.env.LLM_VIDEO = "true";

    const providers = resolveLLMProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].apiBase).toBe("https://api.example.com/v1");
    expect(providers[0].apiKey).toBe("legacy-key");
    expect(providers[0].models.haiku).toBe("base-model");
    expect(providers[0].models.sonnet).toBe("sonnet-model");
    expect(providers[0].visionModel).toBe("vision-model");
    expect(providers[0].supportsVideo).toBe(true);
  });

  it("returns an empty chain when nothing is configured", () => {
    delete process.env.LLM_PROVIDERS;
    delete process.env.LLM_API_KEY;
    expect(resolveLLMProviders()).toEqual([]);
  });

  it("parses an ordered LLM_PROVIDERS chain, skipping providers whose key env var is unset", () => {
    process.env.PRIMARY_KEY = "primary-secret";
    delete process.env.BACKUP_KEY;
    process.env.LLM_PROVIDERS = JSON.stringify([
      { name: "primary", base: "https://primary.example.com/v1", keyEnv: "PRIMARY_KEY", models: { haiku: "p-haiku", vision: "p-vision" }, supportsVideo: true, enableThinking: false },
      { name: "backup", base: "https://backup.example.com/v1", keyEnv: "BACKUP_KEY", models: { haiku: "b-haiku" } }
    ]);

    const providers = resolveLLMProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("primary");
    expect(providers[0].visionModel).toBe("p-vision");
    expect(providers[0].supportsVideo).toBe(true);
    expect(providers[0].enableThinking).toBe(false);
  });
});

describe("withProviderFailover", () => {
  const provider = (name: string) => ({
    name,
    apiBase: `https://${name}.example.com/v1`,
    apiKey: "key",
    models: { haiku: "m", sonnet: "m", opus: "m" },
    jsonMode: "none" as const
  });

  it("moves to the next provider after a retryable 429 exhausts its retry", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new LLMRequestError(429, "rate limited"))
      .mockRejectedValueOnce(new LLMRequestError(429, "rate limited"))
      .mockResolvedValueOnce("ok from backup");

    const result = await withProviderFailover([provider("primary"), provider("backup")], send);

    expect(result).toBe("ok from backup");
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].name).toBe("primary");
    expect(send.mock.calls[1][0].name).toBe("primary");
    expect(send.mock.calls[2][0].name).toBe("backup");
  });

  it("reports every provider attempt with retry and fallback context", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new LLMRequestError(429, "rate limited"))
      .mockRejectedValueOnce(new LLMRequestError(429, "rate limited"))
      .mockResolvedValueOnce("ok");
    const metrics: Array<{
      provider: string;
      attempt: number;
      fallback: boolean;
      outcome: string;
      status: number | null;
    }> = [];

    await withProviderFailover(
      [provider("primary"), provider("backup")],
      send,
      { onAttempt: (metric) => metrics.push(metric) }
    );

    expect(metrics).toMatchObject([
      { provider: "primary", attempt: 1, fallback: false, outcome: "failed", status: 429 },
      { provider: "primary", attempt: 2, fallback: false, outcome: "failed", status: 429 },
      { provider: "backup", attempt: 1, fallback: true, outcome: "succeeded", status: null }
    ]);
  });

  it("does not retry a non-retryable error before failing over", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new LLMRequestError(400, "bad request"))
      .mockResolvedValueOnce("ok from backup");

    const result = await withProviderFailover([provider("primary"), provider("backup")], send);

    expect(result).toBe("ok from backup");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("moves immediately from an exhausted free-tier model to the next pool", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new LLMRequestError(403, "AllocationQuota.FreeTierOnly"))
      .mockResolvedValueOnce("ok from next free pool");

    const result = await withProviderFailover(
      [provider("qwen-free-latest"), provider("qwen-free-snapshot")],
      send
    );

    expect(result).toBe("ok from next free pool");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([entry]) => entry.name)).toEqual([
      "qwen-free-latest",
      "qwen-free-snapshot"
    ]);
  });

  it("throws the last error once every provider is exhausted", async () => {
    const send = vi.fn().mockRejectedValue(new LLMRequestError(500, "down"));

    await expect(withProviderFailover([provider("primary"), provider("backup")], send)).rejects.toThrow("down");
    expect(send).toHaveBeenCalledTimes(4); // 2 providers x (1 attempt + 1 retry)
  });

  it("throws immediately when no providers are configured", async () => {
    const send = vi.fn();
    await expect(withProviderFailover([], send)).rejects.toThrow("no direct LLM provider is configured");
    expect(send).not.toHaveBeenCalled();
  });
});
