"use client";

import { BarChart3, Lightbulb, Loader2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { ContentKit, IterationReport, PerformanceMetrics } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { getPlatform, type PlatformId } from "@/lib/platforms";

type GateReason = "copy" | "export" | "save" | "analyze" | "iterate";

type MetricField = "impressions" | "clicks" | "likes" | "comments" | "saves" | "shares" | "leads" | "signups" | "revenue";

type MetricValue = Record<MetricField, number>;

type MetricDraft = Partial<Record<PlatformId, MetricValue>>;

type PerformancePanelProps = {
  kit: ContentKit | null;
  locale: Locale;
  canAnalyze: boolean;
  onLockedAction?: (reason: GateReason) => void;
};

const EMPTY_METRIC: MetricValue = {
  impressions: 0,
  clicks: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  leads: 0,
  signups: 0,
  revenue: 0
};

const labels = {
  zh: {
    eyebrow: "Performance",
    title: "发布数据回流",
    subtitle: "先手动录入每个平台的结果，Finfold 会计算转化表现，并给下一轮内容提出迭代方向。",
    empty: "生成内容包后，这里会出现每个平台的数据录入口。",
    locked: "展示模式已开放发布数据录入、分析和下一轮迭代建议。",
    save: "保存数据",
    saved: "已保存",
    iterate: "生成迭代建议",
    ctr: "点击率",
    engagement: "互动率",
    leadRate: "线索率",
    best: "高潜力平台",
    suggestions: "迭代建议",
    impressions: "曝光",
    clicks: "点击",
    likes: "点赞",
    comments: "评论",
    saves: "收藏",
    shares: "转发",
    leads: "线索",
    signups: "注册",
    revenue: "收入"
  },
  en: {
    eyebrow: "Performance",
    title: "Performance Loop",
    subtitle: "Enter platform results manually first. Finfold calculates conversion signals and suggests the next iteration.",
    empty: "Generate a content kit first. Platform metric inputs will appear here.",
    locked: "Showcase mode opens publishing data entry, analysis, and next-iteration suggestions.",
    save: "Save data",
    saved: "Saved",
    iterate: "Generate iteration",
    ctr: "CTR",
    engagement: "Engagement",
    leadRate: "Lead rate",
    best: "Highest potential",
    suggestions: "Iteration suggestions",
    impressions: "Impressions",
    clicks: "Clicks",
    likes: "Likes",
    comments: "Comments",
    saves: "Saves",
    shares: "Shares",
    leads: "Leads",
    signups: "Signups",
    revenue: "Revenue"
  }
} as const;

const metricFields: MetricField[] = [
  "impressions",
  "clicks",
  "likes",
  "comments",
  "saves",
  "shares",
  "leads",
  "signups",
  "revenue"
];

export function PerformancePanel({ kit, locale, canAnalyze, onLockedAction }: PerformancePanelProps) {
  const copy = labels[locale];
  const [metrics, setMetrics] = useState<MetricDraft>({});
  const [savingPlatform, setSavingPlatform] = useState<PlatformId | null>(null);
  const [savedPlatform, setSavedPlatform] = useState<PlatformId | null>(null);
  const [isIterating, setIsIterating] = useState(false);
  const [report, setReport] = useState<IterationReport | null>(null);

  useEffect(() => {
    if (!kit?.id || kit.id === "preview" || kit.id === "showcase-kit") {
      setMetrics({});
      setReport(null);
      return;
    }

    let alive = true;
    fetch("/api/performance?kitId=" + encodeURIComponent(kit.id), { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { metrics: [] })
      .then((data: { metrics?: Array<PerformanceMetrics & { platform: PlatformId }> }) => {
        if (!alive) return;
        const next: MetricDraft = {};
        for (const metric of data.metrics ?? []) {
          next[metric.platform] = normalizeMetric(metric);
        }
        setMetrics(next);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [kit?.id]);

  const summary = useMemo(() => summarize(metrics), [metrics]);

  function updateMetric(platform: PlatformId, field: MetricField, value: string) {
    const numberValue = Number(value);
    setMetrics((current) => ({
      ...current,
      [platform]: {
        ...(current[platform] ?? EMPTY_METRIC),
        [field]: Number.isFinite(numberValue) ? Math.max(numberValue, 0) : 0
      }
    }));
  }

  async function saveMetric(platform: PlatformId) {
    if (!kit || !canAnalyze) {
      onLockedAction?.("analyze");
      return;
    }

    setSavingPlatform(platform);
    setSavedPlatform(null);
    try {
      await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: kit.id,
          metrics: { platform, ...(metrics[platform] ?? EMPTY_METRIC) }
        })
      });
    } catch {
      // Showcase mode still lets visitors explore local metric calculations.
    }
    setSavingPlatform(null);
    setSavedPlatform(platform);
    window.setTimeout(() => setSavedPlatform(null), 1500);
  }

  async function iterate() {
    if (!kit || !canAnalyze) {
      onLockedAction?.("iterate");
      return;
    }

    // Check if any metrics have been entered
    const hasData = Object.values(metrics).some((m) =>
      Object.values(m).some((v) => v > 0)
    );
    if (!hasData) {
      addToast(
        "warning",
        locale === "en"
          ? "Enter at least one metric before generating an iteration."
          : "请先录入至少一项数据（如曝光量）再生成迭代建议。"
      );
      return;
    }

    setIsIterating(true);
    const response = await fetch("/api/iterate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kitId: kit.id,
        ideaText: kit.ideaText,
        outputs: kit.outputs,
        metrics: Object.entries(metrics).map(([platform, metric]) => ({ platform, ...metric })),
        language: locale
      })
    });
    const data = (await response.json()) as { report?: IterationReport };
    setReport(data.report ?? null);
    setIsIterating(false);
  }

  return (
    <section className="panel rounded-md p-5 rk-enter rk-delay-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="tag tag-brand">{copy.eyebrow}</span>
          <h2 className="mt-3 text-2xl font-black">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-fg-muted">{kit ? copy.subtitle : copy.empty}</p>
        </div>
        <button
          type="button"
          onClick={() => void iterate()}
          disabled={!kit || isIterating}
          className="focus-ring btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {isIterating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4 text-brand" />}
          {copy.iterate}
        </button>
      </div>

      {!canAnalyze && kit ? (
        <p className="mt-4 rounded-sm border border-hairline bg-brand p-3 text-sm font-black text-white">{copy.locked}</p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <SummaryCard label={copy.ctr} value={formatRate(summary.ctr)} />
        <SummaryCard label={copy.engagement} value={formatRate(summary.engagement)} />
        <SummaryCard label={copy.leadRate} value={formatRate(summary.leadRate)} />
        <SummaryCard label={copy.best} value={summary.bestPlatform} icon />
      </div>

      {kit ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {kit.outputs.map((output) => {
            const platform = getPlatform(output.platform);
            const current = metrics[output.platform] ?? EMPTY_METRIC;
            return (
              <article key={output.platform} className="rounded-sm border border-hairline bg-surface p-4 shadow-panel">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-black">
                    <platform.icon className="h-4 w-4" />
                    {platform.label}
                  </div>
                  <span className="tag tag-neutral">{output.publishStatus ?? "draft"}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {metricFields.map((field) => (
                    <label key={field} className="grid gap-1 text-[11px] font-black uppercase text-fg-muted">
                      {copy[field]}
                      <input
                        type="number"
                        min="0"
                        value={current[field] ?? 0}
                        onChange={(event) => updateMetric(output.platform, field, event.target.value)}
                        className="focus-ring w-full rounded-sm border border-hairline bg-surface px-2 py-2 text-sm font-black text-fg tabular"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void saveMetric(output.platform)}
                  className="focus-ring btn-ghost mt-4 inline-flex w-full items-center justify-center gap-2 text-xs"
                >
                  {savingPlatform === output.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                  {savedPlatform === output.platform ? copy.saved : copy.save}
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      {report ? (
        <div className="mt-5 rounded-sm border border-hairline bg-surface p-4">
          <h3 className="text-lg font-black">{copy.suggestions}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-fg-muted">{report.summary}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ReportList title="Wins" items={report.wins} />
            <ReportList title="Problems" items={report.problems} />
            <ReportList title="Next" items={report.nextActions} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-sm border border-hairline bg-surface p-4 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase text-fg-muted">{label}</p>
        {icon ? <TrendingUp className="h-4 w-4 text-fg" /> : null}
      </div>
      <p className="mt-2 truncate text-2xl font-black tabular">{value}</p>
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-sm border border-hairline bg-surface-2 p-3">
      <p className="text-xs font-black uppercase text-fg-muted">{title}</p>
      <ul className="mt-2 grid gap-2 text-sm font-semibold leading-6">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function normalizeMetric(metric: Partial<PerformanceMetrics>): MetricValue {
  return {
    impressions: metric.impressions ?? 0,
    clicks: metric.clicks ?? 0,
    likes: metric.likes ?? 0,
    comments: metric.comments ?? 0,
    saves: metric.saves ?? 0,
    shares: metric.shares ?? 0,
    leads: metric.leads ?? 0,
    signups: metric.signups ?? 0,
    revenue: metric.revenue ?? 0
  };
}

function summarize(metrics: MetricDraft) {
  const entries = Object.entries(metrics) as Array<[PlatformId, MetricValue]>;
  const totals = entries.reduce(
    (sum, [, metric]) => ({
      impressions: sum.impressions + metric.impressions,
      clicks: sum.clicks + metric.clicks,
      engagement: sum.engagement + metric.likes + metric.comments + metric.saves + metric.shares,
      leads: sum.leads + metric.leads + metric.signups
    }),
    { impressions: 0, clicks: 0, engagement: 0, leads: 0 }
  );

  let bestPlatform = "-";
  let bestScore = -1;
  for (const [platform, metric] of entries) {
    const score = metric.clicks * 2 + metric.leads * 8 + metric.signups * 10 + metric.revenue;
    if (score > bestScore) {
      bestScore = score;
      bestPlatform = getPlatform(platform).label;
    }
  }

  return {
    ctr: safeRate(totals.clicks, totals.impressions),
    engagement: safeRate(totals.engagement, totals.impressions),
    leadRate: safeRate(totals.leads, totals.impressions),
    bestPlatform
  };
}

function safeRate(value: number, base: number) {
  return base > 0 ? value / base : 0;
}

function formatRate(value: number) {
  return (value * 100).toFixed(1) + "%";
}
