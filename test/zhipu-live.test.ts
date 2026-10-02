// @vitest-environment node
// Opt-in acceptance using synthetic content only; consumes the authorized plan.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/tools", () => ({
  buildOpenAiToolsPayload: () => [{ type: "function", function: {
    name: "get_test_metrics", description: "Read synthetic integration-test metrics", parameters: { type: "object", properties: {}, additionalProperties: false }
  } }],
  getAgentTool: (name: string) => name === "get_test_metrics" ? {
    name, mutates: false, requiresAgentTools: false,
    execute: async () => ({ source: "synthetic integration fixture", impressions: 1000, clicks: 20 })
  } : undefined
}));

import { runAgentLoop } from "@/lib/agent/loop";
import { runSubagentsParallel, type DelegateParallelTask } from "@/lib/agent/subagents";
import { generateKitOutputs } from "@/lib/llm";
import type { AgentToolContext } from "@/lib/agent/types";

const live = process.env.FINFOLD_ZHIPU_LIVE === "true";
describe.skipIf(!live)("Zhipu real Finfold integration", () => {
  const actualFetch = globalThis.fetch;
  beforeEach(() => {
    expect(process.env.ZHIPU_API_KEY).toBeTruthy();
    vi.stubEnv("ZHIPU_ENABLED", "true");
    vi.stubEnv("ZHIPU_API_MODE", "coding-plan");
    vi.stubEnv("ZHIPU_API_BASE", "https://open.bigmodel.cn/api/coding/paas/v4");
    vi.stubEnv("ZHIPU_PRIORITY_EXPIRES_AT", "2026-10-07T00:00:00+08:00");
    vi.stubEnv("LLM_PROVIDERS", "[]");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LETTA_API_KEY", "");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions") throw new Error("Live acceptance must never reach another billing endpoint");
      const started = Date.now();
      const response = await actualFetch(input, init);
      const data = await response.clone().json();
      // Never log headers, prompts, responses or API keys.
      console.info("[zhipu-live]", JSON.stringify({ status: response.status, model: data.model, latencyMs: Date.now() - started, usage: data.usage, errorCode: data.error?.code }));
      return response;
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function context() {
    const confirmed: string[] = [], refunded: string[] = [];
    const ctx: AgentToolContext = {
      userId: "synthetic-integration-test", plan: "growth", agentToolsEnabled: true, admin: {} as never,
      modelTurnBilling: {
        reserve: async () => true,
        confirmSuccessfulTurn: async () => { confirmed.push("root"); },
        refundFailedTurn: async () => { refunded.push("root"); },
        open: async stepKey => ({ sequence: confirmed.length + 1, stepKey,
          confirm: async () => { confirmed.push(stepKey); }, refund: async () => { refunded.push(stepKey); }
        })
      }
    };
    return { ctx, confirmed, refunded };
  }

  it.each(["starter", "growth"] as const)("completes the real %s root loop and tool continuation", async plan => {
    const { ctx, confirmed, refunded } = context(); ctx.plan = plan;
    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "Synthetic test. Call get_test_metrics once. Then state the clicks and impressions returned by the tool. No other actions." }], ctx)) events.push(event);
    expect(events.filter(e => e.type === "error")).toEqual([]);
    expect(events.some(e => e.type === "tool_call" && e.name === "get_test_metrics")).toBe(true);
    expect(events.some(e => e.type === "done")).toBe(true);
    const text = JSON.stringify(events);
    expect(text).toContain("20"); expect(text).toContain("1000");
    expect(confirmed.length).toBeGreaterThanOrEqual(2);
    expect(refunded).toEqual([]);
  }, 180_000);

  it("validates all four specialist roles and settles each once", async () => {
    const { ctx, confirmed, refunded } = context();
    const tasks = (["evidence_analyst", "brand_strategist", "channel_specialist", "risk_reviewer"] as const).map(kind => ({ kind, label: "资料核对", instruction: "只基于提供的合成资料，输出简短只读分析，不添加没有证据的业绩数据。", deliverable: "结论、证据与风险" } satisfies DelegateParallelTask));
    for (const group of [tasks.slice(0, 2), tasks.slice(2)]) {
      const result = await runSubagentsParallel({ ctx, goal: "评估合成测试品牌的内容方向", contextDigest: "合成测试资料：品牌销售可重复使用水杯，受众为通勤者，没有销量和转化数据。", language: "zh-CN", tasks: group });
      expect(result.status).toBe("completed"); expect(result.completedCount).toBe(2);
      expect(result.results.every(r => r.status === "success" && r.summary)).toBe(true);
    }
    expect(confirmed).toHaveLength(4); expect(refunded).toEqual([]);
  }, 180_000);

  it("generates a two-platform content kit through the production schema", async () => {
    const outputs = await generateKitOutputs({ ideaText: "Synthetic test: a reusable commuter cup with a screw lid. No proof of sales, sustainability impact or performance is provided. Introduce the cup honestly, without inventing numbers or endorsements.", goal: "product-launch", persona: "ai-saas", platforms: ["linkedin", "x"], mediaAssets: [], language: "en" }, { allowPersistentAgentFallback: false });
    expect(outputs.map(o => o.platform).sort()).toEqual(["linkedin", "x"]);
    expect(outputs.every(o => o.title && o.body && o.cta)).toBe(true);
  }, 180_000);

  // Verifies the plan endpoint really accepts image_url content parts for the
  // configured vision model before the extension's screenshot locate relies
  // on it. A 1x1 solid-colour PNG; asserts readable text came back from
  // glm-5.3-flash itself (the fetch guard forbids any other endpoint).
  it("reads a synthetic image through the plan's vision model", async () => {
    vi.stubEnv("ZHIPU_VISION_MODEL", "glm-5.3-flash");
    const { sendRawPromptWithImages } = await import("@/lib/llm");
    const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const answer = await sendRawPromptWithImages(
      "The attached image is a single solid colour pixel. Reply with JSON only: {\"color\":\"<english colour name>\"}",
      [onePixelPng]
    );
    expect(answer.trim()).toMatch(/"color"\s*:/);
  }, 60_000);
});
