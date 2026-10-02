import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeSSEStream: vi.fn()
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/sse-client", () => ({ consumeSSEStream: mocks.consumeSSEStream }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, next: string) => `${current}${next}`,
  SpeechInputButton: () => null
}));

import { AgentAutomationCenter } from "@/components/app-shell/AgentAutomationCenter";

const creatorStyleProfile = {
  creatorName: "示例博主",
  profileUrl: "https://example.com/creator",
  performanceStatus: "unverified_reference",
  confidence: "medium",
  audienceAndTopics: [{ finding: "从具体工作场景切入", evidenceIds: ["S1"] }],
  hooksAndPackaging: [{ finding: "开场提出一个矛盾", evidenceIds: ["S1"] }],
  structureAndRhythm: [{ finding: "结论、证据、动作三段推进", evidenceIds: ["S2"] }],
  proofAndTrust: [{ finding: "使用过程证据", evidenceIds: ["S2"] }],
  engagementAndConversion: [{ finding: "结尾只设置一个动作", evidenceIds: ["S3"] }],
  toneKeywords: ["具体"],
  transferableRules: [{ finding: "每篇只解决一个问题", evidenceIds: ["S1", "S3"] }],
  doNotCopy: ["不复制身份、口头禅和原句"],
  limitations: ["没有表现指标，不能称为爆款样本"],
  evidenceSources: [1, 2, 3].map((index) => ({
    id: `S${index}`,
    title: `代表内容 ${index}`,
    sourceType: "pasted_text" as const,
    hasMetrics: false
  }))
};

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("creator-style Agent happy path", () => {
  it("goes from three samples to preview, confirmation, undo, and the next content task", async () => {
    let chatRequestCount = 0;
    const auditId = "audit-creator-style";
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/agent/chat") {
        chatRequestCount += 1;
        return Promise.resolve(new Response("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" }
        }));
      }
      if (url === "/api/agent/actions/pending-creator-style/confirm") {
        return jsonResponse({ executed: true, result: { creatorStyleProfile, auditId } });
      }
      if (url === `/api/agent/actions/${auditId}/undo`) {
        return jsonResponse({ undone: true });
      }
      if (url === "/api/agent/sessions") return jsonResponse({ sessions: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    mocks.consumeSSEStream.mockImplementation(async (_response, onEvent) => {
      if (chatRequestCount === 1) {
        onEvent("status", { stage: "choosing_capabilities" });
        onEvent("tool_call", { name: "analyze_creator_style", args: {} });
        onEvent("tool_result", { name: "analyze_creator_style", result: { creatorStyleProfile } });
        onEvent("tool_call", { name: "save_creator_style_profile", args: { profile: creatorStyleProfile } });
        onEvent("tool_result", {
          name: "save_creator_style_profile",
          result: {
            confirmationRequired: true,
            pendingAction: {
              id: "pending-creator-style",
              toolName: "save_creator_style_profile",
              args: { profile: creatorStyleProfile }
            }
          }
        });
        onEvent("text", { text: "能力画像已生成。确认后才会写入品牌记忆。" });
        onEvent("done", { outcome: "awaiting_confirmation" });
        return;
      }
      onEvent("text", { text: "下一篇内容任务已收到。" });
      onEvent("done", { outcome: "completed" });
    });

    render(<AgentAutomationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "添加或使用自动化" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^学习博主/ }));
    fireEvent.change(screen.getByPlaceholderText("例如：分析我的账号，告诉我下一步"), {
      target: {
        value: "主页 https://example.com/creator；以下是代表内容 S1、S2、S3，请分析可迁移能力。"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect((await screen.findAllByText("仅为对标样本，未验证爆款表现")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("代表内容 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("代表内容 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("代表内容 3").length).toBeGreaterThan(0);
    expect(screen.getByText("能力画像已生成。确认后才会写入品牌记忆。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    expect(await screen.findByText("更改已确认并执行")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(await screen.findByText("更改已撤销")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /用于下一篇内容/ }));
    await screen.findByText("下一篇内容任务已收到。");

    const chatCalls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/agent/chat");
    expect(chatCalls).toHaveLength(2);
    const nextTask = JSON.parse(String((chatCalls[1][1] as RequestInit).body)) as { message: string };
    expect(nextTask.message).toContain("使用这份已分析的对标风格画像");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/agent/actions/${auditId}/undo`,
      { method: "POST" }
    ));
  });
});
