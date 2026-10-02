import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(async () => ({
    steps: [
      { title: "读取资料", outcome: "确认事实" },
      { title: "生成方案", outcome: "完成草稿" },
      { title: "发布前检查", outcome: "等待确认" }
    ],
    total: 3
  })),
  prepare: vi.fn(async () => ({ draft: { title: "真实增长方案" } }))
}));

vi.mock("@/lib/agent/tools", () => ({
  buildOpenAiToolsPayload: () => [],
  getAgentTool: (name: string) => {
    if (name === "create_execution_plan") {
      return { name, mutates: false, requiresAgentTools: false, execute: mocks.plan };
    }
    if (name === "prepare_growth_draft") {
      return { name, mutates: false, requiresAgentTools: false, execute: mocks.prepare };
    }
    return undefined;
  }
}));

import { runAgentLoop } from "@/lib/agent/loop";
import type { AgentToolContext } from "@/lib/agent/types";

const originalEnv = {
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  AGENT_PRIMARY_KEY: process.env.AGENT_PRIMARY_KEY
};

function completionResponse(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) }
  };
}

function buildCtx() {
  return {
    userId: crypto.randomUUID(),
    admin: {} as AgentToolContext["admin"],
    plan: "starter",
    agentToolsEnabled: true,
    modelTurnBilling: {
      reserve: vi.fn(async () => true),
      confirmSuccessfulTurn: vi.fn(async () => undefined),
      refundFailedTurn: vi.fn(async () => undefined)
    }
  } as AgentToolContext;
}

beforeEach(() => {
  process.env.AGENT_PRIMARY_KEY = "primary-key";
  process.env.LLM_PROVIDERS = JSON.stringify([{
    name: "primary",
    base: "https://primary.example/v1",
    keyEnv: "AGENT_PRIMARY_KEY",
    models: { haiku: "text-model", sonnet: "strong-model", opus: "strongest-model" },
    enableThinking: false,
    jsonMode: "object"
  }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.plan.mockClear();
  mocks.prepare.mockClear();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Agent autonomous continuation", () => {
  it("continues past a plan without asking the user to type continue", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) {
        return completionResponse({
          content: "我先把任务拆清楚。",
          tool_calls: [toolCall("plan", "create_execution_plan", { steps: [
            { title: "读取资料", outcome: "确认事实" },
            { title: "生成方案", outcome: "完成草稿" },
            { title: "发布前检查", outcome: "等待确认" }
          ] })]
        });
      }
      if (callIndex === 2) return completionResponse({ content: "计划已准备好。回复继续后我开始执行。" });
      if (callIndex === 3) {
        const body = JSON.parse(String(init?.body)) as { messages?: Array<{ role?: string; content?: string }> };
        expect(body.messages?.some((message) => message.role === "user" && message.content?.includes("Never ask the user"))).toBe(true);
        return completionResponse({
          content: "我正在准备可编辑方案。",
          tool_calls: [toolCall("draft", "prepare_growth_draft", {})]
        });
      }
      return completionResponse({ content: [{ type: "text", text: "完整方案已准备好。" }] });
    });

    const events: Array<Record<string, unknown> & { type: string }> = [];
    for await (const event of runAgentLoop([{ role: "user", content: "分析这些资料并生成增长方案" }], buildCtx())) {
      events.push(event as Record<string, unknown> & { type: string });
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(mocks.plan).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "text").map((event) => event.text)).toEqual([
      "我先把任务拆清楚。",
      "我正在准备可编辑方案。",
      "完整方案已准备好。"
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "completed" });
  });

  it("stops after the requested plan when the user explicitly asks for planning only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) {
        return completionResponse({
          content: "我先整理计划。",
          tool_calls: [toolCall("plan", "create_execution_plan", { steps: [
            { title: "读取资料", outcome: "确认事实" },
            { title: "生成方案", outcome: "完成草稿" },
            { title: "发布前检查", outcome: "等待确认" }
          ] })]
        });
      }
      return completionResponse({ content: "计划已经整理好，本轮不执行。" });
    });

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "只给我计划，先不要执行" }], buildCtx())) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "completed" });
  });

  it("treats a normal request to formulate a roadmap as the requested deliverable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) {
        return completionResponse({
          content: "我先整理路线。",
          tool_calls: [toolCall("plan", "create_execution_plan", { steps: [
            { title: "读取资料", outcome: "确认事实" },
            { title: "生成方案", outcome: "完成草稿" },
            { title: "发布前检查", outcome: "等待确认" }
          ] })]
        });
      }
      return completionResponse({ content: "八周升级路线已经整理好。" });
    });

    const events = [];
    for await (const event of runAgentLoop([{ role: "user", content: "请制定一份八周增长升级计划" }], buildCtx())) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "completed" });
  });
});
