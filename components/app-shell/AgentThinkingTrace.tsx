"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "@/components/ui/icons";
import type { AgentStatusEvent, AgentStatusStage } from "@/lib/agent/status";

const STATUS_COPY: Record<AgentStatusStage, { zh: string; en: string }> = {
  understanding_request: { zh: "理解你的目标", en: "Understanding your goal" },
  connecting_workspace: { zh: "连接当前工作区", en: "Connecting to this workspace" },
  preparing_context: { zh: "读取页面与品牌上下文", en: "Reading page and brand context" },
  choosing_capabilities: { zh: "判断需要调用的能力", en: "Choosing the right capabilities" },
  reviewing_results: { zh: "检查工具返回结果", en: "Reviewing tool results" },
  composing_response: { zh: "组织可执行的答复", en: "Composing an actionable response" }
};

export function getAgentStatusLabel(stage: AgentStatusStage, locale: "zh" | "en"): string {
  return STATUS_COPY[stage][locale];
}

export function AgentThinkingTrace({
  events,
  active,
  locale,
  tone = "surface"
}: {
  events: AgentStatusEvent[];
  active: boolean;
  locale: "zh" | "en";
  tone?: "surface" | "command";
}) {
  const [elapsed, setElapsed] = useState(0);
  const isCommand = tone === "command";
  const visibleEvents = events.slice(-5);
  const interrupted = !active && events.some((event) => !event.completed);
  const title = active
    ? (locale === "zh" ? "Finfold 正在工作" : "Finfold is working")
    : interrupted
      ? (locale === "zh" ? "Agent 工作已暂停" : "Agent work paused")
      : (locale === "zh" ? "查看 Agent 工作过程" : "View Agent activity");
  const elapsedLabel = locale === "zh" ? `${elapsed} 秒` : `${elapsed}s`;

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (events.length === 0) return null;

  const timeline = (
    <div className="relative mt-3 space-y-0.5 pl-1">
      <span className={`absolute bottom-2 left-[7px] top-2 w-px ${isCommand ? "bg-white/10" : "bg-hairline"}`} />
      {visibleEvents.map((event, index) => {
        const isCurrent = active && !event.completed;
        return (
          <div
            key={`${event.stage}-${index}`}
            className={`relative flex min-h-7 items-center gap-2.5 rounded-lg px-1.5 py-1 text-[11px] transition-colors ${isCurrent
              ? (isCommand ? "bg-action/10 text-white/90" : "bg-action/[0.075] text-fg")
              : (isCommand ? "text-white/45" : "text-fg-muted")}`}
          >
            <span className={`relative z-10 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${isCommand ? "bg-[#14171f]" : "bg-surface-2"}`}>
              {event.completed
                ? <CheckCircle2 className={`h-3.5 w-3.5 ${isCommand ? "text-action" : "text-positive"}`} />
                : active
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
                  : <span className="h-2 w-2 rounded-[2px] bg-warn" />}
            </span>
            <span className={isCurrent ? "font-bold" : "font-medium"}>{getAgentStatusLabel(event.stage, locale)}</span>
            {isCurrent ? (
              <span className={`ml-auto text-[9px] font-bold uppercase tracking-[0.12em] ${isCommand ? "text-action" : "text-action-strong dark:text-action"}`}>
                {locale === "zh" ? "进行中" : "Live"}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  if (!active) {
    return (
      <details className="group mb-3" aria-label={locale === "zh" ? "Agent 工作过程" : "Agent activity"}>
        <summary className={`focus-ring inline-flex cursor-pointer list-none items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition [&::-webkit-details-marker]:hidden ${isCommand
          ? "border-white/10 bg-black/15 text-white/45 hover:border-action/30 hover:text-white/70"
          : "border-hairline bg-surface/70 text-fg-muted hover:border-action/30"}`}>
          {interrupted
            ? <span className="h-2 w-2 rounded-[2px] bg-warn" />
            : <CheckCircle2 className={`h-3 w-3 ${isCommand ? "text-action" : "text-positive"}`} />}
          {title} · {events.length} {locale === "zh" ? "步" : events.length === 1 ? "step" : "steps"}
        </summary>
        {timeline}
      </details>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={locale === "zh" ? "Agent 工作过程" : "Agent activity"}
      className={`mb-3 overflow-hidden rounded-xl border p-3 ${isCommand
        ? "border-action/20 bg-black/20 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
        : "border-action/20 bg-[linear-gradient(145deg,rgb(var(--action)/0.08),rgb(var(--surface)/0.76)_48%,rgb(var(--brand)/0.055))] shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-lg ${isCommand ? "bg-action/12 text-action" : "bg-action/[0.1] text-action-strong dark:text-action"}`}>
          <span className="absolute inset-0 motion-safe:animate-ping rounded-lg border border-action/25 [animation-duration:2.2s]" />
          <Sparkles className="relative h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-extrabold tracking-tight ${isCommand ? "text-white/90" : "text-fg"}`}>{title}</p>
          <p className={`mt-0.5 text-[9px] font-medium ${isCommand ? "text-white/35" : "text-fg-subtle"}`}>
            {locale === "zh" ? "展示真实步骤，不展示内部推理" : "Showing real activity, not private reasoning"}
          </p>
        </div>
        <span className={`tabular rounded-full border px-2 py-0.5 text-[9px] font-semibold ${isCommand ? "border-white/10 text-white/40" : "border-hairline text-fg-subtle"}`}>{elapsedLabel}</span>
      </div>
      {timeline}
    </div>
  );
}
