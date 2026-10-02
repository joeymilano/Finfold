import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentCollaborationStrip } from "@/components/app-shell/AgentCollaborationStrip";
import { AgentWorkPanel } from "@/components/app-shell/AgentWorkPanel";
import {
  collaborationFromWorkRecord,
  createCollaborationViewState,
  summarizeCollaboration,
  type CollaborationViewState
} from "@/lib/agent/collaboration-ui";
import type { SubagentEvent } from "@/lib/agent/subagents";

function viewFromEvents(events: SubagentEvent[]): CollaborationViewState {
  const state = createCollaborationViewState();
  events.forEach(state.apply);
  return state.snapshot();
}

const GROUP_EVENTS: SubagentEvent[] = [
  { type: "subagent_group_started", groupId: "g-ui", taskCount: 3 },
  { type: "subagent_task_started", groupId: "g-ui", taskId: "t1", kind: "evidence_analyst", label: "核对资料" },
  { type: "subagent_task_started", groupId: "g-ui", taskId: "t2", kind: "brand_strategist", label: "梳理策略" },
  { type: "subagent_task_started", groupId: "g-ui", taskId: "t3", kind: "channel_specialist", label: "适配平台" },
  { type: "subagent_task_completed", groupId: "g-ui", taskId: "t1", label: "核对资料", durationMs: 6200, evidenceCount: 6, summary: "资料一致，数据可信。" },
  { type: "subagent_task_completed", groupId: "g-ui", taskId: "t2", label: "梳理策略", durationMs: 8400, evidenceCount: 2, summary: "策略聚焦单一假设。" },
  { type: "subagent_task_completed", groupId: "g-ui", taskId: "t3", label: "适配平台", durationMs: 9000, evidenceCount: 3, summary: "三平台各有侧重。" },
  { type: "subagent_group_completed", groupId: "g-ui", completed: 3, failed: 0, durationMs: 9000 }
];

describe("AgentCollaborationStrip", () => {
  it("renders nothing when no subagent ever ran", () => {
    const { container } = render(<AgentCollaborationStrip view={{ groups: [] }} locale="zh" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a running line with task-name copy and progress", () => {
    const view = viewFromEvents(GROUP_EVENTS.slice(0, 5));
    render(<AgentCollaborationStrip view={view} locale="zh" />);
    expect(screen.getByText("3 个子智能体正在协作")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("shows the completed line and stays quiet while running (aria-live only when finished)", () => {
    const noop = () => {};
    const running = viewFromEvents(GROUP_EVENTS.slice(0, 2));
    const { rerender } = render(<AgentCollaborationStrip view={running} locale="zh" onClick={noop} />);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-live");

    const finished = viewFromEvents(GROUP_EVENTS);
    rerender(<AgentCollaborationStrip view={finished} locale="zh" onClick={noop} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/3 个子智能体已完成/)).toBeInTheDocument();
  });

  it("states partial failure plainly", () => {
    const view = viewFromEvents([
      ...GROUP_EVENTS.slice(0, 6),
      { type: "subagent_task_failed", groupId: "g-ui", taskId: "t3", label: "适配平台", durationMs: 500 },
      { type: "subagent_group_completed", groupId: "g-ui", completed: 2, failed: 1, durationMs: 8400 }
    ]);
    render(<AgentCollaborationStrip view={view} locale="zh" />);
    expect(screen.getByText("2 项完成，1 项未完成")).toBeInTheDocument();
  });

  it("labels cancelled and failed groups without faking success", () => {
    const cancelled = viewFromEvents([
      { type: "subagent_group_started", groupId: "g-c", taskCount: 2 },
      { type: "subagent_task_started", groupId: "g-c", taskId: "t1", kind: "risk_reviewer", label: "检查风险" },
      { type: "subagent_task_started", groupId: "g-c", taskId: "t2", kind: "evidence_analyst", label: "核对资料" }
    ]);
    const { rerender } = render(<AgentCollaborationStrip view={cancelled} locale="zh" />);
    rerender(<AgentCollaborationStrip view={cancelled} locale="zh" />);
    expect(screen.getByText(/协作已取消|正在协作/)).toBeInTheDocument();

    const failed = viewFromEvents([
      { type: "subagent_group_started", groupId: "g-f", taskCount: 2 },
      { type: "subagent_task_started", groupId: "g-f", taskId: "t1", kind: "risk_reviewer", label: "检查风险" },
      { type: "subagent_task_started", groupId: "g-f", taskId: "t2", kind: "evidence_analyst", label: "核对资料" },
      { type: "subagent_task_failed", groupId: "g-f", taskId: "t1", label: "检查风险", durationMs: 300 },
      { type: "subagent_task_failed", groupId: "g-f", taskId: "t2", label: "核对资料", durationMs: 320 },
      { type: "subagent_group_completed", groupId: "g-f", completed: 0, failed: 2, durationMs: 320 }
    ]);
    rerender(<AgentCollaborationStrip view={failed} locale="zh" />);
    expect(screen.getByText("并行分析未完成")).toBeInTheDocument();
  });

  it("opens the Work Panel on click (keyboard-reachable native button)", () => {
    const onClick = vi.fn();
    const view = viewFromEvents(GROUP_EVENTS);
    render(<AgentCollaborationStrip view={view} locale="zh" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("never leaks prompts, providers, model names or raw JSON", () => {
    const view = viewFromEvents(GROUP_EVENTS);
    const { container } = render(<AgentCollaborationStrip view={view} locale="zh" />);
    const text = container.textContent ?? "";
    for (const forbidden of ["prompt", "provider", "model", "JSON", "{", "}", "subagent:", "deepseek", "opus"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("supports English copy", () => {
    const view = viewFromEvents(GROUP_EVENTS);
    render(<AgentCollaborationStrip view={view} locale="en" />);
    expect(screen.getByText(/3 specialists done/)).toBeInTheDocument();
  });
});

describe("AgentWorkPanel collaboration block", () => {
  const basePanel = {
    locale: "zh" as const,
    task: "为下周制定三平台内容策略",
    steps: [],
    hasOutput: true,
    state: "complete" as const,
    onClose: () => {}
  };

  it("renders one row per specialist with status, evidence and a clipped summary", () => {
    const view = viewFromEvents(GROUP_EVENTS);
    render(<AgentWorkPanel {...basePanel} collaboration={view} />);
    expect(screen.getByText("协作任务")).toBeInTheDocument();
    expect(screen.getByText("3 个子智能体 · 并行处理")).toBeInTheDocument();
    expect(screen.getByText("核对资料")).toBeInTheDocument();
    expect(screen.getByText(/6 项证据/)).toBeInTheDocument();
    expect(screen.getByText("资料一致，数据可信。")).toBeInTheDocument();
    expect(screen.queryByText("Running") ?? screen.getByText("已完成")).toBeInTheDocument();
  });

  it("adds no block when no collaboration exists", () => {
    render(<AgentWorkPanel {...basePanel} />);
    expect(screen.queryByText("协作任务")).not.toBeInTheDocument();
  });

  it("replaces the stale approval state with a completed Workbench handoff", () => {
    render(<AgentWorkPanel {...basePanel} handoffCompleted />);
    expect(screen.getByText("已转接创作台")).toBeInTheDocument();
    expect(screen.getByText("已将确认方案转接至创作台，可继续完成封面和图文编辑。")).toBeInTheDocument();
    expect(screen.queryByText("待确认")).not.toBeInTheDocument();
  });

  it("shows a truthful waiting state when the Agent needs one user choice", () => {
    render(<AgentWorkPanel {...basePanel} state="awaiting_input" />);
    expect(screen.getByText("等你选择")).toBeInTheDocument();
    expect(screen.getByText("当前能做的步骤已经完成，点选一个方向后我会自动继续。")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });

  it("keeps technical details out of the panel", () => {
    const view = viewFromEvents(GROUP_EVENTS);
    const { container } = render(<AgentWorkPanel {...basePanel} collaboration={view} />);
    const text = container.textContent ?? "";
    for (const forbidden of ["evidence_analyst", "subagent:", "g-ui", "provider", "prompt"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("history restore", () => {
  it("rebuilds the same view from a persisted Work Record", () => {
    const work = {
      version: 2,
      stages: ["understanding_request", "composing_response"],
      outcome: "completed",
      startedAt: "2026-08-17T10:00:00.000Z",
      completedAt: "2026-08-17T10:00:20.000Z",
      durationMs: 20000,
      collaboration: {
        groups: [{
          id: "g-hist",
          status: "partial",
          startedAt: "2026-08-17T10:00:02.000Z",
          completedAt: "2026-08-17T10:00:18.000Z",
          durationMs: 16000,
          tasks: [
            { id: "t1", kind: "evidence_analyst", label: "核对资料", status: "completed", durationMs: 6000, evidenceCount: 4, summary: "资料一致" },
            { id: "t2", kind: "brand_strategist", label: "梳理策略", status: "failed", durationMs: 9000 }
          ]
        }]
      }
    };
    const restored = collaborationFromWorkRecord(work);
    expect(restored).toBeDefined();
    const summary = summarizeCollaboration(restored!);
    expect(summary?.tone).toBe("partial");
    expect(summary?.labelZh).toBe("1 项完成，1 项未完成");
  });

  it("returns undefined for legacy V1 rows and plain runs", () => {
    expect(collaborationFromWorkRecord({ version: 1, stages: [], outcome: "completed", startedAt: "2026-08-17T10:00:00.000Z", completedAt: "2026-08-17T10:00:05.000Z", durationMs: 5000 })).toBeUndefined();
    expect(collaborationFromWorkRecord(undefined)).toBeUndefined();
  });
});
