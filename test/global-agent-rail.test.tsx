import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalAgentRail } from "@/components/app-shell/GlobalAgentRail";
import { OPEN_GLOBAL_AGENT_EVENT, resolveAgentPageContext } from "@/lib/agent/presentation";

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/workbench"),
  consume: vi.fn(),
  capture: vi.fn()
}));

vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/lib/sse-client", () => ({ consumeSSEStream: mocks.consume }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, transcript: string) => `${current}${transcript}`,
  SpeechInputButton: () => <button type="button" aria-label="语音输入" />
}));

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
  mocks.pathname.mockReturnValue("/workbench");
  mocks.consume.mockReset();
  mocks.capture.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
});

describe("GlobalAgentRail", () => {
  it("opens from anywhere with one launcher or the keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<GlobalAgentRail />);

    expect(screen.getByRole("button", { name: /问 Finfold智能体/ })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: /问 Finfold智能体/ }));

    expect(screen.getByRole("dialog", { name: "Finfold智能体" })).toBeInTheDocument();
    expect(screen.getByText("正在看: 创作台")).toBeInTheDocument();

    const close = screen.getByRole("button", { name: "关闭智能体" });
    expect(close).toHaveClass("h-8", "w-8", "bg-surface-2/80");
    expect(close.querySelector('[data-fin-icon="X"]')).toHaveClass("h-3.5", "w-3.5");

    const send = screen.getByRole("button", { name: "发送" });
    expect(send).toHaveClass("h-9", "w-9", "bg-action");
    expect(send.querySelector('[data-fin-icon="ArrowUp"]')).toHaveClass("h-4", "w-4");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Finfold智能体" })).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Finfold智能体" })).toBeInTheDocument();
  });

  it("opens when a workbench Agent card requests it", () => {
    render(<GlobalAgentRail />);

    act(() => window.dispatchEvent(new Event(OPEN_GLOBAL_AGENT_EVENT)));

    expect(screen.getByRole("dialog", { name: "Finfold智能体" })).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith("global_agent_opened", {
      surface: "workbench",
      method: "workbench_card"
    });
  });

  it("gets out of the way on the dedicated account-health page", () => {
    mocks.pathname.mockReturnValue("/operations/account-health");
    render(<GlobalAgentRail />);

    expect(screen.queryByRole("button", { name: /问 Finfold智能体/ })).not.toBeInTheDocument();
    act(() => window.dispatchEvent(new Event(OPEN_GLOBAL_AGENT_EVENT)));
    expect(screen.getByRole("dialog", { name: "Finfold智能体" })).toBeInTheDocument();
  });

  it("sends trusted page context and presents automatic tools as business steps", async () => {
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("session", { sessionId: "9ac4df8b-4aab-489f-998d-6fb3156fa20d" });
      onEvent("status", { stage: "preparing_context" });
      onEvent("status", { stage: "choosing_capabilities" });
      onEvent("tool_call", { name: "get_brand_brain", args: {} });
      onEvent("tool_result", { name: "get_brand_brain", result: { ok: true } });
      onEvent("status", { stage: "composing_response" });
      onEvent("text", { text: "我已经读取品牌语气。" });
    });
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "帮我写一篇新品文案");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("我已经读取品牌语气。")).toBeInTheDocument());
    expect(screen.getByText(/步骤 1 \/ 1 · 读取品牌记忆/)).toBeInTheDocument();
    expect(screen.queryByText(/查看 Finfold智能体工作过程/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/agent/chat", expect.objectContaining({ method: "POST" }));
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      message: "帮我写一篇新品文案",
      pageContext: { pathname: "/workbench" }
    });
  });

  it("shows a pending confirmation without misreporting an Agent failure", async () => {
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("tool_call", { name: "learn_style", args: { personName: "张雪峰" } });
      onEvent("tool_result", {
        name: "learn_style",
        result: {
          confirmationRequired: true,
          pendingAction: {
            id: "cc0ac81f-6c58-4cf6-a614-7d54a1130776",
            toolName: "learn_style",
            args: { personName: "张雪峰" }
          }
        }
      });
      onEvent("done", { outcome: "awaiting_confirmation" });
    });
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "请你帮我学习张雪峰的爆款风格");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("等待你确认")).toBeInTheDocument());
    expect(screen.getByText(/点击确认后才会执行/)).toBeInTheDocument();
    expect(screen.queryByText("Finfold智能体暂时无法回复，请重试。")).not.toBeInTheDocument();
  });

  it("uses the composer plus action for real private attachments instead of navigation", async () => {
    const attachment = {
      id: "b5c40cb4-8e8d-47c0-829a-22e8c3441f31",
      name: "launch-brief.pdf",
      size: 2048,
      kind: "pdf",
      mimeType: "application/pdf",
      storagePath: "user-1/b5c40cb4-8e8d-47c0-829a-22e8c3441f31.pdf",
      url: "https://storage.example/signed.pdf"
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/agent/attachments") {
        return new Response(JSON.stringify({ attachments: [attachment] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.consume.mockResolvedValue(undefined);

    const user = userEvent.setup();
    const { container } = render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));

    await user.click(screen.getByRole("button", { name: "添加或使用自动化" }));
    const addAttachment = screen.getByRole("menuitem", { name: /^添加文件/ });
    expect(addAttachment.closest("a")).toBeNull();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toContain(".pdf");
    expect(fileInput.accept).toContain(".docx");
    expect(fileInput.accept).toContain(".mp4");

    fireEvent.change(fileInput, { target: { files: [new File(["%PDF-1.7"], "launch-brief.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("launch-brief.pdf")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "总结这份发布计划");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/chat", expect.objectContaining({ method: "POST" })));
    const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/agent/chat");
    const body = JSON.parse(String((chatCall?.[1] as RequestInit).body));
    expect(body.attachments).toEqual([attachment]);
  });

  it("retries a busy model with the same attachment only after the user clicks retry", async () => {
    const attachment = {
      id: "b5c40cb4-8e8d-47c0-829a-22e8c3441f31",
      name: "account-analytics.png",
      size: 2048,
      kind: "image",
      mimeType: "image/png",
      storagePath: "user-1/b5c40cb4-8e8d-47c0-829a-22e8c3441f31.png",
      url: "https://storage.example/signed.png"
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/agent/attachments") {
        return new Response(JSON.stringify({ attachments: [attachment] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let attempt = 0;
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      attempt += 1;
      if (attempt === 1) {
        onEvent("error", {
          code: "PROVIDER_BUSY",
          error: "Finfold智能体当前繁忙。我已保留本轮链接、截图和上下文；请直接重试，无需重新提供资料。"
        });
        onEvent("done", { outcome: "failed" });
      } else {
        onEvent("text", { text: "诊断已继续。" });
        onEvent("done", { outcome: "completed" });
      }
    });

    const user = userEvent.setup();
    const { container } = render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["png"], "account-analytics.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByText("account-analytics.png")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "帮我诊断账号");
    await user.click(screen.getByRole("button", { name: "发送" }));

    const retry = await screen.findByRole("button", { name: "重试本轮（保留附件）" });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/agent/chat")).toHaveLength(1);
    await user.click(retry);
    await screen.findByText("诊断已继续。");

    const chatCalls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/agent/chat");
    expect(chatCalls).toHaveLength(2);
    const firstBody = JSON.parse(String((chatCalls[0][1] as RequestInit).body));
    const retryBody = JSON.parse(String((chatCalls[1][1] as RequestInit).body));
    expect(retryBody.message).toBe(firstBody.message);
    expect(retryBody.attachments).toEqual(firstBody.attachments);
  });

  it.each(["/dashboard", "/agents"])("does not duplicate the launcher inside the full Agent workspace at %s", (pathname) => {
    mocks.pathname.mockReturnValue(pathname);
    render(<GlobalAgentRail />);
    expect(screen.queryByRole("button", { name: /问 Finfold/ })).not.toBeInTheDocument();
  });

  it("restores the last lightweight conversation after a refresh", async () => {
    const sessionId = "9ac4df8b-4aab-489f-998d-6fb3156fa20d";
    window.localStorage.setItem("finfold-global-agent-session-v1", sessionId);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      messages: [
        { role: "user", content: { text: "继续我的奶茶新品任务" } },
        {
          role: "assistant",
          content: {
            text: "已恢复到视觉方案这一步。",
            toolCalls: [{ name: "prepare_xhs_campaign", args: { objective: "奶茶新品" } }],
            toolResults: [{ name: "prepare_xhs_campaign", result: { restored: true } }]
          }
        }
      ]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/agent/sessions/${sessionId}`, { cache: "no-store" }));
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    expect(screen.getByText("继续我的奶茶新品任务")).toBeInTheDocument();
    expect(screen.getByText("已恢复到视觉方案这一步。")).toBeInTheDocument();
  });

  it("turns a legacy raw 1305 history error into a safe retry with the original attachment", async () => {
    const sessionId = "9ac4df8b-4aab-489f-998d-6fb3156fa20d";
    const attachment = {
      id: "b5c40cb4-8e8d-47c0-829a-22e8c3441f31",
      name: "account-analytics.png",
      size: 2048,
      kind: "image",
      mimeType: "image/png",
      storagePath: "user-1/b5c40cb4-8e8d-47c0-829a-22e8c3441f31.png",
      url: "https://storage.example/signed.png"
    };
    window.localStorage.setItem("finfold-global-agent-session-v1", sessionId);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === `/api/agent/sessions/${sessionId}`) {
        return new Response(JSON.stringify({
          messages: [
            { role: "user", content: { text: "帮我诊断账号", attachments: [attachment] } },
            {
              role: "assistant",
              content: {
                error: 'LLM request failed: 429 {"error":{"code":"1305","message":"该模型当前访问量过大，请您稍后再试"}}'
              }
            }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("text", { text: "已使用原截图继续诊断。" });
      onEvent("done", { outcome: "completed" });
    });

    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/agent/sessions/${sessionId}`, { cache: "no-store" }));
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));

    expect(screen.queryByText(/LLM request failed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Finfold智能体当前繁忙/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试本轮（保留附件）" }));
    await screen.findByText("已使用原截图继续诊断。");

    const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/agent/chat");
    const body = JSON.parse(String((chatCall?.[1] as RequestInit).body));
    expect(body.message).toBe("帮我诊断账号");
    expect(body.attachments).toEqual([attachment]);
  });

  it("recovers an unfinished historical user turn that has no stored assistant failure", async () => {
    const sessionId = "9ac4df8b-4aab-489f-998d-6fb3156fa20d";
    const attachment = {
      id: "b5c40cb4-8e8d-47c0-829a-22e8c3441f31",
      name: "account-analytics.png",
      size: 2048,
      kind: "image",
      mimeType: "image/png",
      storagePath: "user-1/b5c40cb4-8e8d-47c0-829a-22e8c3441f31.png",
      url: "https://storage.example/signed.png"
    };
    window.localStorage.setItem("finfold-global-agent-session-v1", sessionId);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === `/api/agent/sessions/${sessionId}`) {
        return new Response(JSON.stringify({
          messages: [{ role: "user", content: { text: "帮我诊断账号", attachments: [attachment] } }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("text", { text: "已从未完成处继续。" });
      onEvent("done", { outcome: "completed" });
    });

    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/agent/sessions/${sessionId}`, { cache: "no-store" }));
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));

    expect(screen.getByText(/上一轮没有完成/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试本轮（保留附件）" }));
    await screen.findByText("已从未完成处继续。");

    const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/agent/chat");
    const body = JSON.parse(String((chatCall?.[1] as RequestInit).body));
    expect(body.message).toBe("帮我诊断账号");
    expect(body.attachments).toEqual([attachment]);
  });

  it("uses a plus action for a fresh conversation and exposes switchable history", async () => {
    const user = userEvent.setup();
    render(<GlobalAgentRail previewMode previewPathname="/workbench" />);

    const newChat = screen.getByRole("button", { name: "新对话" });
    expect(newChat.querySelector('[data-fin-icon="Plus"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "历史对话" }));
    expect(screen.getByRole("region", { name: "历史对话" })).toBeInTheDocument();
    expect(screen.getByText("奶茶新品小红书整套方案")).toBeInTheDocument();
    await user.click(screen.getByText("梳理品牌语气与禁用表达"));
    expect(screen.getByText("我已经整理了品牌语气、可复用表达和需要避免的说法。")).toBeInTheDocument();

    await user.click(newChat);
    expect(screen.getByText(/我知道你正在看创作台/)).toBeInTheDocument();
  });

  it("deletes a historical conversation only after management confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/agent/sessions" && !init?.method) {
        return new Response(JSON.stringify({
          sessions: [{ id: "session-delete", title: "旧的诊断对话", updated_at: "2026-08-17T08:00:00.000Z" }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/agent/sessions/session-delete" && init?.method === "DELETE") {
        return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.click(screen.getByRole("button", { name: "历史对话" }));
    expect(await screen.findByText("旧的诊断对话")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "管理" }));
    await user.click(screen.getByRole("button", { name: "删除对话: 旧的诊断对话" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "确认删除: 旧的诊断对话" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/sessions/session-delete",
      expect.objectContaining({ method: "DELETE" })
    ));
    expect(screen.queryByText("旧的诊断对话")).not.toBeInTheDocument();
  });

  it("turns the send action into a real pause control while work is running", async () => {
    const user = userEvent.setup();
    render(<GlobalAgentRail previewMode previewPathname="/workbench" />);
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "继续生成视觉方案");
    await user.click(screen.getByRole("button", { name: "发送" }));

    const pause = screen.getByRole("button", { name: "暂停" });
    expect(pause).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Finfold智能体" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll("[data-agent-border-beam]")).toHaveLength(2);
    expect(screen.getByRole("status", { name: "Finfold智能体工作过程" })).toBeInTheDocument();
    expect(screen.getByText("理解你的目标")).toBeInTheDocument();
    await user.click(pause);

    expect(screen.getByText("已暂停。你可以随时从这里继续。")).toBeInTheDocument();
    expect(screen.getByText(/Finfold智能体工作已暂停/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续这个任务" })).toBeInTheDocument();
  });

  it("aborts the active Agent request when pause is pressed", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "执行一个长任务");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.signal?.aborted).toBe(false);
    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(request.signal?.aborted).toBe(true);
    expect(screen.getByText("已暂停。你可以随时从这里继续。")).toBeInTheDocument();
    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
  });

  it("queues a message sent while a task runs and starts it right after", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));

    await user.type(screen.getByPlaceholderText("想做什么都可以"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // While the first task streams, Enter submits as a steer action that joins
    // the queue instead of racing a second concurrent run.
    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "第二个任务{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("list", { name: "排队任务" })).toBeInTheDocument();
    expect(screen.getByText("1 条任务排队，当前任务结束后依次执行")).toBeInTheDocument();
    expect(screen.getByText("第二个任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();

    // The first task finishing immediately starts the queued message.
    // (Session refreshes also call fetch, so count only Agent chat POSTs.)
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");
    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(chatCalls().length).toBe(2));
    const secondBody = JSON.parse((chatCalls()[1]?.[1]?.body as string) ?? "{}") as { message?: string };
    expect(secondBody.message).toBe("第二个任务");
    expect(screen.queryByRole("list", { name: "排队任务" })).not.toBeInTheDocument();

    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    expect(chatCalls().length).toBe(2);
  });

  it("uploads while a task runs and keeps the attachments on the queued message", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const attachment = {
      id: "c8f6be26-70f1-4d31-9d0f-31c3e35e5cf4",
      name: "review-screenshot.png",
      size: 4096,
      kind: "image",
      mimeType: "image/png",
      storagePath: "user-1/c8f6be26-70f1-4d31-9d0f-31c3e35e5cf4.png",
      url: "https://storage.example/signed.png"
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/agent/attachments") {
        return new Response(JSON.stringify({ attachments: [attachment] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));

    await user.type(screen.getByPlaceholderText("想做什么都可以"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");
    await waitFor(() => expect(chatCalls()).toHaveLength(1));

    // The add path stays open while the task runs.
    const addButton = screen.getByRole("button", { name: "添加或使用自动化" });
    expect(addButton).toBeEnabled();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.disabled).toBe(false);
    fireEvent.change(fileInput, {
      target: { files: [new File(["png"], "review-screenshot.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByText("review-screenshot.png")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "看这张截图{Enter}");
    expect(chatCalls()).toHaveLength(1);
    expect(screen.getByRole("list", { name: "排队任务" })).toBeInTheDocument();
    expect(screen.getByText("1 个附件")).toBeInTheDocument();

    // The queued task starts with its attachment snapshot once the run ends.
    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(chatCalls()).toHaveLength(2));
    const secondBody = JSON.parse((chatCalls()[1]?.[1]?.body as string) ?? "{}") as { message?: string; attachments?: unknown[] };
    expect(secondBody.message).toBe("看这张截图");
    expect(secondBody.attachments).toEqual([attachment]);
  });

  it("discards a queued task without ever sending it", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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
    const chatCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");
    expect(chatCalls).toHaveLength(1);
  });

  it("keeps the queue moving after the running task is paused", async () => {
    let releaseStream: (() => void) | undefined;
    mocks.consume.mockImplementation(() => new Promise<void>((resolve) => {
      releaseStream = resolve;
    }));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "第一个任务");
    await user.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText("插话调整当前任务，或输入新任务排队"), "下一个任务{Enter}");
    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(screen.getByText("已暂停。你可以随时从这里继续。")).toBeInTheDocument();

    await act(async () => {
      releaseStream?.();
      await Promise.resolve();
    });
    const chatCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/agent/chat" && init?.method === "POST");
    await waitFor(() => expect(chatCalls().length).toBe(2));
    const secondBody = JSON.parse((chatCalls()[1]?.[1]?.body as string) ?? "{}") as { message?: string };
    expect(secondBody.message).toBe("下一个任务");
  });

  it("shows a quiet usage hint with run details after a task finishes", async () => {
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("session", { sessionId: "usage-session" });
      onEvent("status", { stage: "composing_response" });
      onEvent("text", { text: "任务完成。" });
      onEvent("usage", { action: "agentStep", credits: 1, available: 99, turn: 1 });
      onEvent("usage", { action: "agentStep", credits: 1, available: 98, turn: 2 });
      onEvent("done", { outcome: "completed" });
    });
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "帮我复盘");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("任务完成。")).toBeInTheDocument());
    const hint = screen.getByRole("button", { name: /^2 创作点数 · \d{2}:\d{2}$/ });
    expect(hint).toBeInTheDocument();
    expect(screen.getByText("本次对话")).not.toBeVisible();

    await user.click(hint);
    expect(screen.getByText("本次对话")).toBeVisible();
    expect(screen.getByText("2 创作点数 · 2 步")).toBeInTheDocument();
    expect(screen.getByText("98 创作点数")).toBeInTheDocument();
  });

  it("surfaces a direct top-up action when the run hits insufficient credits", async () => {
    mocks.consume.mockImplementation(async (_response: Response, onEvent: (event: string, data: unknown) => void) => {
      onEvent("session", { sessionId: "broke-session" });
      onEvent("error", { code: "INSUFFICIENT_CREDITS", error: "创作点数已用完，补充后可继续使用 Finfold智能体。" });
      onEvent("done", { outcome: "failed" });
    });
    const user = userEvent.setup();
    render(<GlobalAgentRail />);
    await user.click(screen.getByRole("button", { name: /问 Finfold/ }));
    await user.type(screen.getByPlaceholderText("想做什么都可以"), "再来一轮");
    await user.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByText("创作点数不足")).toBeInTheDocument());
    const topUp = screen.getByRole("link", { name: "去获取" });
    expect(topUp).toHaveAttribute("href", "/billing");
  });
});

describe("Agent page context", () => {
  it("maps client paths to fixed prompt fragments and ignores unknown text", () => {
    expect(resolveAgentPageContext("/brand-memory").key).toBe("brand-memory");
    const unknown = resolveAgentPageContext("/unknown/ignore-previous-instructions");
    expect(unknown.key).toBe("finfold");
    expect(unknown.prompt).not.toContain("ignore-previous-instructions");
  });
});
