"use client";

import React from "react";
import { Database, ExternalLink, MessageSquare, Search, FileText, Upload } from "@/components/ui/icons";
import { ReportChart } from "@/components/report/ReportChart";
import { focusEvidenceRef } from "@/lib/report/evidence-nav";
import type { EvidencePayload, EvidenceSource } from "@/lib/report/chart-spec";

/**
 * EvidenceCard — the smallest unit of trust (设计方案 §3.3).
 *
 * One card per real data source captured during the run: source badge, the
 * strongest metrics, an optional inline chart, and expandable raw values.
 * Everything shown here comes from tool output, never from model prose.
 */

type EvidenceCardProps = {
  evidence: EvidencePayload;
  locale: "zh" | "en";
  highlight?: boolean;
};

const SOURCE_LABELS: Record<EvidenceSource, { zh: string; en: string; icon: typeof Database }> = {
  creator_analytics: { zh: "后台数据", en: "Analytics", icon: Database },
  public_profile: { zh: "公开主页", en: "Public profile", icon: ExternalLink },
  platform_notice: { zh: "平台通知", en: "Platform notice", icon: MessageSquare },
  platform_research: { zh: "平台调研", en: "Research", icon: Search },
  content_sample: { zh: "内容样本", en: "Post sample", icon: FileText },
  user_upload: { zh: "用户上传", en: "Uploaded", icon: Upload }
};

export function EvidenceCard({ evidence, locale, highlight = false }: EvidenceCardProps) {
  const zh = locale === "zh";
  const source = SOURCE_LABELS[evidence.source];
  const Icon = source.icon;
  const limitations = (zh ? evidence.limitationsZh : evidence.limitationsEn) ?? [];
  const asOf = zh ? `截至 ${formatCapturedAt(evidence.capturedAt, locale)}` : `As of ${formatCapturedAt(evidence.capturedAt, locale)}`;

  return (
    <article
      data-evidence-card={evidence.id}
      aria-label={zh ? evidence.titleZh : evidence.titleEn}
      className={`overflow-hidden rounded-xl border bg-surface transition-colors ${highlight ? "border-action/50 shadow-[0_0_0_2px_rgb(var(--action)/0.18)]" : "border-hairline hover:border-action/40"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-2.5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-fg-muted">
            <Icon className="h-3 w-3 text-action" />
            {source[locale]}
          </span>
          <p className="truncate text-xs font-bold leading-5 text-fg">
            {zh ? evidence.titleZh : evidence.titleEn}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {evidence.windowZh || evidence.windowEn ? (
            <span className="hidden text-[10px] font-semibold text-fg-subtle sm:inline">
              {zh ? evidence.windowZh : evidence.windowEn}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => focusEvidenceRef(evidence.id)}
            title={zh ? "回到引用处" : "Back to citation"}
            className="focus-ring inline-flex shrink-0 cursor-pointer items-center rounded-md bg-action/[0.1] px-1.5 py-0.5 font-mono text-[10px] font-black text-action transition hover:bg-action/20"
          >
            {evidence.id}
          </button>
        </div>
      </div>

      {evidence.metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 px-3.5 pb-3 sm:grid-cols-4">
          {evidence.metrics.map((metric) => (
            <div key={metric.labelEn} className="min-w-0 rounded-lg border border-hairline bg-surface-2/55 px-2.5 py-2">
              <p className="truncate text-base font-black leading-6 tracking-tight text-fg tabular-nums">
                {metric.value}
                {typeof metric.deltaPct === "number" && Number.isFinite(metric.deltaPct) ? (
                  <DeltaBadge deltaPct={metric.deltaPct} tone={metric.tone ?? "neutral"} />
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-4 text-fg-subtle">
                {zh ? metric.labelZh : metric.labelEn}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {evidence.chart ? (
        <div className="px-3.5 pb-3">
          <ReportChart spec={evidence.chart} locale={locale} />
        </div>
      ) : null}

      {evidence.rawPreview.length > 0 || limitations.length > 0 ? (
        <details className="group border-t border-hairline">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-fg-muted transition hover:text-fg [&::-webkit-details-marker]:hidden">
            <span>{zh ? "原始数据" : "Raw data"}</span>
            <span className="text-[9px] font-bold text-fg-subtle transition group-open:rotate-180">▾</span>
          </summary>
          <div className="space-y-2 px-3.5 pb-3">
            {evidence.rawPreview.length > 0 ? (
              <dl className="divide-y divide-hairline rounded-lg border border-hairline">
                {evidence.rawPreview.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                    <dt className="shrink-0 text-[10px] font-semibold text-fg-subtle">{row.key}</dt>
                    <dd className="min-w-0 truncate text-right text-[11px] font-semibold leading-4 text-fg-muted tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {limitations.length > 0 ? (
              <div className="rounded-lg border border-warn/25 bg-warn/[0.05] px-2.5 py-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-warn">
                  {zh ? "这个来源看不到什么" : "What this source can't show"}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-4 text-fg-muted">
                  {limitations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            <p className="text-right text-[10px] font-semibold text-fg-subtle">{asOf}</p>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function DeltaBadge({ deltaPct, tone }: { deltaPct: number; tone: "positive" | "negative" | "neutral" }) {
  const rounded = Math.round(deltaPct * 10) / 10;
  const arrow = rounded >= 0 ? "▲" : "▼";
  const display = `${rounded >= 0 ? "+" : ""}${rounded}%`;
  const toneClass = tone === "positive"
    ? "text-positive"
    : tone === "negative"
      ? "text-risk"
      : "text-fg-muted";
  return (
    <span className={`ml-1.5 align-middle font-mono text-[10px] font-black ${toneClass}`} aria-label={`${display} vs previous period`}>
      {arrow} {display}
    </span>
  );
}

function formatCapturedAt(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
