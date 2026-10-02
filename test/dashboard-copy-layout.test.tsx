import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";
import { OperatingDashboard } from "@/components/app-shell/OperatingDashboard";
import type { ContentKit } from "@/lib/content-schema";

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

const kit: ContentKit = {
  id: "kit-1",
  ideaText: "产品更新",
  goal: "lead-gen",
  persona: "ai-saas",
  platforms: ["x"],
  mediaAssets: [],
  outputs: [{
    id: "output-1",
    platform: "x",
    title: "标题",
    body: "正文",
    cta: "行动",
    notes: "备注",
    strategy: "策略",
    locked: false,
    publishStatus: "draft",
    userEdited: false
  }],
  status: "saved",
  createdAt: "2026-07-17T08:00:00.000Z"
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body)
  } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("dashboard copy and headline layout", () => {
  it("keeps the empty state focused on the fastest happy path", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ sessions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    expect(screen.getByText("你的 AI 增长运营员工")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "把今天的增长运营任务交给我" })).toBeInTheDocument();
    expect(screen.getByText("告诉我目标，我会调研、创作并检查结果，只在需要时问你")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Finfold智能体" })).toHaveClass("bg-surface", "text-fg", "border-hairline");
    expect(screen.queryByRole("button", { name: "诊断账号" })).not.toBeInTheDocument();
    expect(screen.queryByText("自动调度能力")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上下文" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "品牌记忆" })).not.toBeInTheDocument();

    const addButton = screen.getByRole("button", { name: "添加或使用自动化" });
    fireEvent.click(addButton);
    const addMenu = screen.getByRole("menu", { name: "添加与自动化" });
    expect(addMenu).toBeInTheDocument();
    expect(addMenu).toHaveClass("absolute", "bottom-[calc(100%+0.55rem)]", "sm:top-[calc(100%+0.55rem)]", "bg-surface-raised", "shadow-raised");
    expect(addMenu).not.toHaveClass("bg-surface-raised/98");
    expect(addButton).toHaveAttribute("aria-expanded", "true");
    expect(addButton).toHaveClass("bg-action/[0.10]", "text-action");
    const fileItem = screen.getByRole("menuitem", { name: /^添加文件/ });
    const diagnoseItem = screen.getByRole("menuitemradio", { name: /^诊断账号/ });
    expect(fileItem).toHaveClass("hover:bg-surface-2/85");
    expect(diagnoseItem).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemradio", { name: /^学习博主/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /^调研机会/ })).toHaveClass("hover:bg-surface-2/85");
    expect(screen.getByRole("menuitemradio", { name: /^规划内容/ })).toBeInTheDocument();

    await waitFor(() => expect(fileItem).toHaveFocus());
    fireEvent.keyDown(addMenu, { key: "ArrowDown" });
    expect(diagnoseItem).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "添加与自动化" })).not.toBeInTheDocument());
    expect(addButton).toHaveFocus();
    fireEvent.click(addButton);

    fireEvent.click(screen.getByRole("menuitemradio", { name: /^调研机会/ }));
    expect(input).toHaveValue("帮我调研一个品类或竞品机会。先问我需要补充什么。");
    expect(screen.queryByRole("menu", { name: "添加与自动化" })).not.toBeInTheDocument();

    fireEvent.click(addButton);
    expect(screen.getByRole("menuitemradio", { name: /^调研机会/ }))
      .toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /^调研机会/ }))
      .toHaveClass("border-action/30", "bg-action/[0.10]");
  });

  it("reveals context only after the conversation starts", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ sessions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentAutomationCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/agent/sessions", { cache: "no-store" }));

    expect(screen.queryByRole("link", { name: "品牌记忆" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "品牌规则" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加或使用自动化" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^诊断账号/ }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const trigger = await screen.findByRole("button", { name: "上下文" });
    const conversation = screen.getByRole("region", { name: "Finfold智能体" });
    const messageLog = screen.getByRole("log");
    const composerDock = conversation.querySelector("[data-agent-composer-dock]");
    expect(conversation).toHaveClass("min-h-0", "overflow-hidden");
    expect(messageLog).toHaveClass("min-h-0", "overflow-y-auto", "overscroll-contain");
    expect(composerDock).toHaveClass("shrink-0");
    expect(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步")).toHaveAttribute("rows", "1");
    expect(screen.getByText("帮我诊断账号。先告诉我需要哪些资料。").parentElement).toHaveClass("shrink-0");
    expect(screen.queryByText("关键操作会先确认。")).not.toBeInTheDocument();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "上下文" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    expect(within(dialog).getByText("生成和诊断时自动参考，无需每次重复提供。")).toBeInTheDocument();
    expect(within(dialog).getByText("产品定位 · 语气与示例 · 禁用表达")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "品牌记忆" })).toHaveAttribute("href", "/brand-memory");
    expect(within(dialog).getByRole("link", { name: "品牌规则" })).toHaveAttribute("href", "/guardrails");
    expect(within(dialog).queryByText("小红书今日行动")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("今日值班简报 · 自动更新")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("智能体接入与高级连接")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "上下文" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps the side panel focused on execution without repeating conversation results", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") {
        return jsonResponse({
          sessions: [{ id: "session-1", title: "账号改写任务", updated_at: "2026-08-14T02:00:00.000Z" }]
        });
      }
      if (url === "/api/agent/sessions/session-1") {
        return jsonResponse({
          messages: [
            { role: "user", content: { text: "把这篇内容改得更适合小红书" } },
            {
              role: "assistant",
              content: {
                text: "建议先保留真实案例，再收紧开场。",
                toolCalls: [{ name: "rewrite_text", args: { platform: "xiaohongshu" } }],
                toolResults: [{ name: "rewrite_text", result: { summary: "改写稿已生成。" } }],
                work: {
                  version: 1,
                  stages: ["understanding_request", "choosing_capabilities", "reviewing_results", "composing_response"],
                  outcome: "completed",
                  startedAt: "2026-08-14T02:00:00.000Z",
                  completedAt: "2026-08-14T02:00:12.000Z",
                  durationMs: 12_000
                }
              }
            }
          ]
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentAutomationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "历史会话" }));
    fireEvent.click(await screen.findByRole("button", { name: "账号改写任务" }));

    const workTrigger = await screen.findByRole("button", { name: "打开工作过程和结果" });
    fireEvent.click(workTrigger);

    expect(screen.getAllByRole("complementary", { name: "工作过程和结果" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("把这篇内容改得更适合小红书").length).toBeGreaterThan(0);
    const panel = screen.getAllByRole("complementary", { name: "工作过程和结果" })[0];
    expect(within(panel).queryByText("改写稿已生成。")).not.toBeInTheDocument();
    expect(within(panel).queryByText("智能体结论")).not.toBeInTheDocument();
    expect(within(panel).getByText("按风格改写文案")).toBeInTheDocument();
    expect(within(panel).queryByText("理解你的目标")).not.toBeInTheDocument();
    expect(within(panel).getByText("已完成 · 12 秒")).toBeInTheDocument();
    expect(within(panel).getByText("结果已发在对话里。")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "工作过程和结果" })).not.toBeInTheDocument());
    expect(workTrigger).toHaveFocus();
  });

  it("keeps the work panel scoped to the latest task and marks confirmations accurately", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") {
        return jsonResponse({
          sessions: [{ id: "session-2", title: "连续任务", updated_at: "2026-08-14T03:00:00.000Z" }]
        });
      }
      if (url === "/api/agent/sessions/session-2") {
        return jsonResponse({
          messages: [
            { role: "user", content: { text: "先改写这段旧文案" } },
            {
              role: "assistant",
              content: {
                text: "第一轮已经完成。",
                toolCalls: [{ name: "rewrite_text", args: {} }],
                toolResults: [{ name: "rewrite_text", result: { summary: "第一轮旧结果，不应出现在当前任务结果中。" } }]
              }
            },
            { role: "user", content: { text: "把这条可迁移规则写入品牌记忆" } },
            {
              role: "assistant",
              content: {
                text: "规则已整理好，确认后再写入。",
                toolCalls: [{ name: "update_brand_brain", args: { toneKeywords: ["具体"] } }],
                toolResults: [{
                  name: "update_brand_brain",
                  result: {
                    confirmationRequired: true,
                    pendingAction: {
                      id: "pending-brand-memory",
                      toolName: "update_brand_brain",
                      args: { toneKeywords: ["具体"] }
                    }
                  }
                }]
              }
            }
          ]
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentAutomationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "历史会话" }));
    fireEvent.click(await screen.findByRole("button", { name: "连续任务" }));
    fireEvent.click(await screen.findByRole("button", { name: "打开工作过程和结果" }));

    const panel = screen.getAllByRole("complementary", { name: "工作过程和结果" })[0];
    expect(within(panel).getByText("把这条可迁移规则写入品牌记忆")).toBeInTheDocument();
    expect(within(panel).getByText("待确认")).toBeInTheDocument();
    expect(within(panel).queryByText("已生成预览，等待你确认后执行。")).not.toBeInTheDocument();
    expect(within(panel).getByText("有一个操作等你确认，去对话里回复即可。")).toBeInTheDocument();
    expect(within(panel).queryByText("第一轮旧结果，不应出现在当前任务结果中。")).not.toBeInTheDocument();
  });

  it("lets the user pause an active full-page agent request and continue later", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/agent/chat") {
        requestSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return jsonResponse({ sessions: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(min-width: 1024px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));

    render(<AgentAutomationCenter />);
    fireEvent.change(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), {
      target: { value: "帮我调研小红书选题" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const pauseButton = await screen.findByRole("button", { name: "暂停" });
    expect(screen.getByRole("button", { name: "关闭工作过程和结果" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("理解你的目标").length).toBeGreaterThan(0);
    expect(screen.getAllByText("执行进度在这里，结果在对话里。").length).toBeGreaterThan(0);
    fireEvent.click(pauseButton);

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(screen.getAllByText("已暂停。你可以随时从这里继续。").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "继续这个任务" })).toBeInTheDocument();
  });

  it("gives the Chinese dashboard headline room and balanced wrapping", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/entitlements/check") return jsonResponse({ authenticated: true, plan: "free" });
      if (url === "/api/kits") return jsonResponse({ kits: [kit] });
      if (url === "/api/dashboard/summary") {
        return jsonResponse({
          summary: {
            toReview: 0,
            awaitingMetrics: 0,
            closedLoops: 0,
            publishedThisWeek: 0,
            daysSinceLastPublish: null,
            automatedSignalsThisWeek: 0,
            outcomes: { engagement: 0, leads: 0, signups: 0, revenue: 0 },
            learnedRules: [],
            nextAction: { kind: "create", href: "/workbench" }
          }
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OperatingDashboard />);
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "一条产品动态，自动变成各平台文案"
    });

    await waitFor(() => expect(heading).toHaveClass("max-w-5xl", "text-balance"));
    expect(screen.getByRole("link", { name: "设置运营项目" })).toHaveAttribute("href", "/operations");
  });
});
