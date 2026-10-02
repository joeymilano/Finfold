"use client";

import React from "react";
import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "@/components/ui/icons";

/**
 * AgentStepTimeline — the analysis process made visible (设计方案 §3.2).
 *
 * Translates internal tool events into user-language steps so the chat shows
 * what the Agent actually did. Internal tool names never render in the UI.
 */

export type AgentStepTimelineEvent = {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  completed?: boolean;
  startedAt?: number;
  completedAt?: number;
};

type AgentStepTimelineProps = {
  events: AgentStepTimelineEvent[];
  locale: "zh" | "en";
  active: boolean;
};

const STEP_PHRASES: Record<string, { zh: string; en: string }> = {
  analyze_account_performance: { zh: "读取账号表现数据", en: "Reading account performance" },
  get_weekly_growth_report: { zh: "对比本周与上周", en: "Comparing this week to last" },
  investigate_social_account: { zh: "检查主页可见性", en: "Checking public profile" },
  run_evidence_research: { zh: "调研平台规则与案例", en: "Researching platform rules" },
  analyze_content_readiness: { zh: "检查内容草稿", en: "Reviewing content drafts" },
  diagnose_xiaohongshu: { zh: "诊断小红书账号", en: "Diagnosing Xiaohongshu account" },
  ask_user: { zh: "等你选择", en: "Asking you" },
  rewrite_text: { zh: "改写文案", en: "Rewriting copy" }
};

const FALLBACK_PHRASE = { zh: "执行了一步分析", en: "Ran an analysis step" } as const;

export function getAgentStepPhrase(name: string, locale: "zh" | "en"): string {
  const phrase = STEP_PHRASES[name];
  return phrase ? phrase[locale] : FALLBACK_PHRASE[locale];
}

type StepStatus = "running" | "done" | "insufficient" | "failed" | "paused";

function stepStatus(event: AgentStepTimelineEvent, active: boolean): StepStatus {
  const result = event.result;
  const resultObject = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : null;
  if (event.completed) {
    if (resultObject && typeof resultObject.error === "string" && resultObject.error) return "failed";
    if (
      resultObject?.needsDraft === true
      || (resultObject && typeof resultObject.report === "object" && resultObject.report !== null
        && (resultObject.report as Record<string, unknown>).mode === "insufficient")
    ) {
      return "insufficient";
    }
    return "done";
  }
  return active ? "running" : "paused";
}

export function AgentStepTimeline({ events, locale, active }: AgentStepTimelineProps) {
  const zh = locale === "zh";
  if (events.length === 0) return null;
  return (
    <ol aria-label={zh ? "分析过程" : "Analysis steps"} className="mt-2 space-y-1.5">
      {events.map((event, index) => {
        const status = stepStatus(event, active);
        const duration = event.startedAt && event.completedAt
          ? `${Math.max(0.1, (event.completedAt - event.startedAt) / 1000).toFixed(1)}s`
          : null;
        const failure = status === "failed"
          ? String((event.result as Record<string, unknown> | null)?.error ?? "").slice(0, 80)
          : null;
        return (
          <li
            key={`${event.name}-${index}`}
            className="flex items-start gap-2 border-l border-hairline pl-3 text-[11px] leading-5"
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {status === "running"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
                : status === "done"
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                  : status === "insufficient"
                    ? <TriangleAlert className="h-3.5 w-3.5 text-warn" />
                    : status === "failed"
                      ? <XCircle className="h-3.5 w-3.5 text-risk" />
                      : <TriangleAlert className="h-3.5 w-3.5 text-warn" />}
            </span>
            <span className={`min-w-0 flex-1 font-semibold ${status === "failed" ? "text-risk" : "text-fg-muted"}`}>
              {getAgentStepPhrase(event.name, locale)}
              {duration ? (
                <span className="ml-1.5 font-mono text-[10px] font-bold text-fg-subtle tabular-nums">
                  {duration}
                </span>
              ) : null}
              {failure ? (
                <span className="mt-0.5 block text-[10px] font-semibold leading-4 text-risk">{failure}</span>
              ) : null}
              {status === "paused" ? (
                <span className="ml-1.5 text-[10px] font-semibold text-warn">
                  {zh ? "分析已暂停，可继续" : "Paused — you can continue"}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
