"use client";

import React, { useId, useState } from "react";

export type AgentRunUsage = {
  /** Net credits charged for the run (refunds already subtracted). */
  credits: number;
  /** Successfully settled agent steps. */
  steps: number;
  /** Credits returned by refunds during the run. */
  refunded: number;
  /** Wall-clock start of the run. */
  startedAtMs: number;
  /** Total run duration. */
  durationMs: number;
  /** Last known balance; 0 with `insufficient` means the run was cut off. */
  available: number;
  /** True when the run was stopped because the balance ran out. */
  insufficient?: boolean;
};

const LOW_BALANCE_THRESHOLD = 20;

function formatClock(ms: number): string {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDuration(ms: number, locale: "zh" | "en"): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return locale === "zh" ? `${totalSeconds} 秒` : `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return locale === "zh"
    ? `${minutes} 分 ${seconds} 秒`
    : `${minutes}m ${seconds}s`;
}

/**
 * Copilot-style usage aside for one finished agent run. With
 * `revealOnMessageHover` (chat bubbles) the summary line is fully hidden
 * until the visitor hovers or focuses that chat message — the bubble's own
 * `group/msg` class drives `group-hover/msg:opacity-100`. Hovering the line
 * then expands time + spend details. Low-balance warnings stay visible
 * without interaction; touch devices (no hover) keep the line faintly
 * visible so it can be discovered. Never rendered while a run is still
 * streaming.
 */
export function AgentRunUsageHint({
  usage,
  locale,
  revealOnMessageHover = false
}: {
  usage: AgentRunUsage;
  locale: "zh" | "en";
  revealOnMessageHover?: boolean;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const zh = locale === "zh";
  const billingHref = zh ? "/billing" : "/en/billing";
  const insufficient = Boolean(usage.insufficient) || usage.available === 0;
  const lowBalance = !insufficient && usage.available > 0 && usage.available <= LOW_BALANCE_THRESHOLD;

  if (insufficient) {
    return (
      <div className="mt-1 flex items-center gap-2 pl-1">
        <span className="text-[11px] leading-none text-risk">
          {zh ? "创作点数不足" : "Out of Credits"}
        </span>
        <a
          href={billingHref}
          className="focus-ring rounded-full bg-risk px-2.5 py-1 text-[11px] font-semibold leading-none text-on-action"
        >
          {zh ? "去获取" : "Get more"}
        </a>
      </div>
    );
  }

  const tone = lowBalance ? "text-risk" : "text-fg-muted";
  // Chat bubbles hide the line entirely until the message itself is hovered
  // (`group/msg` on the bubble). Low-balance stays discoverable everywhere.
  const restingOpacity = lowBalance
    ? "opacity-75"
    : revealOnMessageHover
      ? "opacity-0 group-hover/msg:opacity-100 [@media(hover:none)]:opacity-75"
      : "opacity-45 [@media(hover:none)]:opacity-75";

  return (
    <div className="group relative mt-0.5 pl-1">
      <button
        type="button"
        aria-describedby={tooltipId}
        onClick={() => setOpen((value) => !value)}
        data-open={open ? "true" : "false"}
        className={`focus-ring flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[11px] leading-none transition-opacity duration-150 ${restingOpacity} hover:opacity-100 focus-visible:opacity-100 data-[open=true]:opacity-100`}
      >
        <span className={`h-[3px] w-[3px] rounded-full bg-current ${tone}`} aria-hidden="true" />
        <span className={tone}>
          {zh
            ? `${usage.credits} 创作点数 · ${formatClock(usage.startedAtMs)}`
            : `${usage.credits} ${usage.credits === 1 ? "Credit" : "Credits"} · ${formatClock(usage.startedAtMs)}`}
        </span>
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        hidden={!open}
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-lg border border-hairline bg-surface-100 p-3 opacity-0 shadow-raised transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
      >
        <p className="mb-1.5 text-xs font-semibold text-fg">{zh ? "本次对话" : "This run"}</p>
        <dl className="grid gap-0.5 text-xs leading-5">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">{zh ? "开始时间" : "Started"}</dt>
            <dd className="font-semibold text-fg">{formatClock(usage.startedAtMs)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">{zh ? "时长" : "Duration"}</dt>
            <dd className="font-semibold text-fg">{formatDuration(usage.durationMs, locale)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-fg-muted">{zh ? "消耗" : "Spent"}</dt>
            <dd className="font-semibold text-fg">
              {zh
                ? `${usage.credits} 创作点数 · ${usage.steps} 步`
                : `${usage.credits} ${usage.credits === 1 ? "Credit" : "Credits"} · ${usage.steps} ${usage.steps === 1 ? "step" : "steps"}`}
            </dd>
          </div>
          {usage.refunded > 0 ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-fg-muted">{zh ? "已退还" : "Refunded"}</dt>
              <dd className="font-semibold text-fg-muted">{usage.refunded}</dd>
            </div>
          ) : null}
          {usage.available >= 0 ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-fg-muted">{zh ? "剩余" : "Left"}</dt>
              <dd className={`font-semibold ${lowBalance ? "text-risk" : "text-fg"}`}>
                {zh
                  ? `${usage.available} 创作点数`
                  : `${usage.available} ${usage.available === 1 ? "Credit" : "Credits"}`}
              </dd>
            </div>
          ) : null}
        </dl>
        {lowBalance ? (
          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-dashed border-hairline pt-1.5 text-xs">
            <span className="text-risk">{zh ? "余额不多" : "Running low"}</span>
            <a href={billingHref} className="focus-ring rounded font-semibold text-fg underline underline-offset-2">
              {zh ? "去获取创作点数" : "Get more Credits"}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
