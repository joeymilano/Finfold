"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "@/components/ui/icons";
import type { AgentStatusEvent, AgentStatusStage } from "@/lib/agent/status";
import {
  AgentStepTimeline,
  type AgentStepTimelineEvent
} from "@/components/report/AgentStepTimeline";

const STATUS_COPY: Record<AgentStatusStage, { zh: string; en: string }> = {
  understanding_request: { zh: "理解你的目标", en: "Understanding your goal" },
  connecting_workspace: { zh: "连接当前工作区", en: "Connecting to this workspace" },
  preparing_context: { zh: "读取页面与品牌上下文", en: "Reading page and brand context" },
  choosing_capabilities: { zh: "判断需要调用的能力", en: "Choosing the right capabilities" },
  reviewing_results: { zh: "核对执行结果", en: "Verifying results" },
  composing_response: { zh: "准备回复", en: "Preparing the reply" }
};

export function getAgentStatusLabel(stage: AgentStatusStage, locale: "zh" | "en"): string {
  return STATUS_COPY[stage][locale];
}

export function AgentThinkingTrace({
  events,
  active,
  locale,
  tone = "surface",
  steps
}: {
  events: AgentStatusEvent[];
  active: boolean;
  locale: "zh" | "en";
  tone?: "surface" | "command";
  steps?: AgentStepTimelineEvent[];
}) {
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const isCommand = tone === "command";
  const hasSteps = Boolean(steps && steps.length > 0);
  const stepsDone = hasSteps && steps!.every((step) => step.completed);
  const stepsInterrupted = hasSteps && !active && steps!.some((step) => !step.completed);
  const interrupted = !active && (events.some((event) => !event.completed) || stepsInterrupted);
  const currentEvent = [...events].reverse().find((event) => !event.completed) ?? events.at(-1);
  const stepDurationSeconds = stepsDurationLabel(steps, elapsed);
  const elapsedLabel = locale === "zh" ? `${elapsed} 秒` : `${elapsed}s`;
  const doneCount = steps ? steps.filter((step) => step.completed).length : 0;

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (events.length === 0 && !hasSteps) return null;
  // Once the run completes, the pill becomes the collapsed summary of the work:
  // “Analyzed N data sources in Ts” — expandable to the full step timeline.
  if (!active && !interrupted && !hasSteps) return null;

  const summaryLabel = active && currentEvent
    ? getAgentStatusLabel(currentEvent.stage, locale)
    : interrupted
      ? (locale === "zh" ? "Finfold智能体工作已暂停" : "Agent work paused")
      : locale === "zh"
        ? `分析了 ${doneCount} 项数据 · 用时 ${stepDurationSeconds} 秒`
        : `Analyzed ${doneCount} data sources in ${stepDurationSeconds}s`;
  const pillClasses = `group/trace inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${isCommand
    ? "border-white/10 bg-black/15 text-white/65"
    : "border-hairline bg-surface-2/70 text-fg-muted"} ${hasSteps ? "cursor-pointer hover:border-action/40" : ""}`;
  const inner = (
    <>
      {active
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-action" />
        : <span className={`h-2 w-2 shrink-0 rounded-[2px] ${interrupted ? "bg-warn" : "bg-positive"}`} />}
      <span className="truncate font-semibold">{summaryLabel}</span>
      {active && !hasSteps ? <span className="shrink-0 tabular-nums text-[10px] text-fg-subtle">{elapsedLabel}</span> : null}
      {hasSteps ? (
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <div className="mb-3">
      {hasSteps ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={locale === "zh" ? "查看过程" : "View steps"}
          className={`focus-ring ${pillClasses}`}
        >
          {inner}
        </button>
      ) : (
        <div role="status" aria-live="polite" aria-label={locale === "zh" ? "Finfold智能体工作过程" : "Agent activity"} className={pillClasses}>
          {inner}
        </div>
      )}
      {hasSteps && open && steps ? (
        <AgentStepTimeline events={steps} locale={locale} active={active} />
      ) : null}
    </div>
  );
}

function stepsDurationLabel(steps: AgentStepTimelineEvent[] | undefined, fallbackElapsedSeconds: number): string {
  if (!steps || steps.length === 0) return String(fallbackElapsedSeconds);
  const startedAt = steps.find((step) => typeof step.startedAt === "number")?.startedAt;
  const lastCompletedAt = Math.max(0, ...steps.map((step) => step.completedAt ?? 0));
  if (typeof startedAt !== "number" || lastCompletedAt < startedAt) return String(fallbackElapsedSeconds);
  return String(Math.max(1, Math.round((lastCompletedAt - startedAt) / 1000)));
}
