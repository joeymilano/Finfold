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
  LLM_API_BASE: process.env.LLM_API_BASE,
  LETTA_API_KEY: process.env.LETTA_API_KEY,
  NEXT_PUBLIC_ALLOW_MOCK: process.env.NEXT_PUBLIC_ALLOW_MOCK
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

describe("llm configuration", () => {
  it("fails loudly when neither Letta nor a direct LLM is configured", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LETTA_API_KEY;
    process.env.NEXT_PUBLIC_ALLOW_MOCK = "true";

    await expect(generateKitOutputs(request)).rejects.toThrow(
      "AI generation is not configured"
    );
  });

  it("does NOT treat a Letta-pointed LLM_API_BASE as a usable direct LLM endpoint", async () => {
    // Regression: api.letta.com has no agent-less /chat/completions endpoint,
    // so a Letta base must never be used for the direct path even with a key.
    // With no Letta key either, generation must fail to configure rather than
    // POST to the broken endpoint.
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.letta.com/v1";
    delete process.env.LETTA_API_KEY;
    process.env.NEXT_PUBLIC_ALLOW_MOCK = "true";

    await expect(generateKitOutputs(request)).rejects.toThrow(
      "AI generation is not configured"
    );
  });
});
