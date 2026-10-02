import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKitOutputs } from "@/lib/llm";
import type { GenerateRequest } from "@/lib/content-schema";

const request: GenerateRequest = {
  ideaText: "Launch OS helps B2B AI teams turn product updates into platform-native launch content with stronger hooks and clearer positioning.",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["linkedin", "x", "wechat", "xiaohongshu"],
  mediaAssets: [],
  language: "en"
};

const originalEnv = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_BASE: process.env.LLM_API_BASE,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  LETTA_API_KEY: process.env.LETTA_API_KEY,
  HUMAN_WRITING_ENABLED: process.env.HUMAN_WRITING_ENABLED
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function outputFor(platform: string) {
  return { platform, title: "t", body: "b", cta: "c", notes: "n", strategy: "s" };
}

afterEach(() => {
  vi.restoreAllMocks();
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
});

describe("direct-LLM batching and single-platform salvage", () => {
  it("ignores outputs for platforms the user did not request", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;
    process.env.HUMAN_WRITING_ENABLED = "false";

    const linkedinOnlyRequest: GenerateRequest = { ...request, platforms: ["linkedin"] };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  outputs: [outputFor("xiaohongshu"), outputFor("linkedin"), outputFor("x")]
                })
              }
            }
          ]
        }),
        { status: 200 }
      )
    );

    const outputs = await generateKitOutputs(linkedinOnlyRequest, { modelTier: "haiku" });

    expect(outputs.map((output) => output.platform)).toEqual(["linkedin"]);
  });

  it("requests platforms in batches of 2 instead of one all-platform request", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;
    process.env.HUMAN_WRITING_ENABLED = "false";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      const userContent = body.messages.at(-1).content as string;
      // Each batch's prompt only asks for its own platforms — reflect them
      // back so the assertions below can tell which batch this was.
      const requested = ["linkedin", "x", "wechat", "xiaohongshu"].filter((p) =>
        userContent.includes(`id: "${p}"`)
      );
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: requested.map(outputFor) }) } }] }),
        { status: 200 }
      );
    });

    const outputs = await generateKitOutputs(request, { modelTier: "haiku" });

    // 4 platforms at BATCH_SIZE=2 -> 2 batch requests, no single request
    // asking for all 4 platforms at once.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(outputs.map((o) => o.platform)).toEqual(["linkedin", "x", "wechat", "xiaohongshu"]);
  });

  it("recovers a platform dropped by truncation on the batch's own retry attempt", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;
    process.env.HUMAN_WRITING_ENABLED = "false";

    const twoPlatformRequest: GenerateRequest = { ...request, platforms: ["linkedin", "x"] };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      const userContent = body.messages.at(-1).content as string;
      if (userContent.includes('id: "linkedin"') && userContent.includes('id: "x"')) {
        // Simulate a truncated first-attempt batch response that only
        // salvages "linkedin" — "x" stays missing after this call.
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: [outputFor("linkedin")] }) } }] }),
          { status: 200 }
        );
      }
      // The batch's second attempt asks only for the still-missing "x" and
      // succeeds — no separate single-platform salvage round is needed.
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: [outputFor("x")] }) } }] }),
        { status: 200 }
      );
    });

    const outputs = await generateKitOutputs(twoPlatformRequest, { modelTier: "haiku" });

    expect(outputs.map((o) => o.platform)).toEqual(["linkedin", "x"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // attempt 1 (both) salvages linkedin; attempt 2 (x only) salvages x
  });

  it("falls back to the single-platform salvage pass when a batch exhausts both attempts", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    process.env.LLM_MODEL = "base-model";
    delete process.env.LLM_PROVIDERS;
    delete process.env.LETTA_API_KEY;
    process.env.HUMAN_WRITING_ENABLED = "false";

    const twoPlatformRequest: GenerateRequest = { ...request, platforms: ["linkedin", "x"] };
    let xOnlyRequestCount = 0;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      const userContent = body.messages.at(-1).content as string;
      if (userContent.includes('id: "linkedin"') && userContent.includes('id: "x"')) {
        // The batch's first attempt (both platforms requested) only
        // salvages "linkedin" — "x" stays missing.
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: [outputFor("linkedin")] }) } }] }),
          { status: 200 }
        );
      }
      // A request for "x" alone happens twice: the batch loop's own retry
      // attempt (missing=["x"]), then the dedicated single-platform salvage
      // round after the batch is exhausted. Only the SECOND one succeeds,
      // so recovery can only be explained by the salvage round existing.
      xOnlyRequestCount += 1;
      if (xOnlyRequestCount === 1) {
        return new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: [] }) } }] }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outputs: [outputFor("x")] }) } }] }),
        { status: 200 }
      );
    });

    const outputs = await generateKitOutputs(twoPlatformRequest, { modelTier: "haiku" });

    expect(fetchSpy).toHaveBeenCalledTimes(3); // batch attempt 1 (both) + batch attempt 2 (x only, empty) + salvage (x only, succeeds)
    expect(outputs.map((o) => o.platform)).toEqual(["linkedin", "x"]);
  });
});
