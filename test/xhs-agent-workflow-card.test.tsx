// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  XhsTodayActionCard,
  XhsToolResultCard
} from "@/components/app-shell/XhsAgentWorkflowCard";
import { emptyXhsWorkflowState, type XhsWorkflowState } from "@/lib/agent/xhs-workflow";

afterEach(() => {
  cleanup();
  if (typeof window.localStorage?.clear === "function") window.localStorage.clear();
  vi.restoreAllMocks();
});

function mockSuccessfulConfirmation(payload: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => Promise.resolve(
    new Response(JSON.stringify(init?.method === "POST" ? payload : { status: "pending" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  ));
}

describe("Xiaohongshu Agent workflow cards", () => {
  it("shows one next action, its evidence, metric, and the collapsed full flow", () => {
    const state = emptyXhsWorkflowState("zh");
    render(<XhsTodayActionCard state={state} loading={false} locale="zh" onAskAgent={vi.fn()} />);

    expect(screen.getByText("先把账号定位说清楚")).toHaveClass("text-fg");
    expect(screen.getByText("判断依据")).toHaveClass("text-fg-muted/75");
    expect(screen.getByText("先完成策略确认")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /完整流程/ }));
    expect(screen.getByText("定位")).toBeTruthy();
    expect(screen.getByText("发布复盘")).toBeTruthy();
  });

  it("requires a candidate selection and confirms the durable action through the server", async () => {
    const nextState: XhsWorkflowState = {
      ...emptyXhsWorkflowState("zh"),
      nextAction: {
        ...emptyXhsWorkflowState("zh").nextAction,
        kind: "prepare_draft",
        title: "补充真实素材"
      }
    };
    const fetchMock = mockSuccessfulConfirmation({ state: nextState, auditId: crypto.randomUUID() });
    const onStateChanged = vi.fn();
    render(
      <XhsToolResultCard
        locale="zh"
        onStateChanged={onStateChanged}
        result={{
          xhsCard: {
            kind: "topics",
            eyebrow: "策略假设 · 请选择一个",
            title: "三个选题",
            summary: "没有实时趋势数据。",
            items: [
              { id: "topic-1", title: "选题一", rationale: "来自内容支柱" },
              { id: "topic-2", title: "选题二", rationale: "来自真实问题" }
            ]
          },
          pendingAction: { id: crypto.randomUUID(), actionKind: "select_topic" }
        }}
      />
    );

    const confirm = screen.getByRole("button", { name: "选择这个选题" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByText("选题二"));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onStateChanged).toHaveBeenCalledWith(nextState));
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/xhs/actions", expect.objectContaining({
      method: "POST"
    }));
    expect(screen.getByText("已确认并保存")).toBeTruthy();
  });

  it("adopts an end-to-end campaign with one confirmation before showing the workbench handoff", async () => {
    const nextState: XhsWorkflowState = {
      ...emptyXhsWorkflowState("zh"),
      workflow: {
        id: crypto.randomUUID(),
        status: "active",
        stage: "publish",
        currentBottleneck: "execution",
        primaryMetric: "cover_click_rate",
        strategyProfileId: crypto.randomUUID(),
        growthMissionId: null,
        kitId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    mockSuccessfulConfirmation({ state: nextState, auditId: crypto.randomUUID() });
    render(
      <XhsToolResultCard
        locale="zh"
        result={{
          xhsCard: {
            kind: "campaign",
            eyebrow: "整套方案 · 一次确认",
            title: "办公楼下的新奶茶，怎么让人记住",
            summary: "调研、正文、标题和视觉故事板已经完成。",
            items: [{ id: "campaign-topic", title: "推荐选题：午休新品", rationale: "来自真实消费场景" }],
            meta: { href: "/workbench?workflowId=test", targetMetric: "封面点击率" }
          },
          pendingAction: { id: crypto.randomUUID(), actionKind: "confirm_campaign" }
        }}
      />
    );

    expect(screen.getByRole("button", { name: "采用整套方案" })).not.toBeDisabled();
    expect(screen.queryByRole("link", { name: /继续执行/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "采用整套方案" }));

    await waitFor(() => expect(screen.getByText("已转接至创作台")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "采用整套方案" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "载入创作台" })).toHaveAttribute("href", "/workbench?workflowId=test");
    expect(screen.getByText("打开后会载入新选题与确认产物；完成生成后，内容包会自动进入内容库。")).toBeInTheDocument();
  });

  it("renders structured visual checks as text and hands the confirmed plan directly to Workbench", async () => {
    const nextState: XhsWorkflowState = {
      ...emptyXhsWorkflowState("zh"),
      workflow: {
        id: crypto.randomUUID(),
        status: "active",
        stage: "publish",
        currentBottleneck: "execution",
        primaryMetric: "cover_click_rate",
        strategyProfileId: crypto.randomUUID(),
        growthMissionId: null,
        kitId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      nextAction: {
        kind: "publish_note",
        title: "带着已确认方案去创作台",
        reason: "继续编辑",
        evidence: "视觉方案已确认",
        targetMetric: "封面点击率",
        href: "/workbench?workflowId=visual-test&platform=xiaohongshu",
        prompt: "带我去创作台",
        requiresConfirmation: false,
        confidence: "inferred"
      }
    };
    mockSuccessfulConfirmation({ state: nextState, auditId: crypto.randomUUID() });
    render(
      <XhsToolResultCard
        locale="zh"
        result={{
          xhsCard: {
            kind: "visual",
            eyebrow: "3:4 视觉方案待确认",
            title: "作品集封面",
            summary: "6 页视觉故事",
            meta: {
              qa: [
                { check: "保持统一字体层级", status: "pass" },
                { label: "截图裁切放大并标注", checked: true },
                { description: "导出前检查安全边距" }
              ]
            }
          },
          pendingAction: { id: crypto.randomUUID(), actionKind: "confirm_visual" }
        }}
      />
    );

    expect(screen.getByText("· 保持统一字体层级")).toBeInTheDocument();
    expect(screen.getByText("· 截图裁切放大并标注")).toBeInTheDocument();
    expect(screen.getByText("· 导出前检查安全边距")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认视觉方案" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "载入创作台" })).toHaveAttribute(
      "href",
      "/workbench?workflowId=visual-test&platform=xiaohongshu"
    ));
    expect(screen.getByText("已转接至创作台")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认视觉方案" })).not.toBeInTheDocument();
  });

  it("restores an executed visual handoff without showing the stale confirmation button", async () => {
    const pendingActionId = crypto.randomUUID();
    const onActionStatusChanged = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        status: "executed",
        auditId: crypto.randomUUID(),
        workbenchHref: "/workbench?workflowId=persisted&platform=xiaohongshu"
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    render(
      <XhsToolResultCard
        locale="zh"
        onActionStatusChanged={onActionStatusChanged}
        result={{
          xhsCard: {
            kind: "visual",
            eyebrow: "视觉方案",
            title: "作品集封面",
            summary: "已经转到创作台",
            meta: { href: "/workbench?workflowId=persisted&platform=xiaohongshu" }
          },
          pendingAction: { id: pendingActionId, actionKind: "confirm_visual" }
        }}
      />
    );

    await waitFor(() => expect(screen.getByText("已转接至创作台")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "确认视觉方案" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "载入创作台" })).toHaveAttribute(
      "href",
      "/workbench?workflowId=persisted&platform=xiaohongshu"
    );
    expect(onActionStatusChanged).toHaveBeenCalledWith(pendingActionId, "executed");
  });

  it("shows a factual review receipt after accepting a performance review", async () => {
    const nextState = emptyXhsWorkflowState("zh");
    mockSuccessfulConfirmation({
      state: nextState,
      auditId: crypto.randomUUID(),
      completionReceipt: {
        title: "点击环节需要优先改进",
        summary: "成熟笔记的封面点击率低于中位数。",
        evidence: "5 篇成熟笔记中，封面点击率中位数为 3.2%。",
        primaryMetric: "封面点击率",
        nextAction: { title: "选择下一轮选题", href: "/dashboard", prompt: "给我三个选题" },
        persistedArtifact: "analytics_report"
      }
    });
    render(
      <XhsToolResultCard
        locale="zh"
        result={{
          xhsCard: { kind: "review", eyebrow: "真实表现", title: "复盘完成", summary: "查看数据结论" },
          pendingAction: { id: crypto.randomUUID(), actionKind: "complete_review" }
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "采纳复盘，安排下一轮" }));

    await waitFor(() => expect(screen.getByLabelText("本轮复盘回执")).toBeInTheDocument());
    expect(screen.getByText("成熟笔记的封面点击率低于中位数。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /下一步：选择下一轮选题/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByText("已写入品牌记忆")).not.toBeInTheDocument();
  });

  it("keeps a failed confirmation pending and makes the retry explicit", async () => {
    let postCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      if (init?.method !== "POST") {
        return Promise.resolve(new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));
      }
      postCount += 1;
      if (postCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Temporary save failure" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        state: emptyXhsWorkflowState("zh"),
        auditId: crypto.randomUUID()
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    render(
      <XhsToolResultCard
        locale="zh"
        result={{
          xhsCard: { kind: "review", eyebrow: "真实表现", title: "复盘完成", summary: "查看数据结论" },
          pendingAction: { id: crypto.randomUUID(), actionKind: "complete_review" }
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "采纳复盘，安排下一轮" }));
    await waitFor(() => expect(screen.getByText("Temporary save failure")).toBeInTheDocument());
    expect(screen.queryByText("已确认并保存")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试确认" }));

    await waitFor(() => expect(screen.getByText("已确认并保存")).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });

  it("still links a metric-less next-action card to Workbench", () => {
    render(
      <XhsToolResultCard
        locale="zh"
        result={{
          xhsCard: {
            kind: "next_action",
            eyebrow: "小红书今日行动",
            title: "带着已确认方案去创作台",
            summary: "策略已确认，创作台负责编辑、封面、配图和导出。",
            items: [{ label: "判断依据", value: "定位、选题、正文方向、标题和视觉方案已经确认。" }],
            meta: { href: "/workbench?platform=xiaohongshu", targetMetric: null, confidence: "inferred" }
          }
        }}
      />
    );

    const handoff = screen.getByRole("link", { name: /继续执行/ });
    expect(handoff).toHaveAttribute("href", "/workbench?platform=xiaohongshu");
  });
});
