import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({
  consumeSSEStream: vi.fn()
}));

vi.mock("@/lib/sse-client", () => ({
  consumeSSEStream: mocks.consumeSSEStream
}));

import { describeBrandMemoryUpdate, PendingAgentMutationCard } from "@/components/app-shell/PendingAgentMutationCard";

const pendingResult = {
  confirmationRequired: true,
  pendingAction: {
    id: "0e280e8e-dcab-4322-9487-2c044828e0ee",
    toolName: "prepare_platform_content_package",
    args: {
      platform: "x",
      ideaText: "Turn this verified product update into a useful X thread for independent founders.",
      goal: "audience-growth",
      persona: "indie-builder"
    }
  }
};

const generationRequest = {
  ideaText: "Turn this verified product update into a useful X thread for independent founders.",
  goal: "audience-growth",
  persona: "indie-builder",
  platforms: ["x"],
  language: "en",
  agentContentWorkflowId: "b4d2f64e-cf33-4692-89a0-67131e47832c"
};

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
  doNotCopy: ["不复制身份和原句"],
  limitations: ["没有表现指标"],
  evidenceSources: [1, 2, 3].map((index) => ({
    id: `S${index}`,
    title: `代表内容 ${index}`,
    sourceType: "pasted_text" as const,
    hasMetrics: false
  }))
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Agent content workflow confirmation card", () => {
  it("shows the platform-specific package preview before confirmation", () => {
    render(<PendingAgentMutationCard result={pendingResult} locale="zh" />);

    expect(screen.getByText("X 内容包预览")).toBeTruthy();
    expect(screen.getByText("将生成：编号线程、媒体位置与发布交接包")).toBeTruthy();
  });

  it("confirms once, generates through the existing route, and reports a saved unpublished package", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        executed: true,
        result: { generationRequest }
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("event: done\ndata: {}\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.consumeSSEStream.mockImplementation(async (_response, onEvent) => {
      onEvent("done", { kit: { id: "83696835-66f2-493c-a331-0108eb8266ba", outputs: [{}] } });
    });

    render(<PendingAgentMutationCard result={pendingResult} locale="zh" />);
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));

    await screen.findByText("内容包已保存，包含 1 条可编辑输出；尚未对外发布。");
    expect(screen.getByRole("link", { name: "打开内容包" }).getAttribute("href")).toBe("/kits/83696835-66f2-493c-a331-0108eb8266ba");
    expect(screen.getByRole("link", { name: "去内容库查看全部" }).getAttribute("href")).toBe("/packages");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/agent/actions/0e280e8e-dcab-4322-9487-2c044828e0ee/confirm", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/generate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(generationRequest)
    }));
  });

  it("keeps a failed generation available for an explicit retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        executed: true,
        result: { generationRequest }
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Provider unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("event: done\ndata: {}\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.consumeSSEStream.mockImplementation(async (_response, onEvent) => {
      onEvent("done", { kit: { id: "83696835-66f2-493c-a331-0108eb8266ba", outputs: [{}, {}] } });
    });

    render(<PendingAgentMutationCard result={pendingResult} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await screen.findByText("Provider unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));

    await waitFor(() => expect(screen.getByText("Content package saved with 2 editable outputs. It has not been published.")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("uses English labels in the English Brand Memory proposal", () => {
    expect(describeBrandMemoryUpdate({ toneKeywords: ["specific"], targetAudience: "founders" }, "en"))
      .toBe("Tone words：specific; Audience：founders");
  });

  it("previews the exact creator profile, then saves and undoes it through confirmation", async () => {
    const auditId = "6cb00b15-e578-43b8-b412-6ea6c41fc93b";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        executed: true,
        result: { creatorStyleProfile, auditId }
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ undone: true }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PendingAgentMutationCard result={{
      confirmationRequired: true,
      pendingAction: {
        id: "5cb00b15-e578-43b8-b412-6ea6c41fc93b",
        toolName: "save_creator_style_profile",
        args: { profile: creatorStyleProfile }
      }
    }} locale="zh" />);

    expect(screen.getByText("每篇只解决一个问题")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    await screen.findByText("更改已确认并执行");
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await screen.findByText("更改已撤销");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/agent/actions/5cb00b15-e578-43b8-b412-6ea6c41fc93b/confirm", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/agent/actions/${auditId}/undo`, { method: "POST" });
  });
});
