"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Radar, TrendingUp } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";
import { captureEvent } from "@/lib/posthog";
import {
  isOpportunityDisplayReady,
  opportunityTitle,
  opportunityWhyYou,
  trendSuggestionSummary,
  trendSuggestionTitle
} from "@/lib/trends/display";
import {
  isActionableMatchScore,
  type OpportunityRadarResponse,
  type TopicOpportunity,
  type TrendSuggestion
} from "@/lib/trends/types";

type OpportunityRadarPreviewProps = {
  surface?: "growth_overview" | "agent_chatbox";
  onSelect?: (opportunity: TopicOpportunity) => void;
};

export function OpportunityRadarPreview({
  surface = "growth_overview",
  onSelect
}: OpportunityRadarPreviewProps) {
  const locale = useLocale();
  const [data, setData] = useState<OpportunityRadarResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bootstrapAttemptedRef = useRef(false);
  const agentSurface = surface === "agent_chatbox";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/operations/topic-opportunities?window=24h&limit=3&locale=${locale}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => response.ok ? response.json() as Promise<OpportunityRadarResponse> : null)
      .then((payload) => {
        if (!payload || !Array.isArray(payload.opportunities)) return;
        setData(payload);
        const opportunityCount = payload.opportunities.filter((opportunity) =>
          isActionableMatchScore(opportunity.matchScore)
          && isOpportunityDisplayReady(opportunity, locale)
        ).length;
        if (opportunityCount) {
          captureEvent("opportunity_viewed", {
            surface,
            opportunity_count: opportunityCount,
            window: "24h"
          });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [locale, refreshKey, surface]);

  useEffect(() => {
    if (!data || bootstrapAttemptedRef.current) return;
    const shouldCollect = data.collectionStatus === "not_started"
      || data.collectionStatus === "failed"
      || Boolean(data.collectionFailureStage);
    if (!shouldCollect) return;
    bootstrapAttemptedRef.current = true;
    const controller = new AbortController();
    void fetch(`/api/operations/topic-opportunities/bootstrap?locale=${locale}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    }).then((response) => {
      if (response.ok) setRefreshKey((current) => current + 1);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [data, locale]);

  useEffect(() => {
    if (data?.collectionStatus !== "collecting") return;
    const timeout = globalThis.setTimeout(() => setRefreshKey((current) => current + 1), 5_000);
    return () => globalThis.clearTimeout(timeout);
  }, [data?.collectionStatus, refreshKey]);

  const opportunities = data?.opportunities.filter((opportunity) =>
    isActionableMatchScore(opportunity.matchScore)
    && isOpportunityDisplayReady(opportunity, locale)
  ).slice(0, 3) ?? [];
  const trendSuggestions = opportunities.length ? [] : data?.trendSuggestions?.slice(0, 3) ?? [];
  if (!opportunities.length && !trendSuggestions.length) return null;
  const showingHighMatches = opportunities.length > 0;
  const hasSocialPosts = trendSuggestions.some((suggestion) => suggestion.contentKind === "industry_post" || suggestion.contentKind === "peer_post");

  return (
    <section
      aria-label={showingHighMatches
        ? (locale === "en" ? "High-match opportunities" : "实时高匹配选题")
        : hasSocialPosts
          ? (locale === "en" ? "Sourced trends and industry posts" : "真实趋势与行业帖子")
          : (locale === "en" ? "Sourced trend suggestions" : "真实趋势参考")}
      className={cn(
        "overflow-hidden",
        agentSurface
          ? "mt-4 rounded-2xl border border-action/15 bg-action/[0.035] px-3.5 py-3 sm:px-4"
          : "mt-4 rounded-[22px] border border-[#d9a441]/18 bg-[linear-gradient(135deg,rgba(217,164,65,.075),rgba(255,255,255,.018))] p-4 sm:p-5"
      )}
    >
      <div className={cn("flex items-center justify-between gap-4", agentSurface ? "px-0.5" : "px-1")}>
        <div>
          <div className={cn("flex items-center gap-2 text-xs font-bold", agentSurface ? "text-action" : "text-[#e6bb61]")}>
            {showingHighMatches ? <Radar className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {showingHighMatches
              ? agentSurface
                ? (locale === "en" ? "HIGH-MATCH NOW" : "实时高匹配选题")
                : (locale === "en" ? "OPPORTUNITY RADAR" : "机会雷达")
              : hasSocialPosts
                ? (locale === "en" ? "TRENDS + INDUSTRY POSTS" : "趋势与行业帖子")
                : (locale === "en" ? "SOURCED TRENDS" : "真实趋势参考")}
          </div>
          <p className={cn("mt-1 text-[11px]", agentSurface ? "text-fg-subtle" : "text-white/32")}>
            {showingHighMatches
              ? (locale === "en" ? "Only opportunities scoring 70 or higher" : "只显示匹配度 70 分以上的真实机会")
              : hasSocialPosts
                ? (locale === "en" ? "Public trends and creator posts, ranked against your context inside Finfold" : "公开趋势与行业博主帖子，在 Finfold 内部按业务相关性排序")
                : (locale === "en" ? "Real signals to explore while a stronger match develops" : "暂时没有高匹配机会，先看有来源的真实趋势")}
          </p>
        </div>
        <Link
          href="/operations/opportunities"
          className={cn(
            "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg text-[10px] font-bold",
            agentSurface ? "text-action hover:text-action-strong" : "text-[#e8bd64] hover:text-[#f6d891]"
          )}
        >
          {locale === "en" ? "View radar" : "打开雷达"}<ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className={cn("mt-3 grid gap-2", agentSurface ? "sm:grid-cols-3" : "lg:grid-cols-3")}>
        {showingHighMatches ? opportunities.map((opportunity, index) => {
          const className = cn(
            "group w-full rounded-xl border p-3 text-left transition",
            agentSurface
              ? "border-hairline bg-surface/65 hover:border-action/30 hover:bg-surface-2"
              : "rounded-2xl border-white/[0.075] bg-black/18 p-3.5 hover:border-[#d9a441]/30 hover:bg-white/[0.035]"
          );
          const content = <OpportunityPreviewContent
            opportunity={opportunity}
            index={index}
            locale={locale}
            agentSurface={agentSurface}
          />;
          const trackOpen = () => captureEvent("opportunity_opened", {
            opportunity_id: opportunity.id,
            surface,
            rank: index + 1
          });

          if (agentSurface && onSelect) {
            return (
              <button
                key={opportunity.id}
                type="button"
                onClick={() => {
                  trackOpen();
                  onSelect(opportunity);
                }}
                className={cn("focus-ring", className)}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={opportunity.id}
              href={`/operations/opportunities/${opportunity.id}`}
              onClick={trackOpen}
              className={cn("focus-ring", className)}
            >
              {content}
            </Link>
          );
        }) : trendSuggestions.map((suggestion, index) => (
          <Link
            key={suggestion.id}
            href="/operations/opportunities"
            onClick={() => captureEvent("trend_suggestion_opened", {
              trend_id: suggestion.id,
              surface,
              rank: index + 1
            })}
            className={cn(
              "focus-ring group w-full rounded-xl border p-3 text-left transition",
              agentSurface
                ? "border-hairline bg-surface/65 hover:border-action/30 hover:bg-surface-2"
                : "rounded-2xl border-white/[0.075] bg-black/18 p-3.5 hover:border-[#d9a441]/30 hover:bg-white/[0.035]"
            )}
          >
            <TrendSuggestionPreviewContent suggestion={suggestion} index={index} locale={locale} agentSurface={agentSurface} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrendSuggestionPreviewContent({
  suggestion,
  index,
  locale,
  agentSurface
}: {
  suggestion: TrendSuggestion;
  index: number;
  locale: "zh" | "en";
  agentSurface: boolean;
}) {
  return (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className={cn("text-[9px] font-black tracking-[0.11em]", agentSurface ? "text-fg-subtle" : "text-[#d9aa50]")}>#{index + 1} · {trendContentKindLabel(suggestion.contentKind, locale)}</span>
        <span className={cn("text-[9px] font-black", agentSurface ? "text-action" : "text-[#f0c468]")}>{suggestion.evidence[0]?.sourceLabel}</span>
      </span>
      <span className={cn("mt-2 block line-clamp-2 text-xs font-bold leading-5", agentSurface ? "text-fg" : "text-white/82")}>
        {trendSuggestionTitle(suggestion, locale)}
      </span>
      <span className={cn("mt-1.5 block line-clamp-2 text-[10px] leading-5", agentSurface ? "text-fg-muted" : "text-white/34")}>
        {trendSuggestionSummary(suggestion, locale)}
      </span>
      {suggestion.evidence[0]?.author ? <span className={cn("mt-1 block text-[9px] font-bold", agentSurface ? "text-fg-subtle" : "text-white/28")}>u/{suggestion.evidence[0].author}</span> : null}
    </>
  );
}

function trendContentKindLabel(kind: TrendSuggestion["contentKind"], locale: "zh" | "en"): string {
  if (kind === "peer_post") return locale === "en" ? "PEER" : "同行";
  if (kind === "industry_post") return locale === "en" ? "INDUSTRY" : "行业";
  return locale === "en" ? "TREND" : "趋势";
}

function OpportunityPreviewContent({
  opportunity,
  index,
  locale,
  agentSurface
}: {
  opportunity: TopicOpportunity;
  index: number;
  locale: "zh" | "en";
  agentSurface: boolean;
}) {
  const evidenceKind = opportunity.evidence.some((evidence) => evidence.contentKind === "peer_post")
    ? "peer_post" as const
    : opportunity.evidence.some((evidence) => evidence.contentKind === "industry_post")
      ? "industry_post" as const
      : "trend" as const;
  return (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className={cn("text-[9px] font-black tracking-[0.11em]", agentSurface ? "text-fg-subtle" : "text-[#d9aa50]")}>#{index + 1} · {trendContentKindLabel(evidenceKind, locale)}</span>
        <span className={cn("inline-flex items-center gap-1 text-[9px] font-black", agentSurface ? "text-action" : "text-[#f0c468]")}>
          {locale === "en" ? `${opportunity.matchScore} MATCH` : `匹配度 ${opportunity.matchScore}`}
        </span>
      </span>
      <span className={cn("mt-2 block line-clamp-2 text-xs font-bold leading-5", agentSurface ? "text-fg" : "text-white/82")}>
        {opportunityTitle(opportunity, locale)}
      </span>
      <span className={cn("mt-1.5 block line-clamp-2 text-[10px] leading-5", agentSurface ? "text-fg-muted" : "text-white/34")}>
        {opportunityWhyYou(opportunity, locale)}
      </span>
    </>
  );
}
