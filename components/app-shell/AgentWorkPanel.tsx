"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  CircleDotDashed,
  FileStack,
  Loader2,
  Wrench,
  X
} from "@/components/ui/icons";

export type AgentWorkStep = {
  id: string;
  label: string;
  state: "complete" | "active" | "paused";
  kind: "status" | "tool";
};

export type AgentWorkResult = {
  id: string;
  label: string;
  summary: string;
};

export type AgentWorkState = "active" | "complete" | "paused" | "awaiting_confirmation";

export function AgentWorkPanel({
  locale,
  task,
  steps,
  results,
  state,
  durationMs,
  onClose,
  closeButtonRef,
  className = ""
}: {
  locale: "zh" | "en";
  task: string;
  steps: AgentWorkStep[];
  results: AgentWorkResult[];
  state: AgentWorkState;
  durationMs?: number;
  onClose: () => void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  const zh = locale === "zh";
  const statusLabel = state === "active"
    ? (zh ? "进行中" : "In progress")
    : state === "awaiting_confirmation"
      ? (zh ? "待确认" : "Awaiting confirmation")
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
          <div>
            <p className="text-xs font-bold text-fg">{zh ? "工作" : "Work"}</p>
            <p className="mt-0.5 text-[10px] text-fg-muted">{zh ? "过程和结果" : "Progress and results"}</p>
          </div>
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
        <section className="border-b border-hairline pb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              {zh ? "当前任务" : "Current task"}
            </p>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${state === "active" ? "text-action" : state === "paused" || state === "awaiting_confirmation" ? "text-warn" : "text-positive"}`}>
              {state === "active"
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : state === "paused" || state === "awaiting_confirmation"
                  ? <CircleDotDashed className="h-3 w-3" />
                  : <CheckCircle2 className="h-3 w-3" />}
              {statusCopy}
            </span>
          </div>
          <p className="mt-2 line-clamp-4 text-sm font-semibold leading-6 text-fg">{task}</p>
        </section>

        <section className="border-b border-hairline py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              {zh ? "过程" : "Progress"}
            </p>
            <span className="text-[10px] tabular-nums text-fg-muted">
              {steps.length} {zh ? "步" : steps.length === 1 ? "step" : "steps"}
            </span>
          </div>

          <div className="relative mt-3 space-y-1">
            {steps.length > 1 ? <span className="absolute bottom-3 left-[7px] top-3 w-px bg-hairline" /> : null}
            {steps.map((step) => (
              <div key={step.id} className="relative flex min-h-8 items-start gap-2.5 py-1 text-xs">
                <span className="relative z-10 grid h-3.5 w-3.5 shrink-0 place-items-center bg-surface">
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
                {step.kind === "tool" ? <Wrench className="mt-1 h-3 w-3 shrink-0 text-fg-subtle" /> : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-fg-muted">
            {zh ? "只显示真实执行步骤，不展示内部推理。" : "Shows real execution steps, not private reasoning."}
          </p>
        </section>

        <section className="pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              {zh ? "结果" : "Results"}
            </p>
            {results.length > 0 ? (
              <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-bold text-positive">
                {results.length}
              </span>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="mt-3 space-y-2">
              {results.map((result) => (
                <div key={result.id} className="rounded-xl border border-hairline bg-surface-2/55 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                    <FileStack className="h-3.5 w-3.5 shrink-0 text-action" />
                    <span className="truncate">{result.label}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-4 text-[11px] leading-5 text-fg-muted">{result.summary}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-fg-muted">
              {zh ? "完成后的结论和产物会出现在这里。" : "Conclusions and outputs will appear here when ready."}
            </p>
          )}
        </section>
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
