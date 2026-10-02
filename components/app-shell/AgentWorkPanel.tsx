"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDotDashed,
  Loader2,
  X
} from "@/components/ui/icons";
import type { CollaborationViewState } from "@/lib/agent/collaboration-ui";
import { collaborationTaskCount } from "@/lib/agent/collaboration-ui";

export type AgentWorkStep = {
  id: string;
  label: string;
  state: "complete" | "active" | "paused";
  kind: "status" | "tool";
};

export type AgentWorkState = "active" | "complete" | "paused" | "awaiting_input" | "awaiting_confirmation";

export function AgentWorkPanel({
  locale,
  task,
  steps,
  hasOutput,
  state,
  durationMs,
  handoffCompleted = false,
  collaboration,
  onClose,
  closeButtonRef,
  className = ""
}: {
  locale: "zh" | "en";
  task: string;
  steps: AgentWorkStep[];
  hasOutput: boolean;
  state: AgentWorkState;
  durationMs?: number;
  handoffCompleted?: boolean;
  /** Optional subagent collaboration block — rendered only when present. */
  collaboration?: CollaborationViewState;
  onClose: () => void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  const zh = locale === "zh";
  const statusLabel = handoffCompleted
    ? (zh ? "已转接创作台" : "Handed off to Workbench")
    : state === "active"
    ? (zh ? "进行中" : "In progress")
    : state === "awaiting_confirmation"
      ? (zh ? "待确认" : "Awaiting confirmation")
      : state === "awaiting_input"
        ? (zh ? "等你选择" : "Awaiting your choice")
        : state === "paused"
          ? (zh ? "已暂停" : "Paused")
          : (zh ? "已完成" : "Complete");
  const statusCopy = state === "complete" && typeof durationMs === "number"
    ? `${statusLabel} · ${formatDuration(durationMs, zh)}`
    : statusLabel;

  return (
    <aside
      aria-label={zh ? "工作过程和结果" : "Work progress and results"}
      className={`min-h-0 flex-col bg-surface text-fg ${className}`}
    >
      <div className="flex min-h-14 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-action" />
          <p className="text-sm font-bold text-fg">{zh ? "执行记录" : "Activity"}</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label={zh ? "关闭工作面板" : "Close work panel"}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <section>
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${state === "active" ? "text-action" : state === "paused" || state === "awaiting_input" || state === "awaiting_confirmation" ? "text-warn" : "text-positive"}`}>
              {state === "active"
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : state === "paused" || state === "awaiting_input" || state === "awaiting_confirmation"
                  ? <CircleDotDashed className="h-3 w-3" />
                  : <CheckCircle2 className="h-3 w-3" />}
              {statusCopy}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-fg">{task}</p>
        </section>

        {steps.length > 0 ? (
          <section className="mt-5 border-t border-hairline pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              {state === "active" ? (zh ? "正在处理" : "Now") : (zh ? "实际执行" : "Executed")}
            </p>

          <div className="mt-2 space-y-1">
            {steps.map((step) => (
              <div key={step.id} className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs">
                <span className="grid h-4 w-4 shrink-0 place-items-center">
                  {step.state === "complete" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  ) : step.state === "paused" ? (
                    <CircleDotDashed className="h-3 w-3 text-warn" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
                  )}
                </span>
                <span className={`min-w-0 flex-1 leading-5 ${step.state === "active" ? "font-semibold text-fg" : "text-fg-muted"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          </section>
        ) : null}

        {collaboration && collaboration.groups.length > 0 ? (
          <section className="mt-5 border-t border-hairline pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              {zh ? "协作任务" : "Collaboration"}
            </p>
            <p className="mt-1 text-[11px] text-fg-subtle">
              {zh
                ? `${collaborationTaskCount(collaboration)} 个子智能体 · 并行处理`
                : `${collaborationTaskCount(collaboration)} specialists · parallel`}
            </p>
            <div className="mt-2 space-y-1">
              {collaboration.groups.flatMap((group) =>
                group.tasks.map((task) => (
                  <div key={`${group.id}-${task.id}`} className="rounded-lg px-2 py-1.5 text-xs">
                    <div className="flex min-h-6 items-center gap-2.5">
                      <span className="grid h-4 w-4 shrink-0 place-items-center" aria-hidden="true">
                        {task.status === "completed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                        ) : task.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-action motion-reduce:animate-none" />
                        ) : task.status === "cancelled" ? (
                          <CircleDotDashed className="h-3.5 w-3.5 text-fg-subtle" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                        )}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${task.status === "running" ? "font-semibold text-fg" : "text-fg-muted"}`}>
                        {task.label}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
                        {task.status === "completed"
                          ? (task.evidenceCount !== undefined
                            ? (zh ? `已完成 · ${task.evidenceCount} 项证据` : `Done · ${task.evidenceCount} evidence`)
                            : (zh ? "已完成" : "Done"))
                          : task.status === "running"
                            ? (zh ? "处理中" : "Working")
                            : task.status === "cancelled"
                              ? (zh ? "已取消" : "Cancelled")
                              : (zh ? "未完成" : "Unfinished")}
                      </span>
                    </div>
                    {task.status === "completed" && task.summary ? (
                      <p className="mt-0.5 line-clamp-2 pl-6 text-[11px] leading-4 text-fg-subtle">
                        {task.summary}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-5 rounded-xl bg-surface-2/55 px-3 py-2.5 text-[11px] leading-5 text-fg-muted">
          {handoffCompleted
            ? (zh ? "已将确认方案转接至创作台，可继续完成封面和图文编辑。" : "The confirmed plan is now in Workbench for continued editing.")
            : state === "awaiting_confirmation"
              ? (zh ? "有一个操作等你确认，去对话里回复即可。" : "An action needs your approval in the conversation.")
              : state === "awaiting_input"
                ? (zh ? "当前能做的步骤已经完成，点选一个方向后我会自动继续。" : "The safe steps are done. Choose one direction and I’ll continue automatically.")
                : hasOutput
                  ? (zh ? "结果已发在对话里。" : "The results are in the conversation.")
                  : (zh ? "执行进度在这里，结果在对话里。" : "Progress here; results in the conversation.")}
        </div>
      </div>
    </aside>
  );
}

function formatDuration(durationMs: number, zh: boolean): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 1) return zh ? "不到 1 秒" : "<1 sec";
  if (seconds < 60) return zh ? `${seconds} 秒` : `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return zh
    ? `${minutes} 分 ${remainingSeconds} 秒`
    : `${minutes}m ${remainingSeconds}s`;
}
