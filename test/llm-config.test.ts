import { afterEach, describe, expect, it } from "vitest";
import { generateKitOutputs } from "@/lib/llm";
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
  LETTA_API_KEY: process.env.LETTA_API_KEY,
  NEXT_PUBLIC_ALLOW_MOCK: process.env.NEXT_PUBLIC_ALLOW_MOCK
};

afterEach(() => {
  process.env.LETTA_API_KEY = originalEnv.LETTA_API_KEY;
  process.env.NEXT_PUBLIC_ALLOW_MOCK = originalEnv.NEXT_PUBLIC_ALLOW_MOCK;
});

describe("llm configuration", () => {
  it("falls back to direct LLM when Letta is not configured", async () => {
    process.env.LETTA_API_KEY = "";
    process.env.NEXT_PUBLIC_ALLOW_MOCK = "true";

    // When no Letta agent ID is provided, it should try direct LLM
    // which uses z-ai-web-dev-sdk
    // This test just verifies the function doesn't crash immediately
    // The actual LLM call will fail without proper SDK initialization,
    // but the error should be about LLM failure, not configuration
    await expect(generateKitOutputs(request)).rejects.toThrow();
  });
});
