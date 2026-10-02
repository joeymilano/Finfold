import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  askUserExecute: vi.fn(async () => ({
    askedUser: true,
    questions: [{ id: "topic", question: "先做哪一个？", options: [{ label: "逆袭故事" }, { label: "避坑指南" }] }]
  }))
}));

vi.mock("@/lib/agent/tools", () => ({
  buildOpenAiToolsPayload: () => [],
  getAgentTool: (name: string) => name === "ask_user"
    ? { name, mutates: false, requiresAgentTools: false, execute: mocks.askUserExecute }
    : undefined
}));

import { runAgentLoop } from "@/lib/agent/loop";
import type { AgentToolContext } from "@/lib/agent/types";

const originalEnv = {
  LLM_PROVIDERS: process.env.LLM_PROVIDERS,
  AGENT_PRIMARY_KEY: process.env.AGENT_PRIMARY_KEY,
  LLM_VISION: process.env.LLM_VISION
};

const numberedChoiceReply = "分析了三个方向。\n请告诉我你想做哪一个？\n1. 逆袭故事\n2. 避坑指南\n3. 招生官内幕\n选定后我会生成标题候选。";

const askUserToolCall = {
  id: "call-ask-1",
  type: "function",
  function: {
    name: "ask_user",
    arguments: JSON.stringify({
      questions: [{
        id: "topic",
        question: "先做哪一个？",
        options: [{ label: "逆袭故事" }, { label: "避坑指南" }, { label: "招生官内幕" }],
        recommended: "避坑指南"
      }]
    })
  }
};

function completionResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message: body }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
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
  delete process.env.LLM_VISION;
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.askUserExecute.mockClear();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

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

async function collectEvents(ctx: AgentToolContext) {
  const events: Array<Record<string, unknown> & { type: string }> = [];
  for await (const event of runAgentLoop([{ role: "user", content: "帮我在小红书上找最容易火的话题" }], ctx)) {
    events.push(event as Record<string, unknown> & { type: string });
  }
  return events;
}

describe("Agent loop ask_user corrective nudge", () => {
  it("converts a numbered-choice reply into an ask_user tool call and ends the run at the card", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) return completionResponse({ content: numberedChoiceReply });
      if (callIndex === 2) return completionResponse({ content: "把三个方向整理成了选择题：", tool_calls: [askUserToolCall] });
      return completionResponse({ content: "等你点选后我会直接继续。" });
    });
    const ctx = buildCtx();

    const events = await collectEvents(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.askUserExecute).toHaveBeenCalledOnce();
    expect(events).toContainEqual({ type: "tool_call", name: "ask_user", args: JSON.parse(askUserToolCall.function.arguments) });
    expect(events.filter((event) => event.type === "text").map((event) => event.text as string)).toEqual([
      numberedChoiceReply,
      "把三个方向整理成了选择题："
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "awaiting_input" });
  });

  it("does not nudge when the reply has numbered steps but no choice question", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      completionResponse({ content: "已保存。接下来的步骤：\n1. 调研选题\n2. 生成图文\n3. 发布前检查" })
    );
    const ctx = buildCtx();

    const events = await collectEvents(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.askUserExecute).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "tool_call")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "completed" });
  });

  it("never nudges twice in one run even if the model keeps writing lists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) return completionResponse({ content: "先确认一下。", tool_calls: [askUserToolCall] });
      return completionResponse({ content: `收到。${numberedChoiceReply}` });
    });
    const ctx = buildCtx();

    const events = await collectEvents(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.askUserExecute).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "awaiting_input" });
  });

  it("stops the run after ask_user succeeds so the model cannot re-ask the same question", async () => {
    const duplicateAskCall = { ...askUserToolCall, id: "call-ask-2" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length;
      if (callIndex === 1) {
        return completionResponse({ content: "确认一下方向：", tool_calls: [askUserToolCall, duplicateAskCall] });
      }
      return completionResponse({ content: "不应该再被调用。", tool_calls: [askUserToolCall] });
    });
    const ctx = buildCtx();

    const events = await collectEvents(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.askUserExecute).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "tool_result" && event.name === "ask_user")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "done", outcome: "awaiting_input" });
  });
});
