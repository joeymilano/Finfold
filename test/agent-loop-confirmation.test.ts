import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstExecute: vi.fn(async () => ({
    pendingAction: { id: "9cc86165-4795-4e78-ac2e-692f51fdbba7" }
  })),
  investigationExecute: vi.fn(async () => ({
    investigation: { reportId: "FF-XHS-1" }
  })),
  secondExecute: vi.fn(async () => ({ executed: true }))
}));

vi.mock("@/lib/agent/tools", () => ({
  buildOpenAiToolsPayload: () => [],
  getAgentTool: (name: string) => {
    if (name === "prepare_first") return {
        name,
        mutates: false,
        requiresAgentTools: false,
        execute: mocks.firstExecute
      };
    if (name === "investigate_social_account") return {
      name,
      mutates: false,
      requiresAgentTools: true,
      execute: mocks.investigationExecute
    };
    return {
        name,
        mutates: false,
        requiresAgentTools: false,
        execute: mocks.secondExecute
      };
  }
}));

import { runAgentLoop } from "@/lib/agent/loop";
import type { AgentToolContext } from "@/lib/agent/types";

const originalEnv = {
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  AGENT_PRIMARY_KEY: process.env.AGENT_PRIMARY_KEY,
  AGENT_FALLBACK_KEY: process.env.AGENT_FALLBACK_KEY,
  LLM_VISION: process.env.LLM_VISION
};

function setSingleProvider(withVision = true) {
  process.env.AGENT_PRIMARY_KEY = "primary-key";
  process.env.LLM_PROVIDERS = JSON.stringify([{
    name: "primary",
    base: "https://primary.example/v1",
    keyEnv: "AGENT_PRIMARY_KEY",
    models: {
      haiku: "text-model",
      sonnet: "strong-model",
      opus: "strongest-model",
      ...(withVision ? { vision: "vision-model" } : {})
    },
    enableThinking: false,
    jsonMode: "object"
  }]);
}

beforeEach(() => {
  setSingleProvider();
  delete process.env.LLM_VISION;
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.firstExecute.mockClear();
  mocks.investigationExecute.mockClear();
  mocks.secondExecute.mockClear();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Agent loop confirmation boundary", () => {
  it("does not call the model after the user has paused the request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const controller = new AbortController();
    controller.abort();
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      signal: controller.signal
    } as AgentToolContext;
    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) events.push(event);
    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider when the next Agent step cannot reserve Credits", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const reserve = vi.fn(async () => false);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const refundFailedTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: { reserve, confirmSuccessfulTurn, refundFailedTurn }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) events.push(event);

    expect(reserve).toHaveBeenCalledOnce();
    expect(refundFailedTurn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toEqual([{
      type: "error",
      code: "INSUFFICIENT_CREDITS",
      error: "AI Credits are unavailable for another Agent step."
    }]);
  });

  it("refunds exactly the failed model turn without exposing provider details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("provider unavailable", { status: 503 })
    );
    const reserve = vi.fn(async () => true);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const refundFailedTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: { reserve, confirmSuccessfulTurn, refundFailedTurn }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) events.push(event);

    expect(reserve).toHaveBeenCalledOnce();
    expect(refundFailedTurn).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual([{
      type: "error",
      code: "PROVIDER_UNAVAILABLE",
      error: "Finfold智能体服务暂时不可用。我已保留本轮资料和上下文；请直接重试，无需重新提供。"
    }]);
    expect(JSON.stringify(events)).not.toContain("provider unavailable");
  });

  it("retries a busy provider and fails over without charging another Agent turn", async () => {
    process.env.AGENT_PRIMARY_KEY = "primary-key";
    process.env.AGENT_FALLBACK_KEY = "fallback-key";
    process.env.LLM_PROVIDERS = JSON.stringify([
      {
        name: "deepseek",
        base: "https://api.deepseek.example/v1",
        keyEnv: "AGENT_PRIMARY_KEY",
        models: { haiku: "deepseek-v4-flash", sonnet: "deepseek-v4-pro", opus: "deepseek-v4-pro" }
      },
      {
        name: "qwen-fallback",
        base: "https://api.qwen.example/v1",
        keyEnv: "AGENT_FALLBACK_KEY",
        models: { haiku: "qwen-fallback", sonnet: "qwen-fallback", opus: "qwen-fallback" }
      }
    ]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("deepseek")) {
        return new Response('{"error":{"code":"1305","message":"busy"}}', { status: 429 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "已自动切换模型并继续。" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const reserve = vi.fn(async () => true);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const refundFailedTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: { reserve, confirmSuccessfulTurn, refundFailedTurn }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) events.push(event);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("deepseek");
    expect(String(fetchMock.mock.calls[2][0])).toContain("qwen");
    expect(reserve).toHaveBeenCalledOnce();
    expect(confirmSuccessfulTurn).toHaveBeenCalledOnce();
    expect(refundFailedTurn).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: "text", text: "已自动切换模型并继续。" });
  });

  it("turns a final 429 into a retryable product message instead of raw code 1305", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response('{"error":{"code":"1305","message":"该模型当前访问量过大"}}', { status: 429 })
    );
    const refundFailedTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: {
        reserve: vi.fn(async () => true),
        confirmSuccessfulTurn: vi.fn(async () => undefined),
        refundFailedTurn
      }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) events.push(event);

    expect(refundFailedTurn).toHaveBeenCalledOnce();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "PROVIDER_BUSY" })]);
    expect(JSON.stringify(events)).not.toContain("1305");
  });

  it("uses the stronger configured model for Digital Employee Agent turns", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "完成" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "digital_employee_v2",
      agentToolsEnabled: true
    } as AgentToolContext;

    for await (const event of runAgentLoop([{ role: "user", content: "制定策略" }], ctx)) {
      // Drain the loop.
      void event;
    }

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe("strongest-model");
    expect(body.enable_thinking).toBe(false);
  });

  it("routes a Chinese request with three screenshots to the configured vision model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "已读取截图并准备文案。" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const reserve = vi.fn(async () => true);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const refundFailedTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: { reserve, confirmSuccessfulTurn, refundFailedTurn }
    } as AgentToolContext;
    const content = [
      { type: "text" as const, text: "请调用 Workbench 帮我写成爆款小红书文案" },
      ...["one", "two", "three"].map((name) => ({
        type: "image_url" as const,
        image_url: { url: `https://signed.example/${name}.png` }
      }))
    ];

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content }], ctx)) events.push(event);

    const request = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as {
      model: string;
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(request.model).toBe("vision-model");
    expect((request as typeof request & { enable_thinking: boolean }).enable_thinking).toBe(false);
    expect(request.messages[0].content.filter((part) => part.type === "image_url")).toHaveLength(3);
    expect(events).toContainEqual({ type: "text", text: "已读取截图并准备文案。" });
    expect(confirmSuccessfulTurn).toHaveBeenCalledOnce();
    expect(refundFailedTurn).not.toHaveBeenCalled();
  });

  it("moves screenshot analysis to the Qwen snapshot after the latest model is busy", async () => {
    process.env.AGENT_PRIMARY_KEY = "qwen-key";
    process.env.LLM_PROVIDERS = JSON.stringify([
      {
        name: "qwen-latest",
        base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        keyEnv: "AGENT_PRIMARY_KEY",
        models: { haiku: "qwen3.8-flash", vision: "qwen3.8-flash" },
        supportsVideo: true,
        enableThinking: false
      },
      {
        name: "qwen-snapshot",
        base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        keyEnv: "AGENT_PRIMARY_KEY",
        models: { haiku: "qwen3.7-flash-2026-07-15", vision: "qwen3.7-flash-2026-07-15" },
        supportsVideo: true,
        enableThinking: false
      }
    ]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.model === "qwen3.8-flash") {
        return new Response('{"error":{"code":"1305","message":"busy"}}', { status: 429 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "备用视觉模型已读完截图。" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const reserve = vi.fn(async () => true);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: {
        reserve,
        confirmSuccessfulTurn,
        refundFailedTurn: vi.fn(async () => undefined)
      }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{
      role: "user",
      content: [
        { type: "text", text: "诊断这张小红书截图" },
        { type: "image_url", image_url: { url: "https://signed.example/analytics.png" } }
      ]
    }], ctx)) events.push(event);

    const models = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)).model as string
    );
    expect(models).toEqual(["qwen3.8-flash", "qwen3.8-flash", "qwen3.7-flash-2026-07-15"]);
    expect(reserve).toHaveBeenCalledOnce();
    expect(confirmSuccessfulTurn).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "text", text: "备用视觉模型已读完截图。" });
  });

  it("uses vision once, then returns to the text model for post-tool reasoning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: "",
            tool_calls: [{
              id: "call-read",
              type: "function",
              function: { name: "read_then_continue", arguments: "{}" }
            }]
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "我沿用刚才读到的数据完成了诊断。" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{
      role: "user",
      content: [
        { type: "text", text: "截图数据已经给你了，直接诊断" },
        { type: "image_url", image_url: { url: "https://signed.example/analytics.png" } }
      ]
    }], ctx)) events.push(event);

    const requests = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{ content: string | Array<{ type: string }> }>;
      }
    );
    expect(requests.map((request) => request.model)).toEqual(["vision-model", "text-model"]);
    expect(requests[1].messages[0].content).toContain("image evidence was inspected");
    expect(requests[1].messages[0].content).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url" })
    ]));
    expect(mocks.secondExecute).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "text", text: "我沿用刚才读到的数据完成了诊断。" });
  });

  it("fails before charging when screenshots arrive without a vision model", async () => {
    setSingleProvider(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const reserve = vi.fn(async () => true);
    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: {
        reserve,
        confirmSuccessfulTurn: vi.fn(async () => undefined),
        refundFailedTurn: vi.fn(async () => undefined)
      }
    } as AgentToolContext;

    const events = [];
    for await (const event of runAgentLoop([{
      role: "user",
      content: [
        { type: "text", text: "分析图片" },
        { type: "image_url", image_url: { url: "https://signed.example/one.png" } }
      ]
    }], ctx)) events.push(event);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "VISION_UNAVAILABLE" })]);
  });

  it("stops after the first pending action even when the model requested multiple tools", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: "",
          tool_calls: [
            { id: "call-1", type: "function", function: { name: "prepare_first", arguments: "{}" } },
            { id: "call-2", type: "function", function: { name: "prepare_second", arguments: "{}" } }
          ]
        }
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const reserve = vi.fn(async () => true);
    const confirmSuccessfulTurn = vi.fn(async () => undefined);
    const refundFailedTurn = vi.fn(async () => undefined);

    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true,
      modelTurnBilling: { reserve, confirmSuccessfulTurn, refundFailedTurn }
    } as AgentToolContext;
    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "继续" }], ctx)) {
      events.push(event);
    }

    expect(mocks.firstExecute).toHaveBeenCalledOnce();
    expect(mocks.secondExecute).not.toHaveBeenCalled();
  expect(reserve).toHaveBeenCalledOnce();
  expect(confirmSuccessfulTurn).toHaveBeenCalledOnce();
    expect(refundFailedTurn).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "awaiting_confirmation" });
  });

  it("executes a successful account investigation only once per Agent run", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          message: {
            content: "",
            tool_calls: [
              { id: "call-1", type: "function", function: { name: "investigate_social_account", arguments: '{"accountUrl":"https://x.com/example"}' } },
              { id: "call-2", type: "function", function: { name: "investigate_social_account", arguments: '{"accountUrl":"https://x.com/example"}' } }
            ]
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "诊断完成。" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const ctx = {
      userId: crypto.randomUUID(),
      admin: {} as AgentToolContext["admin"],
      plan: "starter",
      agentToolsEnabled: true
    } as AgentToolContext;
    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "诊断账号" }], ctx)) {
      events.push(event);
    }

    expect(mocks.investigationExecute).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "tool_call")).toHaveLength(1);
    expect(events.filter((event) => event.type === "tool_result")).toHaveLength(1);
    expect(events).toContainEqual({ type: "text", text: "诊断完成。" });
  });
});
