"use client";

import React from "react";
import { CheckCircle2, CircleDotDashed } from "@/components/ui/icons";
import {
  summarizeCollaboration,
  type CollaborationViewState
} from "@/lib/agent/collaboration-ui";

/**
 * One-line collaboration status, shown only when subagents actually ran.
 * Sits directly under AgentThinkingTrace and opens the existing Work Panel —
 * never a new surface. Announced politely only when a group finishes or
 * partially fails; the running counter is visual-only.
 */
export function AgentCollaborationStrip({
  view,
  locale,
  onClick
}: {
  view: CollaborationViewState;
  locale: "zh" | "en";
  onClick?: () => void;
}) {
  const summary = summarizeCollaboration(view);
  if (!summary) return null;
  const zh = locale === "zh";
  const finished = summary.tone !== "running";

  const label = zh ? summary.labelZh : summary.labelEn;
  const accessibleLabel = summary.tone === "running"
    ? (zh
      ? `${label}，已完成 ${summary.doneCount} / ${summary.totalCount}`
      : `${label}, ${summary.doneCount} of ${summary.totalCount} done`)
    : label;

  const content = (
    <>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {summary.tone === "running" ? (
          // Three quiet dots — a slow shared pulse, no strobe.
          <span className="flex items-center gap-[3px] motion-reduce:animate-none">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-1.5 w-1.5 rounded-full bg-action/80 animate-pulse motion-reduce:animate-none"
                style={{ animationDelay: `${index * 180}ms` }}
              />
            ))}
          </span>
        ) : summary.tone === "complete" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-positive transition-opacity duration-200 motion-reduce:transition-none" />
        ) : (
          <CircleDotDashed className="h-3.5 w-3.5 text-warn" />
        )}
      </span>
      <span className="truncate font-semibold">{label}</span>
      {summary.tone === "running" ? (
        <span className="shrink-0 tabular-nums text-[10px] text-fg-subtle">
          {summary.doneCount}/{summary.totalCount}
        </span>
      ) : null}
      {onClick ? <span className="shrink-0 text-[11px] text-fg-subtle" aria-hidden="true">›</span> : null}
    </>
  );

  const className = `mb-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-surface-2/70 px-3 py-1.5 text-[11px] text-fg-muted transition-colors duration-200 motion-reduce:transition-none ${onClick ? "cursor-pointer hover:border-faint hover:text-fg focus-ring" : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-label={zh ? `${accessibleLabel}，查看协作详情` : `${accessibleLabel}, view collaboration details`}
        {...(finished ? { "aria-live": "polite" as const } : {})}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} aria-label={accessibleLabel} {...(finished ? { "aria-live": "polite" as const } : {})}>
      {content}
    </div>
  );
}
