// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getZhipuProvider } from "@/lib/zhipu";
import { chatRequestOptions, LLMRequestError, resolveLLMProviders, withProviderFailover } from "@/lib/llm-providers";
import { resolveImageProviders } from "@/lib/image-providers";
import { runSubagentsParallel } from "@/lib/agent/subagents";
import type { AgentToolContext } from "@/lib/agent/types";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-07T19:00:00+08:00"));
  vi.stubEnv("ZHIPU_ENABLED", "true");
  vi.stubEnv("ZHIPU_PRIORITY_EXPIRES_AT", "2026-10-07T00:00:00+08:00");
  vi.stubEnv("ZHIPU_API_KEY", "synthetic-zhipu-key");
  vi.stubEnv("ZHIPU_API_MODE", "coding-plan");
  vi.stubEnv("ZHIPU_API_BASE", "https://open.bigmodel.cn/api/coding/paas/v4");
  for (const key of ["ZHIPU_MODEL", "ZHIPU_MODEL_STRONG", "ZHIPU_VISION_MODEL", "ZHIPU_VIDEO"]) vi.stubEnv(key, "");
  vi.stubEnv("LLM_PROVIDERS", JSON.stringify([{ name: "backup", base: "https://backup.example/v1", keyEnv: "TEST_BACKUP_KEY", models: { haiku: "backup-model", vision: "backup-vision" }, supportsVideo: true }]));
  vi.stubEnv("TEST_BACKUP_KEY", "synthetic-backup-key");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Zhipu opt-in routing", () => {
  it("automatically restores the original chain at the priority deadline", () => {
    const deadline = Date.parse("2026-10-07T00:00:00+08:00");
    vi.setSystemTime(deadline - 1);
    expect(resolveLLMProviders().map(p => p.name)).toEqual(["zhipu", "backup"]);
    for (const now of [deadline, deadline + 1, deadline + 86_400_000]) {
      vi.setSystemTime(now);
      for (const purpose of ["general", "agent", "evidence_analyst", "brand_strategist", "channel_specialist", "risk_reviewer"] as const) {
        expect(resolveLLMProviders(purpose).map(p => p.name)).toEqual(["backup"]);
      }
    }
  });

  it.each(["", "not-a-date", "2026-09-06T00:00:00+08:00"])("does not grant indefinite priority with deadline %s", deadline => {
    vi.stubEnv("ZHIPU_PRIORITY_EXPIRES_AT", deadline);
    expect(resolveLLMProviders().map(p => p.name)).toEqual(["backup"]);
  });

  it("requires both a deliberate enable and a separate new credential", () => {
    vi.stubEnv("ZHIPU_ENABLED", "false");
    expect(resolveLLMProviders().map(p => p.name)).toEqual(["backup"]);
    vi.stubEnv("ZHIPU_ENABLED", "true");
    vi.stubEnv("ZHIPU_API_KEY", " ");
    vi.stubEnv("LLM_API_KEY", "old-credential");
    expect(resolveLLMProviders().map(p => p.name)).toEqual(["backup"]);
  });

  it.each([
    "http://open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn.evil.test/api/paas/v4",
    "https://user:password@open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn:8443/api/paas/v4",
    "https://open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn/api/v1", "https://open.bigmodel.cn/api/coding/paas/v4?key=x",
    "https://open.bigmodel.cn/api/paas/v4#x", "invalid"
  ])("does not send the credential to unsupported destination %s", base => {
    vi.stubEnv("ZHIPU_API_BASE", base);
    expect(getZhipuProvider("general")).toBeNull();
    expect(resolveLLMProviders()[0].name).toBe("backup");
  });

  it("reserves the stronger candidate for strategy and higher-tier orchestration", () => {
    for (const purpose of ["general", "evidence_analyst", "channel_specialist", "risk_reviewer"] as const) {
      expect(resolveLLMProviders(purpose)[0].models).toEqual({ haiku: "glm-5.3-flash", sonnet: "glm-5.3-flash", opus: "glm-5.3-flash" });
    }
    expect(resolveLLMProviders("brand_strategist")[0].models.haiku).toBe("glm-5.3");
    expect(resolveLLMProviders("agent")[0].models).toEqual({ haiku: "glm-5.3-flash", sonnet: "glm-5.3", opus: "glm-5.3" });
    vi.stubEnv("ZHIPU_MODEL", "custom-standard");
    vi.stubEnv("ZHIPU_MODEL_STRONG", "custom-strong");
    expect(resolveLLMProviders("agent")[0].models.sonnet).toBe("custom-strong");
    expect(resolveLLMProviders()[0].models.haiku).toBe("custom-standard");
  });

  it("uses GLM thinking controls with bounded output, without Qwen-only fields", () => {
    const provider = { ...getZhipuProvider("agent")!, enableThinking: false };
    expect(chatRequestOptions(provider, 0.5)).toEqual({ temperature: 0.5, thinking: { type: "disabled" }, max_tokens: 4096 });
    expect(chatRequestOptions(provider, 0.7, 8000).max_tokens).toBe(8000);
    expect(chatRequestOptions({ ...provider, zhipu: false }, 0.5)).toEqual({ temperature: 0.5, enable_thinking: false });
  });

  it("enables vision only through the explicit model var and keeps video separately gated", () => {
    expect(resolveLLMProviders().filter(p => p.visionModel).map(p => p.name)).toEqual(["backup"]);
    vi.stubEnv("ZHIPU_VISION_MODEL", "glm-5.3-flash");
    const zhipu = resolveLLMProviders()[0];
    expect(zhipu.visionModel).toBe("glm-5.3-flash");
    expect(zhipu.supportsVideo).toBe(false);
    expect(resolveLLMProviders().filter(p => p.visionModel).map(p => p.name)).toEqual(["zhipu", "backup"]);
    vi.stubEnv("ZHIPU_API_MODE", "standard");
    vi.stubEnv("ZHIPU_API_BASE", "https://open.bigmodel.cn/api/paas/v4");
    expect(resolveLLMProviders()[0].supportsVideo).toBe(false);
    vi.stubEnv("ZHIPU_VIDEO", "true");
    expect(resolveLLMProviders()[0].supportsVideo).toBe(true);
  });

  it.each([401, 402, 429, 503])("immediately switches vendor after status %s", async status => {
    const call = vi.fn().mockRejectedValueOnce(new LLMRequestError(status, "synthetic failure")).mockResolvedValueOnce("recovered");
    expect(await withProviderFailover(resolveLLMProviders(), call)).toBe("recovered");
    expect(call.mock.calls.map(([p]) => p.name)).toEqual(["zhipu", "backup"]);
  });

  it("preserves cancellation without spending a fallback call", async () => {
    const call = vi.fn().mockRejectedValue(new LLMRequestError(499, "cancelled"));
    await expect(withProviderFailover(resolveLLMProviders(), call)).rejects.toThrow("cancelled");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed GLM specialist results and falls back inside the same reservation", async () => {
    const confirmed = vi.fn(async () => {});
    const refunded = vi.fn(async () => {});
    const open = vi.fn(async (stepKey: string) => ({ sequence: 1, stepKey, confirm: confirmed, refund: refunded }));
    const ctx: AgentToolContext = { userId: "synthetic", plan: "growth", agentToolsEnabled: true, admin: {} as never,
      modelTurnBilling: { reserve: async () => true, confirmSuccessfulTurn: confirmed, refundFailedTurn: refunded, open } };
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(url.includes("bigmodel.cn")
        ? { summary: "invalid", evidence: [{ claim: "made up", confidence: "certain" }] }
        : { summary: "测试资料没有销量证据", findings: [], evidence: [], risks: [] }) } }] }));
    }));
    const result = await runSubagentsParallel({ ctx, goal: "检查合成测试材料", contextDigest: "合成测试品牌销售水杯，无销量数据。",
      tasks: (["brand_strategist", "risk_reviewer"] as const).map(kind => ({ kind, label: "资料检查", instruction: "只基于提供的测试资料分析", deliverable: "证据与风险" })) });
    expect(result.status).toBe("completed");
    expect(requests).toHaveLength(4);
    expect(requests.filter(r => r.url.includes("bigmodel.cn")).every(r => JSON.stringify(r.body.response_format) === '{"type":"json_object"}')).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
    expect(confirmed).toHaveBeenCalledTimes(2);
    expect(refunded).not.toHaveBeenCalled();
  });
});
