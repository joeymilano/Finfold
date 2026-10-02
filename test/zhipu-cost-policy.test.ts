import { afterEach, expect, it, vi } from "vitest";
import { resolveLLMProviders, filterProvidersForPolicy } from "@/lib/llm-providers";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("never spends the purchased GLM plan on anonymous free-only extension traffic", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-07T12:00:00+08:00"));
  vi.stubEnv("ZHIPU_ENABLED", "true");
  vi.stubEnv("ZHIPU_API_KEY", "synthetic-key");
  vi.stubEnv("ZHIPU_API_MODE", "coding-plan");
  vi.stubEnv("ZHIPU_API_BASE", "https://open.bigmodel.cn/api/coding/paas/v4");
  vi.stubEnv("ZHIPU_PRIORITY_EXPIRES_AT", "2026-10-07T00:00:00+08:00");
  vi.stubEnv("LLM_PROVIDERS", JSON.stringify([{ name: "free", base: "https://free.example/v1", keyEnv: "TEST_FREE_KEY", costClass: "free_pool" }]));
  vi.stubEnv("TEST_FREE_KEY", "synthetic-free-key");
  const providers = resolveLLMProviders();
  expect(providers.map(p => p.name)).toEqual(["zhipu", "free"]);
  expect(filterProvidersForPolicy(providers, "free_only").map(p => p.name)).toEqual(["free"]);
});
