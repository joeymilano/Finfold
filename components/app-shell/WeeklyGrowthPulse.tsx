"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  DatabaseZap,
  Minus
} from "@/components/ui/icons";
import type {
  WeeklyGrowthReport,
  WeeklyMetricTrend
} from "@/lib/agent/weekly-growth-report";

type Props = {
  locale: "zh" | "en";
  variant?: "dark" | "panel";
  onAskAgent?: (prompt: string) => void;
};

export function WeeklyGrowthPulse({
  locale,
  variant = "panel",
  onAskAgent
}: Props) {
  const [report, setReport] = useState<WeeklyGrowthReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/agent/weekly-report?locale=${locale}`, {
          cache: "no-store"
        });
        const data = (await response.json().catch(() => ({}))) as {
          report?: WeeklyGrowthReport;
        };
        if (!cancelled && response.ok) setReport(data.report ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const isDark = variant === "dark";
  if (loading) {
    return (
      <div className={`${isDark ? "border-white/10 bg-black/20" : "panel"} mt-3 animate-pulse border p-4`}>
        <div className={`${isDark ? "bg-white/[0.07]" : "bg-surface-2"} h-3 w-40`} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={`${isDark ? "bg-white/[0.05]" : "bg-surface-2"} h-14`} />
          ))}
        </div>
      </div>
    );
  }
  if (!report) return null;

  if (report.mode === "insufficient") {
    return <InsufficientTrendNotice locale={locale} isDark={isDark} summary={report.summary} />;
  }

  const primary = report.anomalies[0] ?? null;
  const prompt = report.nextAction?.agentPrompt ?? (
    locale === "en"
      ? "Read my weekly growth report and explain the most important change."
      : "读取我的本周增长周报，解释最重要的变化。"
  );
  const shellClass = isDark
    ? "border-white/10 bg-[#080a0d] text-white"
    : "panel text-fg";
  const mutedClass = isDark ? "text-white/42" : "text-fg-muted";
  const metricBorder = isDark ? "border-white/[0.08]" : "border-hairline";

  return (
    <section className={`${shellClass} relative mt-3 overflow-hidden border`}>
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px ${
          primary?.severity === "critical"
            ? "bg-negative"
            : primary
              ? "bg-brand"
              : "bg-positive"
        }`}
      />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${primary ? "text-negative" : "text-positive"}`}>
                {primary ? <CircleAlert className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                {locale === "en" ? "Weekly growth pulse" : "本周增长脉搏"}
              </span>
              <span className={`font-mono text-[10px] ${mutedClass}`}>
                {report.platformLabel} · {report.comparisonLabel}
              </span>
            </div>
            <h2 className="mt-2 text-base font-black leading-snug sm:text-lg">{report.headline}</h2>
          </div>
          <span className={`border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
            primary?.severity === "critical"
              ? "border-negative/30 bg-negative/10 text-negative"
              : primary
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-positive/25 bg-positive/10 text-positive"
          }`}>
            {primary
              ? (primary.severity === "critical"
                  ? (locale === "en" ? "Critical shift" : "显著异常")
                  : (locale === "en" ? "Watch" : "需要关注"))
              : (locale === "en" ? "Stable" : "保持稳定")}
          </span>
        </div>

        <div className={`mt-4 grid grid-cols-2 border-l border-t sm:grid-cols-4 ${metricBorder}`}>
          {report.trends.map((trend) => (
            <MetricCell
              key={trend.key}
              trend={trend}
              locale={locale}
              isDark={isDark}
              borderClass={metricBorder}
            />
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <div>
            <p className={`text-xs leading-5 ${mutedClass}`}>{report.summary}</p>
            {report.nextAction ? (
              <p className={`mt-2 border-l-2 border-brand/45 pl-3 text-xs font-bold leading-5 ${isDark ? "text-white/68" : "text-fg"}`}>
                {report.nextAction.detail}
                <span className={`ml-1 font-mono text-[10px] ${mutedClass}`}>
                  [{report.nextAction.metric}]
                </span>
              </p>
            ) : null}
          </div>
          {onAskAgent ? (
            <button
              type="button"
              onClick={() => onAskAgent(prompt)}
              className="btn-primary w-full justify-center text-xs"
            >
              {locale === "en" ? "Investigate with Agent" : "让 Agent 调查"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link
              href={`/dashboard?prompt=${encodeURIComponent(prompt)}`}
              className="btn-primary w-full justify-center text-xs"
            >
              {locale === "en" ? "Investigate with Agent" : "让 Agent 调查"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function InsufficientTrendNotice({
  locale,
  isDark,
  summary
}: {
  locale: "zh" | "en";
  isDark: boolean;
  summary: string;
}) {
  // 说明类提示：默认展开，用户读过一次可折叠，并记住折叠偏好。
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("finfold-trend-baseline-collapsed-v1") === "1") {
        setOpen(false);
      }
    } catch {
      /* localStorage 不可用时静默，保持展开 */
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("finfold-trend-baseline-collapsed-v1", next ? "0" : "1");
      } catch {
        /* noop */
      }
      return next;
    });
  }

  const mutedClass = isDark ? "text-white/42" : "text-fg-muted";
  return (
    <section className={`${isDark ? "border-white/10 bg-black/20 text-white" : "panel text-fg"} mt-3 border p-4`}>
      <div className="flex items-start gap-3">
        <DatabaseZap className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? "text-white/35" : "text-fg-muted"}`} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"} ${isDark ? "text-white/40" : "text-fg-muted"}`} />
            <span className="text-xs font-black">
              {locale === "en" ? "Trend baseline is still forming" : "趋势基线仍在形成"}
            </span>
          </button>
          {open ? (
            <p className={`mt-1 pl-[22px] text-[11px] leading-5 ${mutedClass}`}>{summary}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MetricCell({
  trend,
  locale,
  isDark,
  borderClass
}: {
  trend: WeeklyMetricTrend;
  locale: "zh" | "en";
  isDark: boolean;
  borderClass: string;
}) {
  const directionClass = trend.direction === "down"
    ? "text-negative"
    : trend.direction === "up"
      ? "text-positive"
      : isDark
        ? "text-white/30"
        : "text-fg-muted";
  const icon = trend.direction === "down"
    ? <ArrowDownRight className="h-3.5 w-3.5" />
    : trend.direction === "up"
      ? <ArrowUpRight className="h-3.5 w-3.5" />
      : <Minus className="h-3.5 w-3.5" />;

  return (
    <div className={`border-b border-r p-3 ${borderClass}`}>
      <p className={`truncate text-[10px] font-bold ${isDark ? "text-white/35" : "text-fg-muted"}`}>{trend.label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <strong className="font-mono text-base font-black">{trend.currentDisplay}</strong>
        <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-bold ${directionClass}`}>
          {icon}
          {trend.changePercent === null
            ? "—"
            : `${trend.changePercent >= 0 ? "+" : ""}${trend.changePercent.toFixed(0)}%`}
        </span>
      </div>
      <p className={`mt-1 font-mono text-[9px] ${isDark ? "text-white/20" : "text-fg-muted/70"}`}>
        {locale === "en" ? "prev" : "前值"} {trend.previousDisplay}
      </p>
    </div>
  );
}
