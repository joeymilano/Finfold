import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPublicWebEvidence } from "@/lib/agent/web-search-evidence";
import type { LLMProvider } from "@/lib/llm-providers";

function provider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: "dashscope-test",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "test-secret",
    models: {
      haiku: "qwen3.8-flash",
      sonnet: "qwen3.8-flash",
      opus: "qwen3.8-flash"
    },
    jsonMode: "none",
    costClass: "paid",
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attributable public web search fallback", () => {
  it("uses DashScope native web search and returns bounded, validated sources", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "qwen3.8-flash",
        parameters: {
          enable_search: true,
          search_options: {
            forced_search: true,
            enable_source: true,
            enable_citation: true
          }
        }
      });
      return new Response(JSON.stringify({
        output: {
          choices: [{
            message: {
              content: "该页面的公开资料显示，这是一位产品设计从业者；公开资料还显示其内容长期围绕职业经验与设计方法，粉丝数接近两万。[ref_1]"
            }
          }],
          search_info: {
            search_results: [
              {
                title: "Target profile",
                url: "https://www.linkedin.com/in/example/",
                snippet: "Public profile and follower evidence"
              },
              {
                title: "duplicate",
                url: "https://www.linkedin.com/in/example/#about"
              },
              {
                title: "unsafe",
                url: "http://127.0.0.1/private"
              }
            ]
          }
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await searchPublicWebEvidence({
      targetUrls: ["https://www.linkedin.com/in/example/"],
      userRequest: "为什么这个账号有两万粉丝？"
    }, {
      providers: [provider()],
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-04T00:00:00.000Z")
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
    expect(result).toMatchObject({
      available: true,
      provider: "dashscope_web_search",
      capturedAt: "2026-09-04T00:00:00.000Z"
    });
    if (!result.available) throw new Error("expected available evidence");
    expect(result.sources).toEqual([{
      index: 1,
      title: "Target profile",
      url: "https://www.linkedin.com/in/example/",
      snippet: "Public profile and follower evidence"
    }]);
  });

  it("fails closed when no configured provider supports sourced web search", async () => {
    const fetchImpl = vi.fn();
    const result = await searchPublicWebEvidence({
      targetUrls: ["https://example.com/"],
      userRequest: "read this"
    }, {
      providers: [provider({
        apiBase: "https://open.bigmodel.cn/api/paas/v4",
        models: { haiku: "glm-4-flash", sonnet: "glm-4-flash", opus: "glm-4-flash" }
      })],
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(result).toMatchObject({ available: false, reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose uncited model text as evidence", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output: {
        choices: [{ message: { content: "This is a long enough answer that has no attributable public source at all." } }],
        search_info: { search_results: [] }
      }
    }), { status: 200 }));
    const result = await searchPublicWebEvidence({
      targetUrls: ["https://example.com/"],
      userRequest: "read this"
    }, { providers: [provider()], fetchImpl: fetchImpl as typeof fetch });

    expect(result).toMatchObject({ available: false, reason: "no_sources" });
  });

  it("supports OpenAI Responses web search with returned source attribution", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        store: false
      });
      return new Response(JSON.stringify({
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [{
                title: "Example primary source",
                url: "https://example.com/about"
              }]
            }
          },
          {
            type: "message",
            content: [{
              type: "output_text",
              text: "The primary source provides enough attributable detail to answer the user's question accurately.",
              annotations: []
            }]
          }
        ]
      }), { status: 200 });
    });

    const result = await searchPublicWebEvidence({
      targetUrls: ["https://example.com/"],
      userRequest: "What does this company do?"
    }, {
      providers: [provider({
        name: "openai-test",
        apiBase: "https://api.openai.com/v1",
        models: { haiku: "gpt-5-mini", sonnet: "gpt-5-mini", opus: "gpt-5-mini" }
      })],
      fetchImpl: fetchImpl as typeof fetch
    });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/responses");
    expect(result).toMatchObject({
      available: true,
      provider: "openai_web_search",
      sources: [{ url: "https://example.com/about" }]
    });
  });
});
