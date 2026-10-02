"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleGauge, Loader2, Sparkles } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import type { ContentReadinessReport } from "@/lib/content-readiness";

type Props = {
  report: ContentReadinessReport;
  locale: Locale;
  onImprove: () => void;
  isImproving?: boolean;
};

export function ContentReadinessCard({ report, locale, onImprove, isImproving = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isReady = report.status === "ready";
  const isBlocked = report.status === "blocked";
  const tone = isReady
    ? "border-positive/25 bg-positive/[0.055]"
    : isBlocked
      ? "border-risk/25 bg-risk/[0.05]"
      : "border-warn/25 bg-warn/[0.055]";
  const scoreTone = isReady ? "text-positive" : isBlocked ? "text-risk" : "text-warn";
  const publishabilityTone = report.publishability.status === "ready"
    ? "border-positive/25 bg-positive/10 text-positive"
    : report.publishability.status === "platform-risk"
      ? "border-risk/25 bg-risk/10 text-risk"
      : "border-warn/25 bg-warn/10 text-warn";

  return (
    <section className={`mb-4 overflow-hidden rounded-xl border ${tone}`}>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface shadow-sm ${scoreTone}`}>
            {isReady ? <CheckCircle2 className="h-4 w-4" /> : isBlocked ? <AlertTriangle className="h-4 w-4" /> : <CircleGauge className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-fg">{locale === "zh" ? "发布前质量判断" : "Pre-publish quality gate"}</p>
              <span className={`rounded-full bg-surface px-2 py-0.5 text-[10px] font-black ${scoreTone}`}>{report.score}/100</span>
              <span className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[9px] font-bold text-fg-muted">{report.skillPlan.name}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${publishabilityTone}`}>{report.publishability.label}</span>
            </div>
            <p className="mt-1 text-[11px] font-bold text-fg">{report.headline}</p>
            <p className="mt-1 max-w-2xl text-[10px] leading-4 text-fg-muted">{report.publishability.summary}</p>
            <p className="mt-1 max-w-2xl text-[10px] leading-4 text-fg-muted">
              {report.primaryBlocker.reason} · {report.primaryBlocker.action}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-brand">
              <Sparkles className="h-3 w-3" />
              {locale === "zh" ? `本轮目标：${report.skillPlan.outcome}` : `This run: ${report.skillPlan.outcome}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
          <button type="button" onClick={() => setExpanded((value) => !value)} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-bold text-fg-muted hover:bg-surface hover:text-fg" aria-expanded={expanded}>
            {locale === "zh" ? "看判断" : "Inspect"}
            <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onImprove}
            disabled={isImproving}
            className="btn-primary focus-ring px-3 py-2 text-xs disabled:cursor-wait disabled:opacity-70"
          >
            {isImproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isImproving
              ? (locale === "zh" ? "优化中…" : "Improving…")
              : isReady
                ? (locale === "zh" ? "打开交付包" : "Open package")
                : (locale === "zh" ? "按建议优化" : "Improve now")}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-current/10 bg-surface/45 p-3">
          {report.publishability.findings.length > 0 ? (
            <ul className="mb-3 grid gap-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-[10px] leading-4 text-fg-muted">
              {report.publishability.findings.map((finding) => <li key={finding}>• {finding}</li>)}
            </ul>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-lg border border-hairline bg-surface px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-fg">{dimension.label}</span>
                  <span className={`text-[10px] font-black ${dimension.score >= 75 ? "text-positive" : dimension.score < 45 ? "text-risk" : "text-warn"}`}>{dimension.score}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-current text-brand" style={{ width: `${dimension.score}%` }} />
                </div>
                <p className="mt-1.5 text-[9px] leading-4 text-fg-muted">{dimension.action}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
