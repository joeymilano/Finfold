import { afterEach, describe, expect, it, vi } from "vitest";
import { sendUntrustedContentPrompt } from "@/lib/llm";
import { filterProvidersForPolicy, resolveLLMProviders, type LLMProvider } from "@/lib/llm-providers";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Chrome extension provider cost firewall", () => {
  it("labels missing and legacy provider configuration as paid", () => {
    process.env.LLM_PROVIDERS = JSON.stringify([
      { name: "unlabelled", base: "https://paid.example/v1", keyEnv: "PAID_TEST_KEY" }
    ]);
    process.env.PAID_TEST_KEY = "secret";
    expect(resolveLLMProviders()[0]?.costClass).toBe("paid");

    delete process.env.LLM_PROVIDERS;
    process.env.LLM_API_KEY = "legacy-secret";
    expect(resolveLLMProviders()[0]?.costClass).toBe("paid");
  });

  it("keeps only explicitly marked free-pool providers", () => {
    const provider = (name: string, costClass: "free_pool" | "paid"): LLMProvider => ({
      name,
      apiBase: `https://${name}.example/v1`,
      apiKey: "secret",
      models: { haiku: "model", sonnet: "model", opus: "model" },
      jsonMode: "none",
      costClass
    });
    expect(filterProvidersForPolicy([provider("free", "free_pool"), provider("paid", "paid")], "free_only").map((item) => item.name)).toEqual(["free"]);
  });

  it("never falls through to a paid provider and sends the 700-token hard cap", async () => {
    process.env.FREE_TEST_KEY = "free-key";
    process.env.PAID_TEST_KEY = "paid-key";
    process.env.LLM_PROVIDERS = JSON.stringify([
      { name: "free", base: "https://free.example/v1", keyEnv: "FREE_TEST_KEY", costClass: "free_pool", models: { haiku: "free-model" }, jsonMode: "none" },
      { name: "paid", base: "https://paid.example/v1", keyEnv: "PAID_TEST_KEY", costClass: "paid", models: { haiku: "paid-model" }, jsonMode: "none" }
    ]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response("quota exhausted", { status: 500 })
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendUntrustedContentPrompt("Return JSON", {
      providerPolicy: "free_only",
      maxTokens: 700,
      maxAttemptsPerProvider: 1
    })).rejects.toThrow("LLM request failed: 500");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://free.example/v1/chat/completions");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.max_tokens).toBe(700);
  });

  it("rejects free-only traffic before fetch when only paid providers exist", async () => {
    delete process.env.LLM_PROVIDERS;
    process.env.LLM_API_KEY = "paid-legacy-key";
    process.env.LLM_API_BASE = "https://paid.example/v1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendUntrustedContentPrompt("Return JSON", { providerPolicy: "free_only" }))
      .rejects.toThrow("FREE_POOL_UNAVAILABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
