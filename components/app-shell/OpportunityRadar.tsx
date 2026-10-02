"use client";

import { SignalDiscoveryPanel } from "@/components/app-shell/SignalDiscoveryPanel";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Bookmark,
  Clock,
  ExternalLink,
  Flame,
  Loader2,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp
} from "@/components/ui/icons";
import { OpportunityPrepareButton } from "@/components/app-shell/OpportunityPrepareButton";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";
import { captureEvent } from "@/lib/posthog";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import {
  isOpportunityDisplayReady,
  opportunityFact,
  opportunityFormat,
  opportunityMainAngle,
  opportunityTitle,
  opportunityWhyNow,
  opportunityWhyYou,
  trendSuggestionAngle,
  trendSuggestionSummary,
  trendSuggestionTitle
} from "@/lib/trends/display";
import {
  isActionableMatchScore,
  type OpportunityRadarResponse,
  type TopicOpportunity,
  type TopicOpportunityFeedback,
  type TrendLifecycle,
  type TrendSuggestion,
  type TrendCollectionSourceSummary,
  type TrendWindow
} from "@/lib/trends/types";

const WINDOWS: TrendWindow[] = ["4h", "24h", "7d"];

export function OpportunityRadar() {
  const locale = useLocale();
  const [window, setWindow] = useState<TrendWindow>("24h");
  const [data, setData] = useState<OpportunityRadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [sourcePreferenceSaving, setSourcePreferenceSaving] = useState<string | null>(null);
  const [sourcePreferenceError, setSourcePreferenceError] = useState<string | null>(null);
  const bootstrapAttemptedRef = useRef(false);

  const load = useCallback(async (selectedWindow: TrendWindow) => {
    setError(null);
    const response = await fetch(`/api/operations/topic-opportunities?window=${selectedWindow}&limit=5&locale=${locale}`, { cache: "no-store" });
    const payload = await response.json() as OpportunityRadarResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || localized(locale, "暂时无法加载机会雷达。", "Unable to load Opportunity Radar."));
    setData(payload);
  }, [locale]);

  useEffect(() => {
    setLoading(true);
    load(window)
      .catch((caught) => setError(caught instanceof Error ? caught.message : localized(locale, "暂时无法加载机会雷达。", "Unable to load Opportunity Radar.")))
      .finally(() => setLoading(false));
  }, [load, locale, window]);

  const bootstrapCollection = useCallback(async () => {
    setCollectionLoading(true);
    setCollectionError(null);
    try {
      const response = await fetch(`/api/operations/topic-opportunities/bootstrap?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || localized(locale, "真实信号采集失败，请重试。", "Live collection failed. Try again."));
      }
      await load(window);
    } catch (caught) {
      setCollectionError(caught instanceof Error ? caught.message : localized(locale, "真实信号采集失败，请重试。", "Live collection failed. Try again."));
    } finally {
      setCollectionLoading(false);
    }
  }, [load, locale, window]);

  useEffect(() => {
    if (!data || bootstrapAttemptedRef.current) return;
    const shouldCollect = data.collectionStatus === "not_started"
      || data.collectionStatus === "failed"
      || Boolean(data.collectionFailureStage);
    if (!shouldCollect) return;
    bootstrapAttemptedRef.current = true;
    void bootstrapCollection();
  }, [bootstrapCollection, data]);

  useEffect(() => {
    if (data?.collectionStatus !== "collecting" || collectionLoading) return;
    const timeout = globalThis.setTimeout(() => {
      void load(window).catch(() => undefined);
    }, 3_000);
    return () => globalThis.clearTimeout(timeout);
  }, [collectionLoading, data?.collectionStatus, load, window]);

  useEffect(() => {
    if (!data) return;
    captureEvent("opportunity_viewed", {
      window,
      opportunity_count: data.opportunities.length,
      latest_signal_at: data.latestSignalAt
    });
  }, [data, window]);

  async function sendFeedback(opportunity: TopicOpportunity, feedback: TopicOpportunityFeedback) {
    setFeedbackLoading(opportunity.id);
    try {
      const response = await fetch(`/api/operations/topic-opportunities/${encodeURIComponent(opportunity.id)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || localized(locale, "反馈保存失败。", "Unable to save feedback."));
      setData((current) => current ? {
        ...current,
        opportunities: current.opportunities.filter((item) => item.id !== opportunity.id)
      } : current);
      captureEvent("opportunity_feedback", { opportunity_id: opportunity.id, feedback });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : localized(locale, "反馈保存失败。", "Unable to save feedback."));
    } finally {
      setFeedbackLoading(null);
    }
  }

  async function toggleSourcePreference(source: TrendCollectionSourceSummary) {
    if (!data || !source.preferenceKey || sourcePreferenceSaving) return;
    const currentSources = data.collectionSources ?? [];
    const currentlyEnabled = source.enabled !== false;
    const enabledKeys = currentSources.flatMap((item) =>
      item.preferenceKey && item.enabled !== false ? [item.preferenceKey] : []);
    const nextEnabledKeys = currentlyEnabled
      ? enabledKeys.filter((key) => key !== source.preferenceKey)
      : [...new Set([...enabledKeys, source.preferenceKey])];
    if (!nextEnabledKeys.length) {
      setSourcePreferenceError(localized(locale, "请至少保留一个数据源。", "Keep at least one source enabled."));
      return;
    }

    const previous = data;
    setSourcePreferenceSaving(source.preferenceKey);
    setSourcePreferenceError(null);
    setData({
      ...data,
      collectionSources: currentSources.map((item) =>
        item.preferenceKey === source.preferenceKey ? { ...item, enabled: !currentlyEnabled } : item)
    });
    try {
      const response = await fetch("/api/settings/trend-sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledSourceKeys: nextEnabledKeys })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || localized(locale, "数据源偏好保存失败，请重试。", "Unable to save source preferences."));
      }
      captureEvent("opportunity_source_preference_changed", {
        source: source.preferenceKey,
        enabled: !currentlyEnabled
      });
      await load(window);
    } catch (caught) {
      setData(previous);
      setSourcePreferenceError(caught instanceof Error
        ? caught.message
        : localized(locale, "数据源偏好保存失败，请重试。", "Unable to save source preferences."));
    } finally {
      setSourcePreferenceSaving(null);
    }
  }

  const opportunities = data?.opportunities.filter((opportunity) =>
    isActionableMatchScore(opportunity.matchScore)
    && isOpportunityDisplayReady(opportunity, locale)
  ) ?? [];
  const trendSuggestions = data?.trendSuggestions ?? [];

  return (
    <>
      {/* 板块导航由页面层渲染：受控页签（增长闭环/X 流水线）的开关只能服务端计算。 */}
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-[0_28px_90px_rgb(var(--fg)/0.06)] xl:max-w-[1440px] 2xl:max-w-[1640px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_10%_0%,rgb(var(--action)/0.16),transparent_35%),radial-gradient(circle_at_90%_10%,rgb(var(--info)/0.09),transparent_30%)]" />
        <div className="grain-local" aria-hidden />
        <div className="relative px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-action"><Radar className="h-4 w-4" />{localized(locale, "机会雷达", "OPPORTUNITY RADAR")}</div>
              <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-fg sm:text-4xl">{localized(locale, "什么值得你发", "What is worth publishing")}</h1>
            </div>
            <div className="flex rounded-xl border border-hairline bg-surface-2/70 p-1">
              {WINDOWS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setWindow(item)}
                  className={cn("focus-ring h-9 rounded-lg px-3 text-[11px] font-black transition", window === item ? "bg-fg text-bg shadow-sm" : "text-fg-muted hover:text-fg")}
                >
                  {item === "7d" ? localized(locale, "7 天", "7 days") : item === "24h" ? localized(locale, "24 小时", "24 hours") : localized(locale, "4 小时", "4 hours")}
                </button>
              ))}
            </div>
          </header>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-hairline py-3 text-[10px] font-bold text-fg-subtle">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-action" />{localized(locale, "高匹配优先，没有时显示真实趋势参考", "High matches first, then sourced trend suggestions")}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{data?.collectionStatus === "collecting" || collectionLoading ? localized(locale, "正在采集真实信号", "Collecting live signals") : data?.latestCollectionAt ? localized(locale, `最新检查 ${relativeTime(data.latestCollectionAt, locale)}`, `Latest check ${relativeTime(data.latestCollectionAt, locale)}`) : localized(locale, "准备首轮采集", "Preparing first collection")}</span>
            <span>{data?.checkedSourceCount ? localized(locale, `本轮 ${data.checkedSourceCount} 个来源 · ${data.collectedSignalCount ?? 0} 条信号`, `${data.checkedSourceCount} sources · ${data.collectedSignalCount ?? 0} signals this round`) : localized(locale, `当前 ${data?.sourceCount ?? 0} 个可用来源`, `${data?.sourceCount ?? 0} available sources`)}</span>
            {!data?.persisted && data ? <span className="text-risk">{localized(locale, "本地预览，不保存", "Local preview, not persisted")}</span> : null}
          </div>

          {data?.collectionSources?.length ? (
            <CollectionSourceDetails
              locale={locale}
              data={data}
              savingKey={sourcePreferenceSaving}
              preferenceError={sourcePreferenceError}
              onToggle={(source) => { void toggleSourcePreference(source); }}
            />
          ) : null}

          <SignalDiscoveryPanel locale={locale} onCompleted={() => { void load(window).catch(() => undefined); }} />
          {loading ? <RadarLoading locale={locale} /> : null}
          {!loading && error ? <RadarError locale={locale} error={error} onRetry={() => { setLoading(true); load(window).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught))).finally(() => setLoading(false)); }} /> : null}
          {!loading && !error && opportunities.length > 0 ? (
            <div className="mt-6 grid gap-4">
              {opportunities.map((opportunity, index) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  index={index}
                  locale={locale}
                  feedbackLoading={feedbackLoading === opportunity.id}
                  onFeedback={(feedback) => { void sendFeedback(opportunity, feedback); }}
                />
              ))}
            </div>
          ) : null}
          {!loading && !error && data && opportunities.length === 0 && trendSuggestions.length > 0 ? (
            <TrendSuggestionsPanel
              locale={locale}
              suggestions={trendSuggestions}
              data={data}
              collectionLoading={collectionLoading}
              collectionError={collectionError}
              onRetry={() => { bootstrapAttemptedRef.current = true; void bootstrapCollection(); }}
            />
          ) : null}
          {!loading && !error && data && opportunities.length === 0 && trendSuggestions.length === 0 ? <RadarEmpty locale={locale} data={data} collectionLoading={collectionLoading} collectionError={collectionError} onRetry={() => { bootstrapAttemptedRef.current = true; void bootstrapCollection(); }} /> : null}
        </div>
      </div>
    </>
  );
}

function OpportunityCard({
  opportunity,
  index,
  locale,
  feedbackLoading,
  onFeedback
}: {
  opportunity: TopicOpportunity;
  index: number;
  locale: "zh" | "en";
  feedbackLoading: boolean;
  onFeedback: (feedback: TopicOpportunityFeedback) => void;
}) {
  const lifecycle = lifecycleMeta(opportunity.lifecycle, locale);
  const evidenceKind = opportunity.evidence.some((evidence) => evidence.contentKind === "peer_post")
    ? "peer_post" as const
    : opportunity.evidence.some((evidence) => evidence.contentKind === "industry_post")
      ? "industry_post" as const
      : "trend" as const;
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group relative overflow-hidden rounded-[22px] border border-hairline bg-bg/45 p-4 transition hover:border-action/30 hover:shadow-[0_18px_50px_rgb(var(--fg)/0.07)] sm:p-5"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-action via-action/60 to-transparent opacity-70" />
      <div className="grid gap-5 lg:grid-cols-[86px_minmax(0,1fr)_220px] lg:items-start">
        <div className="flex items-center gap-3 lg:block">
          <div className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full text-center" style={{ background: `radial-gradient(circle at center,rgb(var(--surface)) 56%,transparent 58%),conic-gradient(rgb(var(--action)) ${opportunity.matchScore * 3.6}deg,rgb(var(--hairline)) 0deg)` }}>
            <div><span className="block text-xl font-black leading-none text-fg">{opportunity.matchScore}</span><span className="mt-1 block text-[8px] font-black tracking-[0.1em] text-fg-subtle">{localized(locale, "匹配度", "MATCH")}</span></div>
          </div>
          <div className="lg:mt-3 lg:text-center"><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black", lifecycle.className)}><Flame className="h-3 w-3" />{lifecycle.label}</span></div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-fg-subtle">
            <span>#{index + 1}</span>
            <span>{getLocalizedPlatformLabel(opportunity.recommendedPlatform, locale)}</span>
            <span>·</span>
            <span>{opportunityFormat(opportunity, locale)}</span>
            <span>·</span>
            <span>{trendContentKindLabel(evidenceKind, locale)}</span>
            <span>·</span>
            <span>{relativeTime(opportunity.lastSeenAt, locale)}</span>
          </div>
          <Link
            href={`/operations/opportunities/${opportunity.id}`}
            onClick={() => captureEvent("opportunity_opened", { opportunity_id: opportunity.id, rank: index + 1 })}
            className="focus-ring mt-2 inline-flex items-start gap-2 rounded-lg text-left text-lg font-black leading-7 tracking-[-0.025em] text-fg transition group-hover:text-action sm:text-xl"
          >
            {opportunityTitle(opportunity, locale)}<ArrowUpRight className="mt-1.5 h-4 w-4 shrink-0" />
          </Link>
          <p className="mt-2 line-clamp-2 text-xs leading-6 text-fg-muted">{opportunityFact(opportunity, locale)}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-hairline bg-surface/70 px-3 py-2.5"><p className="text-[9px] font-black tracking-[0.12em] text-action">{localized(locale, "为什么是现在", "WHY NOW")}</p><p className="mt-1 text-[11px] leading-5 text-fg-muted">{opportunityWhyNow(opportunity, locale)}</p></div>
            <div className="rounded-xl border border-hairline bg-surface/70 px-3 py-2.5"><p className="text-[9px] font-black tracking-[0.12em] text-action">{localized(locale, "为什么适合你", "WHY YOU")}</p><p className="mt-1 text-[11px] leading-5 text-fg-muted">{opportunityWhyYou(opportunity, locale)}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {opportunity.evidence.slice(0, 3).map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[9px] font-bold text-fg-muted hover:border-action/30 hover:text-fg"><ExternalLink className="h-3 w-3" />{evidence.sourceLabel}</a>)}
            <span className="text-[9px] font-bold text-fg-subtle">{localized(locale, `证据可信度 ${opportunity.evidenceConfidence}`, `Evidence confidence ${opportunity.evidenceConfidence}`)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-action/15 bg-action/[0.045] p-4">
          <p className="text-[9px] font-black tracking-[0.13em] text-action">{localized(locale, "推荐切入角度", "RECOMMENDED ANGLE")}</p>
          <p className="mt-2 text-xs font-bold leading-6 text-fg">{opportunityMainAngle(opportunity, locale)}</p>
          <div className="mt-4"><OpportunityPrepareButton opportunity={opportunity} /></div>
          <div className="mt-4 border-t border-hairline pt-3">
            <p className="text-[9px] font-bold text-fg-subtle">{localized(locale, "这个机会不合适？", "Not useful?")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {feedbackOptions(locale).map((item) => <button key={item.value} type="button" disabled={feedbackLoading} onClick={() => onFeedback(item.value)} className="focus-ring rounded-lg border border-hairline px-2 py-1 text-[9px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40">{item.label}</button>)}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function TrendSuggestionsPanel({
  locale,
  suggestions,
  data,
  collectionLoading,
  collectionError,
  onRetry
}: {
  locale: "zh" | "en";
  suggestions: TrendSuggestion[];
  data: OpportunityRadarResponse;
  collectionLoading: boolean;
  collectionError: string | null;
  onRetry: () => void;
}) {
  const issue = collectionError || data.collectionError;
  const hasSocialPosts = suggestions.some((suggestion) => suggestion.contentKind === "industry_post" || suggestion.contentKind === "peer_post");
  return (
    <section className="mt-6" aria-label={localized(locale, "真实趋势与行业内容", "Sourced trends and industry content")}>
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-action/15 bg-action/[0.045] px-4 py-4 sm:px-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em] text-action">
            <TrendingUp className="h-4 w-4" />{localized(locale, hasSocialPosts ? "真实趋势与行业帖子" : "正在发生的真实趋势", hasSocialPosts ? "SOURCED TRENDS AND INDUSTRY POSTS" : "SOURCED TRENDS HAPPENING NOW")}
          </div>
          <h2 className="mt-2 text-lg font-black text-fg">{localized(locale, hasSocialPosts ? "先看正在升温的趋势与行业帖子" : "先给你值得关注的趋势参考", hasSocialPosts ? "See rising trends and industry posts first" : "Trends worth considering right now")}</h2>
          <p className="mt-1.5 text-xs leading-6 text-fg-muted">
            {localized(
              locale,
              "当前没有达到 70 分的高匹配机会",
              "No opportunity has reached the 70-point high-match threshold."
            )}
          </p>
          {data.trendSuggestionFallbackWindow ? (
            <p className="mt-1 text-[10px] leading-5 text-fg-subtle">
              {localized(
                locale,
                `近 ${data.window === "4h" ? "4 小时" : "24 小时"}没有新信号，以下为过去 7 天仍可追溯的趋势参考。`,
                `No new signal appeared in the last ${data.window === "4h" ? "4 hours" : "24 hours"}; the traceable references below are from the last 7 days.`
              )}
            </p>
          ) : null}
        </div>
        {data.profileReady ? null : (
          <Link href="/operations" className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-action/20 bg-surface px-3 text-[10px] font-black text-action">
            {localized(locale, "完善业务重点，提升匹配", "Add context for better matches")}<ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {issue ? (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-risk/20 bg-risk/[0.055] px-3.5 py-3 text-xs text-fg-muted">
          <span>{issue}</span>
          <button type="button" onClick={onRetry} disabled={collectionLoading} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-3 text-[10px] font-black text-bg disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", collectionLoading && "animate-spin")} />
            {collectionLoading ? localized(locale, "正在刷新", "Refreshing") : localized(locale, "重新采集", "Collect again")}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {suggestions.slice(0, 5).map((suggestion, index) => (
          <TrendSuggestionCard key={suggestion.id} suggestion={suggestion} index={index} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function CollectionSourceDetails({
  locale,
  data,
  savingKey,
  preferenceError,
  onToggle
}: {
  locale: "zh" | "en";
  data: OpportunityRadarResponse;
  savingKey: string | null;
  preferenceError: string | null;
  onToggle: (source: TrendCollectionSourceSummary) => void;
}) {
  const sources = data.collectionSources ?? [];
  const enabledCount = sources.filter((source) => source.enabled !== false).length;
  return (
    <details className="mt-3">
      <summary className="focus-ring ml-auto inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[10px] font-black text-fg-muted transition hover:border-action/25 hover:text-fg [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-3.5 w-3.5 text-action" />
        {localized(locale, `数据源 ${enabledCount}/${sources.length}`, `Sources ${enabledCount}/${sources.length}`)}
      </summary>
      <div className="mt-2 rounded-2xl border border-hairline bg-surface/75 p-3 text-left shadow-[0_16px_45px_rgb(var(--fg)/0.08)] backdrop-blur-xl sm:p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-fg">{localized(locale, "选择参与你推荐的数据源", "Choose sources for your recommendations")}</p>
            <p className="mt-1 max-w-xl text-[10px] font-medium leading-5 text-fg-subtle">
              {localized(locale, "关闭后不会参与当前账号的推荐；公共采集仍会继续，不影响其他用户。", "Disabled sources are excluded from your recommendations. Public collection continues for other users.")}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-action/10 px-2 py-1 text-[9px] font-black text-action">{enabledCount}/{sources.length}</span>
        </div>
        {preferenceError ? <p role="alert" className="mt-3 rounded-lg bg-risk/8 px-3 py-2 text-[10px] font-bold text-risk">{preferenceError}</p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sources.map((source, index) => {
            const enabled = source.enabled !== false;
            const saving = savingKey === source.preferenceKey;
            return (
              <div key={`${source.source}:${source.label}:${index}`} className={cn("rounded-xl border px-3 py-2.5 transition", enabled ? "border-hairline bg-bg/45" : "border-hairline/70 bg-bg/20 opacity-65")}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[11px] font-black text-fg">{source.label}</span>
                  {source.preferenceKey ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={localized(locale, `${enabled ? "关闭" : "开启"}${source.label}`, `${enabled ? "Disable" : "Enable"} ${source.label}`)}
                      disabled={Boolean(savingKey)}
                      onClick={() => onToggle(source)}
                      className={cn("focus-ring relative h-5 w-9 shrink-0 rounded-full transition disabled:cursor-wait disabled:opacity-60", enabled ? "bg-action" : "bg-surface-2")}
                    >
                      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition", enabled ? "left-[18px]" : "left-0.5")} />
                      {saving ? <span className="sr-only">{localized(locale, "正在保存", "Saving")}</span> : null}
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[9px] font-bold">
                  <span className="text-fg-subtle">{localized(locale, `获取 ${source.fetched} 条 · 保存 ${source.persisted} 条`, `${source.fetched} fetched · ${source.persisted} saved`)}</span>
                  <span className={cn(enabled && (source.status === "ready" || source.status === "unchanged") ? "text-action" : enabled ? "text-risk" : "text-fg-subtle")}>
                    {enabled ? collectionSourceStatus(source.status, locale) : localized(locale, "已关闭", "Disabled")}
                  </span>
                </div>
                {enabled && source.error ? (
                  <p className="mt-1 text-[9px] leading-4 text-risk">
                    {localized(locale, "原因：", "Reason: ")}{collectionSourceError(source.error, locale)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function TrendSuggestionCard({
  suggestion,
  index,
  locale
}: {
  suggestion: TrendSuggestion;
  index: number;
  locale: "zh" | "en";
}) {
  const sourceLabels = [...new Set(suggestion.evidence.map((evidence) => evidence.sourceLabel))];
  const lifecycle = lifecycleMeta(suggestion.lifecycle, locale);
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex min-h-[250px] flex-col rounded-2xl border border-hairline bg-bg/45 p-4 transition hover:border-action/25"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] font-black">
        <span className="text-fg-subtle">#{index + 1} · {trendContentKindLabel(suggestion.contentKind, locale)} · {sourceLabels.slice(0, 2).join(" + ")}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", lifecycle.className)}><Flame className="h-3 w-3" />{lifecycle.label}</span>
      </div>
      <h3 className="mt-3 text-base font-black leading-6 text-fg">{trendSuggestionTitle(suggestion, locale)}</h3>
      {suggestion.evidence[0]?.author ? <p className="mt-1 text-[10px] font-bold text-fg-subtle">u/{suggestion.evidence[0].author}</p> : null}
      <p className="mt-2 line-clamp-3 text-xs leading-6 text-fg-muted">{trendSuggestionSummary(suggestion, locale)}</p>
      <div className="mt-4 rounded-xl border border-action/12 bg-action/[0.035] px-3 py-2.5">
        <p className="text-[9px] font-black tracking-[0.1em] text-action">{localized(locale, "建议思考角度", "ANGLE TO EXPLORE")}</p>
        <p className="mt-1 text-[11px] leading-5 text-fg-muted">{trendSuggestionAngle(suggestion, locale)}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {suggestion.evidence.slice(0, 2).map((evidence) => (
          <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[9px] font-bold text-fg-muted hover:border-action/30 hover:text-fg">
            <ExternalLink className="h-3 w-3" />{evidence.sourceLabel}
          </a>
        ))}
        <span className="text-[9px] font-bold text-fg-subtle">{relativeTime(suggestion.lastSeenAt, locale)}</span>
      </div>
    </motion.article>
  );
}

function collectionSourceStatus(status: NonNullable<OpportunityRadarResponse["collectionSources"]>[number]["status"], locale: "zh" | "en"): string {
  if (status === "ready") return localized(locale, "已保存", "Saved");
  if (status === "unchanged") return localized(locale, "无更新", "Unchanged");
  if (status === "source_failed") return localized(locale, "读取失败", "Fetch failed");
  return localized(locale, "保存失败", "Save failed");
}

function collectionSourceError(error: string, locale: "zh" | "en"): string {
  const message = error.trim();
  if (/timed?\s*out|timeout|abort/i.test(message)) return localized(locale, "来源响应超时", "The source timed out");
  if (/returned\s+\d{3}/i.test(message)) {
    const status = message.match(/returned\s+(\d{3})/i)?.[1];
    return localized(locale, `来源返回 ${status ?? "异常"} 状态`, `The source returned ${status ?? "an error"}`);
  }
  if (/too large/i.test(message)) return localized(locale, "来源数据超过安全读取上限", "The source exceeded the safe response limit");
  if (/RSS|Atom|readable feed/i.test(message)) return localized(locale, "来源没有返回可读取的 RSS/Atom 订阅", "The source did not return a readable RSS/Atom feed");
  if (/content[- ]type|MIME/i.test(message)) return localized(locale, "来源返回了不支持的数据格式", "The source returned an unsupported format");
  if (/network|fetch failed|connection/i.test(message)) return localized(locale, "来源网络连接失败", "The source connection failed");
  return localized(locale, "来源暂时不可用", "The source is temporarily unavailable");
}

function trendContentKindLabel(kind: TrendSuggestion["contentKind"], locale: "zh" | "en"): string {
  if (kind === "peer_post") return localized(locale, "同行博主", "Peer creator");
  if (kind === "industry_post") return localized(locale, "行业热帖", "Industry post");
  return localized(locale, "大众趋势", "Public trend");
}

function RadarLoading({ locale }: { locale: "zh" | "en" }) {
  return <div className="grid min-h-[420px] place-items-center text-center"><div><Loader2 className="mx-auto h-7 w-7 animate-spin text-action" /><p className="mt-4 text-sm font-bold text-fg">{localized(locale, "正在匹配实时信号", "Matching live signals")}</p><p className="mt-2 text-xs text-fg-muted">{localized(locale, "不会用示例热点填充结果。", "No sample trends will be used as filler.")}</p></div></div>;
}

function RadarError({ locale, error, onRetry }: { locale: "zh" | "en"; error: string; onRetry: () => void }) {
  return <div className="mt-6 grid min-h-[380px] place-items-center rounded-2xl border border-risk/20 bg-risk/[0.04] p-6 text-center"><div className="max-w-md"><p className="text-lg font-black text-fg">{localized(locale, "机会雷达暂时不可用", "Opportunity Radar is unavailable")}</p><p className="mt-3 text-sm leading-6 text-fg-muted">{error}</p><button type="button" onClick={onRetry} className="focus-ring mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-fg px-4 text-xs font-black text-bg"><RefreshCw className="h-4 w-4" />{localized(locale, "重新加载", "Try again")}</button></div></div>;
}

function RadarEmpty({
  locale,
  data,
  collectionLoading,
  collectionError,
  onRetry
}: {
  locale: "zh" | "en";
  data: OpportunityRadarResponse;
  collectionLoading: boolean;
  collectionError: string | null;
  onRetry: () => void;
}) {
  const needsProfile = !data.profileReady;
  const localizationUnavailable = locale === "zh" && data.localizationStatus === "unavailable";
  const collecting = !needsProfile && !localizationUnavailable && !collectionError
    && (collectionLoading || data.collectionStatus === "not_started" || data.collectionStatus === "collecting");
  const failed = !needsProfile && !localizationUnavailable
    && Boolean(collectionError || data.collectionFailureStage || data.collectionStatus === "failed");
  const title = needsProfile
    ? localized(locale, "先告诉我你的业务重点", "Add your operating context first")
    : localizationUnavailable
      ? "中文机会分析暂不可用"
      : collecting
        ? localized(locale, "正在完成首轮真实信号采集", "Collecting your first live signals")
        : failed
          ? localized(locale, "真实信号采集没有完成", "Live collection did not complete")
          : localized(locale, "本轮暂无高匹配机会", "No high-match opportunity this round");
  const description = needsProfile
    ? localized(locale, "完成运营目标中的产品、受众和关注词，雷达才能计算真实匹配度。", "Add your offer, audience, and watchlist so the radar can calculate a real match.")
    : localizationUnavailable
      ? "系统不会用英文原文或模板结果填充中文界面，请稍后重新加载。"
      : collecting
        ? localized(locale, "系统正在自动检查真实公开来源并建立账号匹配，不需要你再配置或跳转。", "Finfold is automatically checking live public sources and matching them to your account. No extra setup is needed.")
        : failed
          ? collectionError || data.collectionError || localized(locale, "真实信号来源暂时不可用，请重新采集。", "Live signal sources are temporarily unavailable. Try collecting again.")
          : localized(
            locale,
            data.sourceCount > 0
              ? `本轮已检查 ${data.sourceCount} 个真实来源，但没有选题达到 70 分高匹配门槛。`
              : "本轮真实采集已完成，但当前来源没有返回可用信号。",
            data.sourceCount > 0
              ? `This round checked ${data.sourceCount} live sources, but no opportunity reached the 70-point match threshold.`
              : "This live collection completed, but the sources returned no usable signals."
          );

  return (
    <div className="mt-6 grid min-h-[420px] place-items-center rounded-[22px] border border-dashed border-hairline bg-bg/30 p-6 text-center">
      <div className="max-w-2xl" aria-live="polite">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-action/20 bg-action/8 text-action">
          {collecting ? <Loader2 className="h-6 w-6 animate-spin" /> : needsProfile ? <Bookmark className="h-6 w-6" /> : <Radar className="h-6 w-6" />}
        </div>
        <h2 className="mt-5 text-xl font-black text-fg">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-fg-muted">{description}</p>
        {needsProfile ? (
          <Link href="/operations" className="focus-ring mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-action px-4 text-xs font-black text-on-action">
            {localized(locale, "完善运营目标", "Complete operating brief")}<ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : null}
        {failed ? (
          <button type="button" onClick={onRetry} disabled={collectionLoading} className="focus-ring mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-action px-4 text-xs font-black text-on-action disabled:opacity-50">
            <RefreshCw className={cn("h-4 w-4", collectionLoading && "animate-spin")} />{localized(locale, "重新采集", "Collect again")}
          </button>
        ) : null}
        {!collecting && !failed && !needsProfile && !localizationUnavailable && data.collectionError ? (
          <p className="mt-4 text-xs leading-6 text-risk">{data.collectionError}</p>
        ) : null}
      </div>
    </div>
  );
}

function feedbackOptions(locale: "zh" | "en"): Array<{ value: TopicOpportunityFeedback; label: string }> {
  return [
    { value: "not_relevant", label: localized(locale, "不相关", "Not relevant") },
    { value: "already_knew", label: localized(locale, "已知道", "Already knew") },
    { value: "brand_mismatch", label: localized(locale, "不适合品牌", "Brand mismatch") },
    { value: "later", label: localized(locale, "稍后再看", "Later") }
  ];
}

function lifecycleMeta(lifecycle: TrendLifecycle, locale: "zh" | "en") {
  if (lifecycle === "hot") return { label: localized(locale, "高热", "Hot"), className: "bg-risk/10 text-risk" };
  if (lifecycle === "rising") return { label: localized(locale, "上升中", "Rising"), className: "bg-action/10 text-action" };
  if (lifecycle === "cooling") return { label: localized(locale, "降温", "Cooling"), className: "bg-surface-2 text-fg-muted" };
  return { label: localized(locale, "新出现", "New"), className: "bg-info/10 text-info" };
}

function relativeTime(value: string, locale: "zh" | "en"): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return locale === "en" ? `${minutes}m ago` : `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return locale === "en" ? `${hours}h ago` : `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return locale === "en" ? `${days}d ago` : `${days} 天前`;
}

function localized(locale: "zh" | "en", zh: string, en: string): string {
  return locale === "en" ? en : zh;
}
