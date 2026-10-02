import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/components/app-shell/McpAccessPanel", () => ({ McpAccessPanel: () => null }));
vi.mock("@/components/app-shell/WatchSourcesPanel", () => ({ WatchSourcesPanel: () => null }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, next: string) => `${current}${next}`,
  SpeechInputButton: () => null
}));
vi.mock("@/components/app-shell/WeeklyPlanCard", () => ({ WeeklyPlanCard: () => null }));
vi.mock("@/components/app-shell/CampaignPlanCard", () => ({ CampaignPlanCard: () => null }));
vi.mock("@/components/ui/Panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/components/ui/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/components/workbench/PlatformBrandIcon", () => ({ PlatformGlyph: () => null }));

const mocks = vi.hoisted(() => ({
  consume: vi.fn()
}));

vi.mock("@/lib/sse-client", () => ({ consumeSSEStream: mocks.consume }));

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body)
  } as Response);
}

beforeEach(() => {
  mocks.consume.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("AgentAutomationCenter task queue", () => {
  it("queues a message sent while a task runs and starts it right after", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn((_input: unknown, _init?: { method?: string; body?: string; cache?: string }) =>
      jsonResponse({ sessions: [] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");

    const user = userEvent.setup();
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    await user.type(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));

    // While the first task streams, Enter submits as a steer action that
    // joins the queue instead of racing a second concurrent run.
    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "第二个任务{Enter}");
    expect(chatCalls()).toHaveLength(1);
    expect(screen.getByRole("list", { name: "排队任务" })).toBeInTheDocument();
    expect(screen.getByText("1 条任务排队，当前任务结束后依次执行")).toBeInTheDocument();
    expect(screen.getByText("第二个任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();

    // The first task finishing immediately starts the queued message.
    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(chatCalls()).toHaveLength(2));
    const secondBody = JSON.parse((chatCalls()[1]?.[1]?.body as string) ?? "{}") as { message?: string };
    expect(secondBody.message).toBe("第二个任务");
    expect(screen.queryByRole("list", { name: "排队任务" })).not.toBeInTheDocument();

    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    expect(chatCalls()).toHaveLength(2);
  });

  it("discards a queued task without ever sending it", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn((_input: unknown, _init?: { method?: string; body?: string; cache?: string }) =>
      jsonResponse({ sessions: [] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");

    const user = userEvent.setup();
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    await user.type(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));

    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "排队的任务{Enter}");
    await user.click(screen.getByRole("button", { name: /^放弃这条排队任务/ }));
    expect(screen.queryByRole("list", { name: "排队任务" })).not.toBeInTheDocument();

    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(chatCalls()).toHaveLength(1);
  });

  it("keeps the queue moving after the running task is paused", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn((_input: unknown, _init?: { method?: string; body?: string; cache?: string }) =>
      jsonResponse({ sessions: [] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");

    const user = userEvent.setup();
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    await user.type(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));

    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "下一个任务{Enter}");
    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(screen.getByText("已暂停。你可以随时从这里继续。")).toBeInTheDocument();

    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(chatCalls()).toHaveLength(2));
    const secondBody = JSON.parse((chatCalls()[1]?.[1]?.body as string) ?? "{}") as { message?: string };
    expect(secondBody.message).toBe("下一个任务");
  });

  it("shows the usage hint on finished center runs", async () => {
    mocks.consume.mockImplementation(async (_response: unknown, onEvent: (event: string, data: unknown) => void) => {
      onEvent("session", { sessionId: "center-usage" });
      onEvent("text", { text: "已完成。" });
      onEvent("usage", { action: "agentStep", credits: 1, available: 45, turn: 1 });
      onEvent("usage", { action: "agentStep", credits: 1, available: 44, turn: 2 });
      onEvent("done", { outcome: "completed" });
    });
    const fetchMock = vi.fn((_input: unknown, _init?: { method?: string; body?: string; cache?: string }) =>
      jsonResponse({ sessions: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    await user.type(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), "分析账号");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(screen.getByText("已完成。")).toBeInTheDocument());

    const hint = screen.getByRole("button", { name: /^2 创作点数 · \d{2}:\d{2}$/ });
    await user.click(hint);
    expect(screen.getByText("本次对话")).toBeVisible();
    expect(screen.getByText("2 创作点数 · 2 步")).toBeInTheDocument();
  });
});
