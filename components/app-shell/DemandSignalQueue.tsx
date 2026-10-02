"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Bookmark,
  ExternalLink,
  MessageCircle,
  Radar,
  RefreshCw,
  ThumbsDown
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { DemandSignalQueueItem, DemandSignalStatus } from "@/lib/operations/demand-signals";

type Props = {
  locale: "zh" | "en";
  keywords: string[];
};

export function DemandSignalQueue({ locale, keywords }: Props) {
  const en = locale === "en";
  const [signals, setSignals] = useState<DemandSignalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operations/demand-signals", { cache: "no-store" });
      const payload = await response.json() as { signals?: DemandSignalQueueItem[]; error?: string; queued?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load demand signals.");
      setSignals(payload.signals ?? []);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load demand signals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pendingCount = useMemo(
    () => signals.filter((signal) => signal.status === "new").length,
    [signals]
  );

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/demand-signals", { method: "POST" });
      const payload = await response.json() as { signals?: DemandSignalQueueItem[]; error?: string; queued?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Refresh failed.");
      setSignals(payload.signals ?? []);
      setQueued(payload.queued === true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function review(signalId: string, status: Exclude<DemandSignalStatus, "new">) {
    setReviewingId(signalId);
    setError(null);
    try {
      const response = await fetch(`/api/operations/demand-signals/${signalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = await response.json() as { signal?: DemandSignalQueueItem; error?: string };
      if (!response.ok || !payload.signal) throw new Error(payload.error ?? "Review failed.");
      if (status === "dismissed") {
        setSignals((current) => current.filter((signal) => signal.id !== signalId));
      } else {
        setSignals((current) => current.map((signal) => signal.id === signalId ? payload.signal! : signal));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <Panel className="relative overflow-hidden border-action/25 p-5 md:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_12%_0%,rgb(var(--action)/0.15),transparent_52%),radial-gradient(circle_at_88%_0%,rgb(var(--info)/0.1),transparent_44%)]" />
      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-action/25 bg-action/[0.1] text-action-strong dark:text-action">
              <Radar className="h-5 w-5" />
              <span aria-hidden className="absolute inset-1 animate-ping rounded-lg border border-action/20 [animation-duration:3s]" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">{en ? "PUBLIC DEMAND RADAR" : "公开需求雷达"}</p>
                {pendingCount > 0 ? <Tag tone="action" dot>{pendingCount} {en ? "to review" : "条待判断"}</Tag> : null}
              </div>
              <h2 className="mt-2 text-balance text-xl font-black text-fg md:text-2xl">
                {en ? "Real public posts, waiting for your judgment" : "真实公开帖子，等你判断是否值得跟进"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-fg-muted">
                {en
                  ? "Finfold brings together public discussions and evidence related to your business. Open the original source and decide whether the need is worth exploring."
                  : "Finfold 汇集与你业务有关的公开讨论和原文证据。你可以查看来源，再判断这个需求是否值得跟进。"}
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" loading={refreshing} onClick={() => void refresh()} disabled={keywords.length === 0}>
            <RefreshCw className="h-3.5 w-3.5" />
            {en ? "Refresh now" : "立即刷新"}
          </Button>
        </div>

        {keywords.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label={en ? "Tracked keywords" : "关注关键词"}>
            {keywords.slice(0, 8).map((keyword) => <Tag key={keyword} tone="neutral">{keyword}</Tag>)}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-semibold text-warn">
            {en ? "Add keywords to the operating brief before refreshing." : "先在运营简报中添加关注关键词，才能开始真实抓取。"}
          </p>
        )}

        {queued ? <p role="status" className="mt-4 text-sm text-fg-muted">{en ? "Business discovery is queued. Progress and source coverage are available in Signal." : "业务发现已排队，可在 Signal 查看进度和各渠道结果。"}</p> : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs font-semibold text-risk">{error}</p>
        ) : null}

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {loading ? [0, 1].map((index) => (
            <div key={index} className="panel-inset min-h-44 animate-pulse p-4">
              <div className="h-3 w-24 rounded bg-hairline" />
              <div className="mt-4 h-5 w-4/5 rounded bg-hairline" />
              <div className="mt-2 h-4 w-full rounded bg-hairline" />
              <div className="mt-2 h-4 w-2/3 rounded bg-hairline" />
            </div>
          )) : signals.length > 0 ? signals.slice(0, 8).map((signal) => (
            <article key={signal.id} className="panel-inset group flex min-h-48 flex-col p-4 transition hover:border-action/35 hover:bg-action/[0.025]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">
                  <span>{signal.source === "hacker-news" ? "Hacker News" : en ? "Business discovery" : "业务发现"}</span>
                  <span aria-hidden>·</span>
                  <span>{formatSignalDate(signal.publishedAt, locale)}</span>
                </div>
                {signal.status === "kept" ? <Tag tone="success" dot>{en ? "Kept" : "已保留"}</Tag> : <Tag tone="warn">{en ? "Unverified" : "待确认"}</Tag>}
              </div>
              <a
                href={signal.discussionUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-base font-black leading-6 text-fg transition group-hover:text-action-strong dark:group-hover:text-action"
              >
                {signal.title} <ExternalLink className="ml-1 inline h-3.5 w-3.5" />
              </a>
              {signal.excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-fg-muted">{signal.excerpt}</p> : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {signal.matchedKeywords.slice(0, 4).map((keyword) => <Tag key={keyword} tone="neutral">{keyword}</Tag>)}
              </div>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                <div className="flex items-center gap-3 text-xs font-bold text-fg-muted">
                  <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />{signal.score ?? "—"}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{signal.comments ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={signal.status === "kept" ? "secondary" : "tertiary"}
                    loading={reviewingId === signal.id}
                    onClick={() => void review(signal.id, "kept")}
                    disabled={signal.status === "kept"}
                  >
                    <Bookmark className="h-3.5 w-3.5" />{en ? "Keep" : "保留"}
                  </Button>
                  <Button size="sm" variant="tertiary" disabled={reviewingId === signal.id} onClick={() => void review(signal.id, "dismissed")}>
                    <ThumbsDown className="h-3.5 w-3.5" />{en ? "Ignore" : "忽略"}
                  </Button>
                </div>
              </div>
            </article>
          )) : (
            <div className="panel-inset col-span-full flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <Radar className="h-7 w-7 text-fg-muted" />
              <p className="mt-3 text-sm font-black text-fg">{en ? "No matching public posts yet" : "暂时没有匹配的公开帖子"}</p>
              <p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
                {en ? "Refresh checks the live source. Finfold will not fill this space with sample or invented demand." : "刷新会检查实时来源；Finfold 不会用示例或编造的需求填满这里。"}
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
function formatSignalDate(value: string | null, locale: "zh" | "en"): string {
  if (!value) return locale === "en" ? "time unavailable" : "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "en" ? "time unavailable" : "时间未知";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric"
  }).format(date);
}
