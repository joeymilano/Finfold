"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Switch } from "@/components/ui/Switch";
import { useLocale } from "@/hooks/useLocale";

type PublicJob = {
  id: string;
  kind: "post" | "thread" | "reply";
  status: string;
  statusLabel: string;
  scheduledFor: string;
  approvedAt: string | null;
  autoReview: {
    model: string;
    decision: "approved" | "needs_human";
    reasons: string[];
    metrics: {
      fabricatedSpecifics: number | null;
      aiTell: number | null;
      hardSell: number | null;
      offBrandRisk: number | null;
      quality: number | null;
    };
    decidedAt: string;
  } | null;
  snapshot: {
    kind: "post" | "thread" | "reply";
    tweets: { text: string; mediaUrl: string | null }[];
    replyToTweetId: string | null;
    replyContext?: { handle: string; text: string } | null;
    topic: { source: string; ref: string; title: string };
    notes: string | null;
  };
  tweetUrl: string | null;
  error: string | null;
  canApprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
};

type Settings = {
  reviewMode: "every_post" | "spot_check" | "jev_guarded";
  dailyPostLimit: number;
  dailyReplyLimit: number;
  generationEnabled: boolean;
  engagementEnabled: boolean;
  paused: boolean;
  pausedReason: string | null;
};

const AUTO_REVIEW_REASON_LABELS: Record<string, { zh: string; en: string }> = {
  fabricated_specifics_risk: { zh: "疑似编造数据", en: "unverifiable specifics" },
  ai_tell_risk: { zh: "AI 腔", en: "AI-sounding copy" },
  hard_sell_risk: { zh: "硬广", en: "hard sell" },
  off_brand_risk: { zh: "品牌风险", en: "off-brand risk" },
  quality_below_floor: { zh: "质量不达标", en: "below quality floor" },
  jev_answer_missing: { zh: "质检结果缺失", en: "incomplete review answers" },
  approve_transition_failed: { zh: "放行失败", en: "approve failed" },
  jev_disabled: { zh: "自动审核未启用", en: "auto review disabled" }
};

function AutoReviewBadge({ record, en }: { record: NonNullable<PublicJob["autoReview"]>; en: boolean }) {
  const approved = record.decision === "approved";
  const reasons = record.reasons
    .map((reason) => AUTO_REVIEW_REASON_LABELS[reason]?.[en ? "en" : "zh"]
      ?? (reason.startsWith("jev_") ? (en ? "auto review unavailable" : "自动审核暂不可用") : reason))
    .slice(0, 2)
    .join(en ? ", " : "、");
  const quality = record.metrics.quality;
  const detail = approved
    ? `${en ? "quality" : "质量"} ${quality === null ? "—" : quality.toFixed(1)}/4`
    : reasons;
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${approved ? "bg-action/10 text-action" : "bg-warn/10 text-warn"}`}
      title={record.decidedAt}
    >
      {approved ? (en ? "auto-approved" : "自动放行") : en ? "flagged → you" : "转人工"} · {detail}
    </span>
  );
}

type WatchlistEntry = {
  id: string;
  kind: "account" | "keyword";
  value: string;
  note: string | null;
  active: boolean;
};

export function XPipelineConsole() {
  const locale = useLocale();
  const en = locale === "en";
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchKind, setWatchKind] = useState<"account" | "keyword">("account");
  const [watchValue, setWatchValue] = useState("");

  const copy = useMemo(() => ({
    title: en ? "X Content Pipeline" : "X 内容流水线",
    body: en
      ? "Every morning the pipeline drafts posts from your opportunity radar and watchlist, generates one illustration, and waits here for your review. Replies ride the same gate."
      : "每天早上自动从机会雷达和监听清单取选题、起草英文帖并生成配图，先在这里等你过目再发布；互动回复走同一道审核闸。",
    connect: en
      ? "Publishing runs as the X account connected in Settings. Connect it with posting permission before flipping the pipeline on."
      : "发布以设置页连接的 X 账号执行。开启流水线前请先在设置中连接并授予发布权限。",
    queueTitle: en ? "Awaiting your review" : "待审核队列",
    queueEmpty: en ? "Nothing waiting. New drafts land here every morning at 08:00." : "暂无待审内容。每天早上 8 点会自动产出新草稿。",
    recentTitle: en ? "Scheduled & published" : "已排期与已发布",
    settingsTitle: en ? "Pipeline settings" : "流水线设置",
    generation: en ? "Morning drafts (08:00)" : "早间生成（8:00）",
    engagement: en ? "Engagement replies (20:30)" : "互动回复（20:30）",
    reviewEvery: en ? "Review every post" : "逐条审核",
    reviewSpot: en ? "Spot check (auto-publish)" : "抽检（自动发布）",
    reviewJev: en ? "Auto review (borderline → you)" : "自动审核（边界转人工）",
    reviewJevHint: en
      ? "Every draft passes an automated quality gate: high-confidence ones publish on schedule, anything borderline lands here for you. Gate outages fall back to manual review."
      : "每条草稿先过自动质量闸：高置信自动排期发布，边界的转到这里等你。闸门故障时自动回落人工审核。",
    postLimit: en ? "Daily post limit" : "每日帖子上限",
    replyLimit: en ? "Daily reply limit" : "每日回复上限",
    paused: en ? "Paused (circuit breaker)" : "已暂停（熔断）",
    watchTitle: en ? "Watchlist" : "监听清单",
    watchHint: en
      ? "Accounts drive reply targeting; keywords feed both topic selection and discovery."
      : "账号用于互动回复的目标发现；关键词同时喂给选题和发现。",
    add: en ? "Add" : "添加",
    account: en ? "Account" : "账号",
    keyword: en ? "Keyword" : "关键词",
    approve: en ? "Approve & schedule" : "批准并排期",
    reject: en ? "Reject" : "拒绝",
    cancel: en ? "Cancel" : "取消",
    tweet: en ? "open" : "打开",
    edited: en ? "edited" : "已改",
    threadLabel: en ? "original thread" : "原创推文串",
    postLabel: en ? "original post" : "原创单帖",
    replyLabel: en ? "engagement reply" : "互动回复",
    replyTo: en ? "Replying to" : "回复目标",
    imageAlt: en ? "Generated illustration" : "生成的配图",
    sourceRadar: en ? "radar" : "雷达",
    sourceWatchlist: en ? "watchlist" : "监听",
    sourceManual: en ? "manual" : "手动",
    tweetOf: en ? "tweet" : "第"
  }), [en]);

  const load = useCallback(async () => {
    try {
      const [jobsResponse, settingsResponse, watchResponse] = await Promise.all([
        fetch("/api/x-pipeline/jobs", { cache: "no-store" }),
        fetch("/api/x-pipeline/settings", { cache: "no-store" }),
        fetch("/api/x-pipeline/watchlist", { cache: "no-store" })
      ]);
      if (jobsResponse.ok) setJobs((await jobsResponse.json()).jobs ?? []);
      if (settingsResponse.ok) setSettings((await settingsResponse.json()).settings ?? null);
      if (watchResponse.ok) setWatchlist((await watchResponse.json()).entries ?? []);
    } catch {
      setError(en ? "Could not load the pipeline." : "流水线数据加载失败。");
    }
  }, [en]);

  useEffect(() => {
    void load();
  }, [load]);

  const awaiting = (jobs ?? []).filter((job) => job.status === "needs_approval");
  const recent = (jobs ?? []).filter((job) => job.status !== "needs_approval").slice(0, 20);

  const decide = async (job: PublicJob, decision: "approve" | "reject", revised?: string[]) => {
    setBusy(job.id);
    setError(null);
    try {
      const response = await fetch(`/api/x-pipeline/jobs/${job.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(revised ? { revisedTweets: revised.map((text) => ({ text, mediaUrl: null })) } : {}) })
      });
      if (!response.ok) {
        setError((await response.json().catch(() => ({}))).error ?? "Request failed.");
        return;
      }
      setEdits((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const patchSettings = async (patch: Partial<Settings>) => {
    const response = await fetch("/api/x-pipeline/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (response.ok) setSettings((await response.json()).settings ?? null);
  };

  const addWatchlist = async () => {
    const value = watchValue.trim();
    if (!value) return;
    const response = await fetch("/api/x-pipeline/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: watchKind, value })
    });
    if (response.ok) {
      setWatchlist((await response.json()).entries ?? []);
      setWatchValue("");
    }
  };

  const toggleWatchlist = async (id: string, active: boolean) => {
    const response = await fetch("/api/x-pipeline/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active })
    });
    if (response.ok) setWatchlist((await response.json()).entries ?? []);
  };

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-action/10 blur-3xl" />
        <div className="relative max-w-4xl">
          <p className="eyebrow">X / Twitter</p>
          <h1 className="mt-4 text-balance text-3xl font-black leading-tight text-fg md:text-4xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted">{copy.body}</p>
          <p className="mt-3 max-w-2xl text-xs font-semibold leading-5 text-fg-muted">{copy.connect}</p>
        </div>
      </Panel>

      {error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk/10 px-4 py-3 text-xs font-semibold leading-5 text-risk">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <Panel className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-fg">{copy.queueTitle}</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{awaiting.length}</span>
            </div>
            {jobs === null ? (
              <p className="mt-4 text-xs font-semibold text-fg-muted">…</p>
            ) : awaiting.length === 0 ? (
              <p className="mt-4 text-xs font-semibold leading-5 text-fg-muted">{copy.queueEmpty}</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {awaiting.map((job) => {
                  const revised = edits[job.id];
                  const kindLabel = job.kind === "thread" ? copy.threadLabel : job.kind === "reply" ? copy.replyLabel : copy.postLabel;
                  return (
                    <li key={job.id} className="rounded-2xl border border-border/60 bg-surface-2/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-fg-muted">
                        <span className="rounded-full bg-action/10 px-2 py-0.5 text-action">{kindLabel}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5">
                          {job.snapshot.topic.source === "radar" ? copy.sourceRadar : job.snapshot.topic.source === "watchlist" ? copy.sourceWatchlist : copy.sourceManual}
                        </span>
                        {job.kind !== "reply" ? <span className="truncate">{job.snapshot.topic.title}</span> : null}
                        {job.autoReview ? <AutoReviewBadge record={job.autoReview} en={en} /> : null}
                        {revised ? <span className="text-warn">{copy.edited}</span> : null}
                      </div>
                      {job.kind === "reply" ? (
                        <a
                          href={job.snapshot.notes ?? `https://x.com/i/web/status/${job.snapshot.replyToTweetId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 block rounded-2xl border border-border/70 bg-black/25 p-3 transition hover:border-action/40"
                        >
                          <span className="flex items-center gap-2">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action/15 text-xs font-black text-action">
                              {(job.snapshot.replyContext?.handle ?? "@x").replace("@", "").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-black text-fg">{job.snapshot.replyContext?.handle ?? "@unknown"}</span>
                              <span className="block text-[10px] font-bold text-fg-muted">{copy.replyTo}</span>
                            </span>
                          </span>
                          {job.snapshot.replyContext?.text ? (
                            <span className="mt-2 line-clamp-3 block text-xs leading-5 text-fg-muted">
                              {job.snapshot.replyContext.text}
                            </span>
                          ) : null}
                          <span className="mt-2 block text-[10px] font-bold text-action">{copy.tweet} ↗</span>
                        </a>
                      ) : null}
                      <div className="mt-3 grid gap-2">
                        {job.snapshot.tweets.map((tweet, index) => (
                          <div key={index}>
                            {tweet.mediaUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- remote generated-image URLs, not static assets
                              <img src={tweet.mediaUrl} alt={copy.imageAlt} className="mb-2 max-h-64 w-full rounded-xl object-cover" />
                            ) : null}
                            <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-fg-muted">
                              <span>{job.kind === "thread" ? `${copy.tweetOf} ${index + 1}/${job.snapshot.tweets.length}` : null}</span>
                            </div>
                            <textarea
                              value={revised?.[index] ?? tweet.text}
                              rows={Math.min(4, Math.ceil((revised?.[index] ?? tweet.text).length / 70) + 1)}
                              onChange={(event) => setEdits((current) => ({
                                ...current,
                                [job.id]: (current[job.id] ?? job.snapshot.tweets.map((item) => item.text)).map((text, i) => i === index ? event.target.value : text)
                              }))}
                              className="w-full resize-y rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm leading-6 text-fg focus-ring"
                              maxLength={280}
                            />
                            <div className="mt-0.5 text-right text-[10px] font-bold text-fg-muted">{(revised?.[index] ?? tweet.text).length}/280</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled={busy === job.id} onClick={() => decide(job, "approve", revised ?? undefined)}>{copy.approve}</Button>
                        <Button size="sm" variant="danger" disabled={busy === job.id} onClick={() => decide(job, "reject")}>{copy.reject}</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.recentTitle}</h2>
            {recent.length === 0 ? (
              <p className="mt-4 text-xs font-semibold text-fg-muted">—</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {recent.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">{job.statusLabel}</span>
                      {job.autoReview ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${job.autoReview.decision === "approved" ? "bg-action/10 text-action" : "bg-warn/10 text-warn"}`}
                          title={job.autoReview.reasons.join(", ")}
                        >
                          {job.autoReview.decision === "approved" ? (en ? "auto-approved" : "自动放行") : en ? "flagged → you" : "转人工"}
                        </span>
                      ) : null}
                      <span className="truncate font-semibold text-fg">{job.snapshot.tweets[0]?.text.slice(0, 80) ?? "…"}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {job.error ? <span className="max-w-64 truncate text-risk" title={job.error}>{job.error}</span> : null}
                      {job.tweetUrl ? (
                        <a href={job.tweetUrl} target="_blank" rel="noreferrer" className="font-bold text-action hover:underline">{copy.tweet} ↗</a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-5">
          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.settingsTitle}</h2>
            {settings ? (
              <div className="mt-4 grid gap-4 text-xs font-semibold text-fg-muted">
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.generation}</span>
                  <Switch checked={settings.generationEnabled} onCheckedChange={(value) => patchSettings({ generationEnabled: value })} label={copy.generation} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.engagement}</span>
                  <Switch checked={settings.engagementEnabled} onCheckedChange={(value) => patchSettings({ engagementEnabled: value })} label={copy.engagement} />
                </label>
                <label className="grid gap-1">
                  <span>{en ? "Review mode" : "审核模式"}</span>
                  <select
                    value={settings.reviewMode}
                    onChange={(event) => patchSettings({ reviewMode: event.target.value as Settings["reviewMode"] })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  >
                    <option value="every_post">{copy.reviewEvery}</option>
                    <option value="spot_check">{copy.reviewSpot}</option>
                    <option value="jev_guarded">{copy.reviewJev}</option>
                  </select>
                  {settings.reviewMode === "jev_guarded" ? (
                    <span className="text-[10px] font-semibold leading-4 text-fg-muted">{copy.reviewJevHint}</span>
                  ) : null}
                </label>
                <label className="grid gap-1">
                  <span>{copy.postLimit}</span>
                  <input
                    type="number" min={0} max={10} value={settings.dailyPostLimit}
                    onChange={(event) => patchSettings({ dailyPostLimit: Number(event.target.value) })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  />
                </label>
                <label className="grid gap-1">
                  <span>{copy.replyLimit}</span>
                  <input
                    type="number" min={0} max={30} value={settings.dailyReplyLimit}
                    onChange={(event) => patchSettings({ dailyReplyLimit: Number(event.target.value) })}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-bold text-fg focus-ring"
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>{copy.paused}</span>
                  <Switch checked={settings.paused} onCheckedChange={(value) => patchSettings({ paused: value, pausedReason: value ? "manual" : null })} label={copy.paused} />
                </label>
              </div>
            ) : (
              <p className="mt-4 text-xs font-semibold text-fg-muted">…</p>
            )}
          </Panel>

          <Panel className="p-5 md:p-6">
            <h2 className="text-sm font-black text-fg">{copy.watchTitle}</h2>
            <p className="mt-2 text-[11px] font-semibold leading-5 text-fg-muted">{copy.watchHint}</p>
            <div className="mt-3 flex gap-2">
              <select
                value={watchKind}
                onChange={(event) => setWatchKind(event.target.value as "account" | "keyword")}
                className="rounded-xl border border-border/60 bg-surface px-2 py-2 text-xs font-bold text-fg focus-ring"
              >
                <option value="account">{copy.account}</option>
                <option value="keyword">{copy.keyword}</option>
              </select>
              <input
                value={watchValue}
                onChange={(event) => setWatchValue(event.target.value)}
                placeholder={watchKind === "account" ? "@handle" : en ? "keyword" : "关键词"}
                className="min-w-0 flex-1 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs font-semibold text-fg focus-ring"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addWatchlist();
                }}
              />
              <Button size="sm" onClick={addWatchlist}>{copy.add}</Button>
            </div>
            {watchlist === null ? null : watchlist.length === 0 ? (
              <p className="mt-3 text-xs font-semibold text-fg-muted">—</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {watchlist.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                        {entry.kind === "account" ? copy.account : copy.keyword}
                      </span>
                      <span className="truncate font-semibold text-fg">{entry.kind === "account" ? `@${entry.value}` : entry.value}</span>
                    </div>
                    <Switch checked={entry.active} onCheckedChange={(value) => toggleWatchlist(entry.id, value)} label={entry.value} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
