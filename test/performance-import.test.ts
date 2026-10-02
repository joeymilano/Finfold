import { afterEach, describe, expect, it, vi } from "vitest";
import { extractMetricsFromText } from "@/lib/performance-import";

const originalEnv = {
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_API_BASE: process.env.LLM_API_BASE,
  LETTA_API_KEY: process.env.LETTA_API_KEY
};

function restore(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function mockLLMResponse(content: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200 }
    )
  );
}

afterEach(() => {
  (Object.keys(originalEnv) as Array<keyof typeof originalEnv>).forEach(restore);
  vi.restoreAllMocks();
});

describe("extractMetricsFromText", () => {
  it("parses Chinese '万' number formats and reports found fields", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    delete process.env.LETTA_API_KEY;

    mockLLMResponse(
      JSON.stringify({
        metrics: {
          impressions: 12000,
          clicks: 0,
          likes: 230,
          comments: 18,
          saves: 0,
          shares: 0,
          leads: 0,
          signups: 0,
          revenue: 0
        },
        found: ["impressions", "likes", "comments"],
        notes: "在看 mapped to likes."
      })
    );

    const result = await extractMetricsFromText("阅读量 1.2万 在看 45 点赞 230 留言 18", "wechat", "zh");

    expect(result.metrics.impressions).toBe(12000);
    expect(result.metrics.likes).toBe(230);
    expect(result.found).toEqual(["impressions", "likes", "comments"]);
  });

  it("strips markdown code fences before parsing", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    delete process.env.LETTA_API_KEY;

    mockLLMResponse(
      "```json\n" +
        JSON.stringify({
          metrics: {
            impressions: 500,
            clicks: 0,
            likes: 0,
            comments: 0,
            saves: 0,
            shares: 0,
            leads: 0,
            signups: 0,
            revenue: 0
          },
          found: ["impressions"],
          notes: ""
        }) +
        "\n```"
    );

    const result = await extractMetricsFromText("500 views", "x", "en");
    expect(result.metrics.impressions).toBe(500);
  });

  it("throws when the model reports no recognizable metrics", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://api.example.com/v1";
    delete process.env.LETTA_API_KEY;

    mockLLMResponse(
      JSON.stringify({
        metrics: {
          impressions: 0,
          clicks: 0,
          likes: 0,
          comments: 0,
          saves: 0,
          shares: 0,
          leads: 0,
          signups: 0,
          revenue: 0
        },
        found: [],
        notes: "No metrics found."
      })
    );

    await expect(extractMetricsFromText("hello world", "wechat", "en")).rejects.toThrow(
      "No recognizable metrics"
    );
  });
});
