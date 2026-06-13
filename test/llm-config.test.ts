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
  LLM_API_KEY: process.env.LLM_API_KEY,
  NEXT_PUBLIC_ALLOW_MOCK: process.env.NEXT_PUBLIC_ALLOW_MOCK
};

afterEach(() => {
  process.env.LLM_API_KEY = originalEnv.LLM_API_KEY;
  process.env.NEXT_PUBLIC_ALLOW_MOCK = originalEnv.NEXT_PUBLIC_ALLOW_MOCK;
});

describe("llm configuration", () => {
  it("fails loudly when AI is not configured", async () => {
    process.env.LLM_API_KEY = "";
    process.env.NEXT_PUBLIC_ALLOW_MOCK = "true";

    await expect(generateKitOutputs(request)).rejects.toThrow(
      "AI generation is not configured. Please set LLM_API_KEY"
    );
  });
});
