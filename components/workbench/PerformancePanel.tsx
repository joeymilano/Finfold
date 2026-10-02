"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, ClipboardPaste, Lightbulb, Loader2, Target, TrendingUp } from "@/components/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { addToast } from "@/components/ui/Toast";
import { captureEvent } from "@/lib/posthog";
import type { ContentKit, IterationReport, PerformanceMetrics, PerformanceSource } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { getPlatform, type PlatformId } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { GrowthMission } from "@/lib/agent/growth-missions";

type GateReason = "copy" | "export" | "save" | "analyze" | "iterate";

type MetricField =
  | "impressions"
  | "views"
  | "clicks"
  | "coverClickRate"
  | "averageViewSeconds"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "followerGrowth"
  | "profileVisits"
  | "leads"
  | "signups"
  | "revenue";

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
  views: 0,
  clicks: 0,
  coverClickRate: 0,
  averageViewSeconds: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  followerGrowth: 0,
  profileVisits: 0,
  leads: 0,
  signups: 0,
  revenue: 0
};

const labels = {
  zh: {
    eyebrow: "表现数据",
    title: "发布数据回流",
    subtitle: "公开平台填入发布链接后可自动回采；没有开放接口的平台可粘贴创作后台数据，Finfold 会据此给出下一轮方向",
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
    views: "观看",
    clicks: "点击",
    coverClickRate: "封面点击率 %",
    averageViewSeconds: "平均观看 秒",
    likes: "点赞",
    comments: "评论",
    saves: "收藏",
    shares: "转发",
    followerGrowth: "涨粉",
    profileVisits: "主页访客",
    leads: "线索",
    signups: "注册",
    revenue: "收入",
    wins: "有效信号",
    problems: "问题",
    next: "下一步",
    sampleBadge: "示例数据（不会保存）",
    sampleSaveNote: "示例模式：数据仅保存在本页",
    sampleImportNote: "示例模式不支持粘贴导入",
    publishedUrl: "发布链接",
    publishedUrlPlaceholder: "https://...",
    pasteImport: "粘贴导入",
    extract: "识别",
    cancel: "取消",
    pastePlaceholder: "粘贴平台后台的统计数据文本，例如「阅读量 1.2万 在看 45 点赞 230 留言 18」",
    pasteEmptyWarning: "请先粘贴文本再识别。",
    aiImportTag: "AI 导入",
    autoTag: "自动",
    pendingMeasurement: "已发布，待回填数据",
    today: "今天",
    daysAgo: (n: number) => `上次记录：${n} 天前`,
    history: "历史迭代报告",
    loadFailed: "加载已保存数据失败。",
    saveFailed: "保存失败。",
    importFailed: "导入失败。",
    adopt: "采纳",
    adopted: "已采纳",
    adoptFailed: "采纳失败。"
  },
  en: {
    eyebrow: "Performance",
    title: "Performance Loop",
    subtitle: "Add a post URL for supported public platforms, or paste creator-dashboard data elsewhere. Finfold turns real results into the next iteration.",
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
    views: "Views",
    clicks: "Clicks",
    coverClickRate: "Cover CTR %",
    averageViewSeconds: "Avg view sec",
    likes: "Likes",
    comments: "Comments",
    saves: "Saves",
    shares: "Shares",
    followerGrowth: "Followers",
    profileVisits: "Profile visits",
    leads: "Leads",
    signups: "Signups",
    revenue: "Revenue",
    wins: "Wins",
    problems: "Problems",
    next: "Next",
    sampleBadge: "Sample data (not saved)",
    sampleSaveNote: "Demo mode: data stays on this page",
    sampleImportNote: "Paste import isn't available in demo mode",
    publishedUrl: "Published URL",
    publishedUrlPlaceholder: "https://...",
    pasteImport: "Paste import",
    extract: "Extract",
    cancel: "Cancel",
    pastePlaceholder: "Paste the stats text copied from the platform's dashboard, e.g. \"1.2K views, 45 likes, 18 comments\"",
    pasteEmptyWarning: "Paste some text before extracting.",
    aiImportTag: "AI import",
    autoTag: "Auto",
    pendingMeasurement: "Published — awaiting metrics",
    today: "today",
    daysAgo: (n: number) => `Last recorded ${n}d ago`,
    history: "Report history",
    loadFailed: "Failed to load saved metrics.",
    saveFailed: "Failed to save.",
    importFailed: "Import failed.",
    adopt: "Adopt",
    adopted: "Adopted",
    adoptFailed: "Failed to adopt."
  }
} as const;

const metricFields: MetricField[] = [
  "impressions",
  "views",
  "clicks",
  "coverClickRate",
  "averageViewSeconds",
  "likes",
  "comments",
  "saves",
  "shares",
  "followerGrowth",
  "profileVisits",
  "leads",
  "signups",
  "revenue"
];

const defaultMetricFields: MetricField[] = [
  "impressions",
  "views",
  "clicks",
  "likes",
  "comments",
  "saves",
  "shares",
  "followerGrowth",
  "leads",
  "signups",
  "revenue"
];

const xiaohongshuMetricFields: MetricField[] = [
  "impressions",
  "views",
  "coverClickRate",
  "averageViewSeconds",
  "likes",
  "comments",
  "saves",
  "shares",
  "followerGrowth",
  "profileVisits",
  "leads",
  "signups",
  "revenue"
];

function isMetricField(value: string): value is MetricField {
  return (metricFields as string[]).includes(value);
}

function isShowcaseKitId(kitId: string | undefined | null): boolean {
  return kitId === "preview" || kitId === "showcase-kit";
}

export function PerformancePanel({ kit, locale, canAnalyze, onLockedAction }: PerformancePanelProps) {
  const copy = labels[locale];
  const isShowcaseKit = isShowcaseKitId(kit?.id);

  const [metrics, setMetrics] = useState<MetricDraft>({});
  const [publishedUrls, setPublishedUrls] = useState<Partial<Record<PlatformId, string>>>({});
  const [measuredAt, setMeasuredAt] = useState<Partial<Record<PlatformId, string>>>({});
  const [sources, setSources] = useState<Partial<Record<PlatformId, PerformanceSource>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [missionResult, setMissionResult] = useState<GrowthMission | null>(null);

  const [savingPlatform, setSavingPlatform] = useState<PlatformId | null>(null);
  const [savedPlatform, setSavedPlatform] = useState<PlatformId | null>(null);
  const [highlightedPlatform, setHighlightedPlatform] = useState<PlatformId | null>(null);

  const [importOpenPlatform, setImportOpenPlatform] = useState<PlatformId | null>(null);
  const [importText, setImportText] = useState("");
  const [importingPlatform, setImportingPlatform] = useState<PlatformId | null>(null);

  const [isIterating, setIsIterating] = useState(false);
  const [report, setReport] = useState<IterationReport | null>(null);
  const [reportHistory, setReportHistory] = useState<IterationReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [adoptedActions, setAdoptedActions] = useState<Set<string>>(new Set());
  const [adoptingAction, setAdoptingAction] = useState<string | null>(null);

  useEffect(() => {
    setMetrics({});
    setPublishedUrls(Object.fromEntries(
      (kit?.outputs ?? [])
        .filter((output) => Boolean(output.publishedUrl))
        .map((output) => [output.platform, output.publishedUrl!])
    ));
    setMeasuredAt({});
    setSources({});
    setReport(null);
    setReportHistory([]);
    setLoadError(null);
    setMissionResult(null);

    if (!kit?.id || isShowcaseKitId(kit.id)) {
      return;
    }

    let alive = true;
    setIsLoadingMetrics(true);

    const missionRequest = kit.growthMissionId
      ? fetch(`/api/agent/missions/${encodeURIComponent(kit.growthMissionId)}`, { cache: "no-store" }).catch(() => null)
      : Promise.resolve(null);

    Promise.all([
      fetch("/api/performance?kitId=" + encodeURIComponent(kit.id), { cache: "no-store" }),
      fetch("/api/iterate?kitId=" + encodeURIComponent(kit.id), { cache: "no-store" }),
      missionRequest
    ])
      .then(async ([perfResponse, iterResponse, missionResponse]) => {
        if (!alive) return;

        if (!perfResponse.ok) {
          const data = (await perfResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || copy.loadFailed);
        }
        const perfData = (await perfResponse.json()) as { metrics?: Array<PerformanceMetrics & { platform: PlatformId }> };

        const nextMetrics: MetricDraft = {};
        const nextUrls: Partial<Record<PlatformId, string>> = {};
        const nextMeasured: Partial<Record<PlatformId, string>> = {};
        const nextSources: Partial<Record<PlatformId, PerformanceSource>> = {};
        for (const metric of perfData.metrics ?? []) {
          nextMetrics[metric.platform] = normalizeMetric(metric);
          if (metric.publishedUrl) nextUrls[metric.platform] = metric.publishedUrl;
          if (metric.measuredAt) nextMeasured[metric.platform] = metric.measuredAt;
          nextSources[metric.platform] = metric.source ?? "manual";
        }
        if (!alive) return;
        setMetrics(nextMetrics);
        setPublishedUrls((current) => ({ ...current, ...nextUrls }));
        setMeasuredAt(nextMeasured);
        setSources(nextSources);

        if (iterResponse.ok) {
          const iterData = (await iterResponse.json()) as { reports?: IterationReport[] };
          const history = iterData.reports ?? [];
          if (!alive) return;
          setReportHistory(history);
          setReport(history[0] ?? null);
        }
        if (missionResponse?.ok) {
          const missionData = (await missionResponse.json().catch(() => ({}))) as { mission?: GrowthMission };
          if (missionData.mission?.status === "completed") {
            setMissionResult(missionData.mission);
          }
        }
      })
      .catch((error) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : copy.loadFailed;
        setLoadError(message);
        addToast("error", message);
      })
      .finally(() => {
        if (alive) setIsLoadingMetrics(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.id]);

  const summary = useMemo(() => summarize(metrics), [metrics]);

  function updateMetric(platform: PlatformId, field: MetricField, value: string) {
    const numberValue = Number(value);
    setMetrics((current) => ({
      ...current,
      [platform]: {
        ...(current[platform] ?? EMPTY_METRIC),
        [field]: Number.isFinite(numberValue)
          ? field === "followerGrowth"
            ? numberValue
            : Math.max(numberValue, 0)
          : 0
      }
    }));
  }

  async function saveMetric(platform: PlatformId) {
    if (!kit || !canAnalyze) {
      onLockedAction?.("analyze");
      return;
    }

    if (isShowcaseKit) {
      setSavedPlatform(platform);
      addToast("info", copy.sampleSaveNote);
      window.setTimeout(() => setSavedPlatform(null), 1500);
      return;
    }

    setSavingPlatform(platform);
    setSavedPlatform(null);
    try {
      const response = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: kit.id,
          metrics: {
            platform,
            ...(metrics[platform] ?? EMPTY_METRIC),
            publishedUrl: publishedUrls[platform] ?? "",
            source: sources[platform] ?? "manual"
          }
        })
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        mission?: GrowthMission | null;
      };
      if (!response.ok) {
        throw new Error(data.error || copy.saveFailed);
      }
      setMeasuredAt((current) => ({ ...current, [platform]: new Date().toISOString() }));
      setSavedPlatform(platform);
      if (data.mission?.status === "completed") {
        setMissionResult(data.mission);
      }
      captureEvent("performance_saved", {
        platform,
        source: sources[platform] ?? "manual",
        hasBusinessOutcome: ((metrics[platform]?.leads ?? 0) + (metrics[platform]?.signups ?? 0) + (metrics[platform]?.revenue ?? 0)) > 0
      });
      addToast(
        "success",
        data.mission?.status === "completed"
          ? locale === "en"
            ? `Mission evaluated: ${missionVerdictLabel(data.mission.verdict, locale)}`
            : `任务已自动判定：${missionVerdictLabel(data.mission.verdict, locale)}`
          : copy.saved
      );
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.saveFailed);
    }
    setSavingPlatform(null);
    window.setTimeout(() => setSavedPlatform(null), 1500);
  }

  async function importMetrics(platform: PlatformId) {
    if (!kit || !canAnalyze) {
      onLockedAction?.("analyze");
      return;
    }
    if (isShowcaseKit) {
      addToast("info", copy.sampleImportNote);
      return;
    }
    const pastedText = importText.trim();
    if (!pastedText) {
      addToast("warning", copy.pasteEmptyWarning);
      return;
    }

    setImportingPlatform(platform);
    try {
      const response = await fetch("/api/performance/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ kitId: kit.id, platform, pastedText })
      });
      const data = (await response.json()) as {
        metrics?: MetricValue;
        found?: string[];
        notes?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || copy.importFailed);
      }

      const found = (data.found ?? []).filter(isMetricField);
      if (found.length > 0 && data.metrics) {
        setMetrics((current) => {
          const merged = { ...(current[platform] ?? EMPTY_METRIC) };
          for (const field of found) {
            merged[field] = data.metrics![field];
          }
          return { ...current, [platform]: merged };
        });
        setSources((current) => ({ ...current, [platform]: "import" }));
        setHighlightedPlatform(platform);
        window.setTimeout(() => setHighlightedPlatform(null), 2500);
      }

      addToast("success", data.notes || copy.saved);
      setImportOpenPlatform(null);
      setImportText("");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.importFailed);
    }
    setImportingPlatform(null);
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
    try {
      const response = await fetch("/api/iterate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          kitId: kit.id,
          ideaText: kit.ideaText,
          outputs: kit.outputs,
          metrics: Object.entries(metrics).map(([platform, metric]) => ({ platform, ...metric })),
          language: locale
        })
      });
      const data = (await response.json()) as { report?: IterationReport; error?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || copy.saveFailed);
      }
      setReport(data.report);
      setReportHistory((current) => [data.report as IterationReport, ...current]);
      captureEvent("iteration_generated", { platformCount: Object.keys(metrics).length });
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.saveFailed);
    }
    setIsIterating(false);
  }

  async function adoptAction(reportId: string, actionText: string) {
    setAdoptingAction(actionText);
    try {
      const response = await fetch("/api/iterate/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, actionText })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || copy.adoptFailed);
      }
      setAdoptedActions((current) => new Set(current).add(actionText));
      captureEvent("iteration_rule_adopted");
      addToast("success", copy.adopted);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : copy.adoptFailed);
    }
    setAdoptingAction(null);
  }

  return (
    <section className="panel rounded-md p-4 sm:p-5 rk-enter rk-delay-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag tag-brand">{copy.eyebrow}</span>
            {isShowcaseKit && kit ? <span className="tag tag-neutral">{copy.sampleBadge}</span> : null}
          </div>
          <h2 className="mt-3 text-2xl font-black">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-fg-muted">{kit ? copy.subtitle : copy.empty}</p>
        </div>
        <button
          type="button"
          onClick={() => void iterate()}
          disabled={!kit || isIterating}
          className="focus-ring btn-primary inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {isIterating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
          {copy.iterate}
        </button>
      </div>

      {!canAnalyze && kit ? (
        <p className="mt-4 rounded-sm border border-hairline bg-brand p-3 text-sm font-black text-white">{copy.locked}</p>
      ) : null}

      {loadError ? (
        <p className="mt-4 rounded-sm border border-hairline bg-risk/10 p-3 text-sm font-semibold text-risk">{loadError}</p>
      ) : null}

      {missionResult ? (
        <div className="mt-4 rounded-sm border border-brand/30 bg-brand/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-brand">
                {missionResult.verdict === "won"
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Target className="h-4 w-4" />}
                {locale === "en" ? "Growth Mission evaluated" : "Growth Mission 已自动判定"}
              </p>
              <h3 className="mt-2 text-lg font-black text-fg">
                {missionVerdictLabel(missionResult.verdict, locale)}
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-fg-muted">
                {missionResult.outcome?.explanation}
              </p>
            </div>
            <div className="shrink-0 border-t border-hairline pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-fg-muted">
                {missionResult.primaryMetric}
              </p>
              <p className="mt-1 font-mono text-xl font-black text-fg">
                {formatMissionValue(missionResult.outcome?.actualValue ?? 0)}
                <span className="ml-2 text-xs text-fg-subtle">
                  / {formatMissionValue(missionResult.targetValue)}
                </span>
              </p>
              <Link
                href={`/operations/missions/${missionResult.id}`}
                className="focus-ring mt-3 inline-flex items-center gap-1.5 text-xs font-black text-brand hover:underline"
              >
                {missionResult.missionKind === "content_experiment"
                  ? (locale === "en" ? "Review and plan the next cycle" : "查看结论并创建下一轮")
                  : (locale === "en" ? "Review the complete mission result" : "查看完整任务结论")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
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
            const visibleMetricFields = output.platform === "xiaohongshu"
              ? xiaohongshuMetricFields
              : defaultMetricFields;
            const source = sources[output.platform];
            const lastMeasured = measuredAt[output.platform];
            const pendingMeasurement = !lastMeasured && output.publishStatus === "posted";
            const isImportOpen = importOpenPlatform === output.platform;
            const isHighlighted = highlightedPlatform === output.platform;

            return (
              <article
                key={output.platform}
                className={`rounded-sm border p-4 shadow-panel transition-colors ${isHighlighted ? "border-brand bg-brand/5" : "border-hairline bg-surface"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-black">
                    <PlatformGlyph platform={output.platform} className="h-4 w-4" />
                    {platform.label}
                  </div>
                  <div className="flex items-center gap-2">
                    {source === "import" ? <span className="tag tag-neutral text-[10px]">{copy.aiImportTag}</span> : null}
                    {source === "auto" ? <span className="tag tag-neutral text-[10px]">{copy.autoTag}</span> : null}
                    <span className="tag tag-neutral">{output.publishStatus ?? "draft"}</span>
                  </div>
                </div>

                <label className="mt-3 grid gap-1 text-[11px] font-black uppercase text-fg-muted">
                  {copy.publishedUrl}
                  <input
                    type="url"
                    value={publishedUrls[output.platform] ?? ""}
                    placeholder={copy.publishedUrlPlaceholder}
                    onChange={(event) =>
                      setPublishedUrls((current) => ({ ...current, [output.platform]: event.target.value }))
                    }
                    className="focus-ring w-full rounded-sm border border-hairline bg-surface px-2 py-2 text-sm font-semibold text-fg"
                  />
                </label>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {visibleMetricFields.map((field) => (
                    <label key={field} className="grid gap-1 text-[11px] font-black uppercase text-fg-muted">
                      {copy[field]}
                      <input
                        type="number"
                        min={field === "followerGrowth" ? undefined : "0"}
                        step={field === "coverClickRate" || field === "averageViewSeconds" ? "0.1" : "1"}
                        value={current[field] ?? 0}
                        onChange={(event) => updateMetric(output.platform, field, event.target.value)}
                        className="focus-ring w-full rounded-sm border border-hairline bg-surface px-2 py-2 text-sm font-black text-fg tabular"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveMetric(output.platform)}
                    className="focus-ring btn-ghost inline-flex flex-1 items-center justify-center gap-2 text-xs"
                  >
                    {savingPlatform === output.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
                    {savedPlatform === output.platform ? copy.saved : copy.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isImportOpen) {
                        setImportOpenPlatform(null);
                        setImportText("");
                      } else {
                        setImportOpenPlatform(output.platform);
                        setImportText("");
                      }
                    }}
                    className="focus-ring btn-ghost inline-flex items-center justify-center gap-2 text-xs"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    {copy.pasteImport}
                  </button>
                </div>

                {isImportOpen ? (
                  <div className="mt-3 grid gap-2">
                    <textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder={copy.pastePlaceholder}
                      rows={3}
                      className="focus-ring w-full rounded-sm border border-hairline bg-surface px-2 py-2 text-sm text-fg"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void importMetrics(output.platform)}
                        disabled={importingPlatform === output.platform}
                        className="focus-ring btn-primary inline-flex flex-1 items-center justify-center gap-2 text-xs disabled:opacity-50"
                      >
                        {importingPlatform === output.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {copy.extract}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImportOpenPlatform(null);
                          setImportText("");
                        }}
                        className="focus-ring btn-ghost inline-flex items-center justify-center gap-2 text-xs"
                      >
                        {copy.cancel}
                      </button>
                    </div>
                  </div>
                ) : null}

                {lastMeasured ? (
                  <p className="mt-2 text-xs text-fg-muted">{copy.daysAgo(daysSince(lastMeasured))}</p>
                ) : pendingMeasurement ? (
                  <p className="mt-2 text-xs font-semibold text-warn">{copy.pendingMeasurement}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {isLoadingMetrics ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {locale === "en" ? "Loading saved data..." : "正在加载已保存数据…"}
        </p>
      ) : null}

      {report ? (
        <div className="mt-5 rounded-sm border border-hairline bg-surface p-4">
          <h3 className="text-lg font-black">{copy.suggestions}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-fg-muted">{report.summary}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ReportList title={copy.wins} items={report.wins} />
            <ReportList title={copy.problems} items={report.problems} />
            <ReportList
              title={copy.next}
              items={report.nextActions}
              adopt={{
                label: copy.adopt,
                adoptedLabel: copy.adopted,
                adoptedActions,
                adoptingAction,
                onAdopt: (actionText) => adoptAction(report.id, actionText)
              }}
            />
          </div>
        </div>
      ) : null}

      {reportHistory.length > 1 ? (
        <div className="mt-5">
          <h3 className="text-sm font-black uppercase text-fg-muted">{copy.history}</h3>
          <div className="mt-2 grid gap-2">
            {reportHistory.slice(1).map((historyReport) => {
              const isExpanded = expandedReportId === historyReport.id;
              return (
                <div key={historyReport.id} className="rounded-sm border border-hairline bg-surface p-3">
                  <button
                    type="button"
                    onClick={() => setExpandedReportId(isExpanded ? null : historyReport.id)}
                    className="focus-ring flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
                  >
                    <span className="truncate">
                      {new Date(historyReport.createdAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")} — {historyReport.summary}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <ReportList title={copy.wins} items={historyReport.wins} />
                      <ReportList title={copy.problems} items={historyReport.problems} />
                      <ReportList title={copy.next} items={historyReport.nextActions} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function missionVerdictLabel(verdict: GrowthMission["verdict"], locale: Locale): string {
  if (locale === "en") {
    if (verdict === "won") return "Experiment won";
    if (verdict === "lost") return "Experiment did not win";
    return "Evidence is inconclusive";
  }
  if (verdict === "won") return "实验胜出";
  if (verdict === "lost") return "实验未胜出";
  return "证据不足，需要继续验证";
}

function formatMissionValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
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

type ReportListAdoptProps = {
  label: string;
  adoptedLabel: string;
  adoptedActions: Set<string>;
  adoptingAction: string | null;
  onAdopt: (actionText: string) => void;
};

function ReportList({
  title,
  items,
  adopt
}: {
  title: string;
  items: string[];
  adopt?: ReportListAdoptProps;
}) {
  return (
    <div className="rounded-sm border border-hairline bg-surface-2 p-3">
      <p className="text-xs font-black uppercase text-fg-muted">{title}</p>
      <ul className="mt-2 grid gap-2 text-sm font-semibold leading-6">
        {items.map((item) => (
          <li key={item} className={adopt ? "flex items-start justify-between gap-2" : undefined}>
            <span>{item}</span>
            {adopt ? (
              <button
                type="button"
                disabled={adopt.adoptedActions.has(item) || adopt.adoptingAction === item}
                onClick={() => adopt.onAdopt(item)}
                className="focus-ring shrink-0 rounded-sm border border-hairline px-2 py-0.5 text-[11px] font-black uppercase text-fg-muted disabled:opacity-60"
              >
                {adopt.adoptedActions.has(item) ? adopt.adoptedLabel : adopt.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function normalizeMetric(metric: Partial<PerformanceMetrics>): MetricValue {
  return {
    impressions: metric.impressions ?? 0,
    views: metric.views ?? 0,
    clicks: metric.clicks ?? 0,
    coverClickRate: metric.coverClickRate ?? 0,
    averageViewSeconds: metric.averageViewSeconds ?? 0,
    likes: metric.likes ?? 0,
    comments: metric.comments ?? 0,
    saves: metric.saves ?? 0,
    shares: metric.shares ?? 0,
    followerGrowth: metric.followerGrowth ?? 0,
    profileVisits: metric.profileVisits ?? 0,
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
      views: sum.views + metric.views,
      clicks: sum.clicks + metric.clicks,
      engagement: sum.engagement + metric.likes + metric.comments + metric.saves + metric.shares,
      leads: sum.leads + metric.leads + metric.signups,
      explicitCtrWeight: sum.explicitCtrWeight + (metric.coverClickRate > 0 ? metric.impressions || 1 : 0),
      explicitCtrTotal: sum.explicitCtrTotal + (metric.coverClickRate > 0 ? metric.coverClickRate * (metric.impressions || 1) : 0)
    }),
    { impressions: 0, views: 0, clicks: 0, engagement: 0, leads: 0, explicitCtrWeight: 0, explicitCtrTotal: 0 }
  );

  let bestPlatform = "-";
  let bestScore = -1;
  for (const [platform, metric] of entries) {
    const score =
      metric.views +
      metric.clicks * 2 +
      metric.likes +
      metric.comments * 3 +
      metric.saves * 4 +
      metric.shares * 5 +
      metric.followerGrowth * 8 +
      metric.leads * 8 +
      metric.signups * 10 +
      metric.revenue;
    if (score > bestScore) {
      bestScore = score;
      bestPlatform = getPlatform(platform).label;
    }
  }

  return {
    ctr: totals.explicitCtrWeight > 0
      ? totals.explicitCtrTotal / totals.explicitCtrWeight / 100
      : safeRate(totals.views || totals.clicks, totals.impressions),
    engagement: safeRate(totals.engagement, totals.views || totals.impressions),
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

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
