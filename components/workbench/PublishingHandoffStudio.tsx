/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clipboard,
  Download,
  FileStack,
  Loader2,
  ShieldCheck,
  X
} from "@/components/ui/icons";
import type { KitOutput } from "@/lib/content-schema";
import { displayContentTitle } from "@/lib/content-title";
import type { Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";
import { buildPublicationHtml, buildStandalonePublicationHtml } from "@/lib/publication-html";
import {
  buildPublishingHandoffManifest,
  getPublishingHandoffProfile,
  publishingBody,
  publishingImageUrls,
  validatePublishingHandoff
} from "@/lib/publishing-handoff";

type Props = {
  output: KitOutput;
  kitId?: string;
  locale: Locale;
  canExport?: boolean;
  onLockedExport?: () => void;
  onConfirmImageRights?: () => Promise<boolean>;
  onPrepareImages?: () => void;
  onScheduled?: (mode: "draft_only" | "scheduled_publish") => void;
  onClose: () => void;
};

type PublishingCapability = {
  canCreateDraft: boolean;
  canSubmitPublish: boolean;
  blockers: string[];
  verified: boolean;
  serviceType: number | null;
};

type PublishingAccount = {
  id: string;
  displayName: string | null;
  handle: string | null;
  isSelected: boolean;
  publishingCapability: PublishingCapability;
};

type PublicationJob = {
  id: string;
  mode: "draft_only" | "scheduled_publish";
  status: string;
  statusLabel: string;
  scheduledFor: string;
  articleUrl: string | null;
  error: string | null;
  accountName?: string | null;
  jevReviewed?: { decision: "pass" | "overridden" } | null;
};

const TERMINAL_JOB_STATUSES = new Set([
  "published",
  "draft_ready",
  "failed",
  "cancelled",
  "removed",
  "blocked",
  "needs_reapproval",
  "attention_required"
]);

function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultPublishTime(): string {
  const date = new Date(Date.now() + 5 * 60_000);
  date.setSeconds(0, 0);
  return toDateTimeLocal(date.toISOString());
}

export function PublishingHandoffStudio({
  output,
  kitId,
  locale,
  canExport = true,
  onLockedExport,
  onConfirmImageRights,
  onPrepareImages,
  onScheduled,
  onClose
}: Props) {
  const [copied, setCopied] = useState<"title" | "body" | "cover" | null>(null);
  const [publishingAccounts, setPublishingAccounts] = useState<PublishingAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"draft_only" | "scheduled_publish">("draft_only");
  const [scheduledFor, setScheduledFor] = useState(defaultPublishTime);
  const [publishingLoading, setPublishingLoading] = useState(false);
  const [publishingError, setPublishingError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PublicationJob[]>([]);
  const [jevBlocked, setJevBlocked] = useState<{ accounts: PublishingAccount[]; findings: string[] } | null>(null);
  const presentableOutput = useMemo(
    () => ({ ...output, title: displayContentTitle(output.title, locale) }),
    [locale, output]
  );
  const profile = getPublishingHandoffProfile(output.platform);
  const bodyHtml = useMemo(
    () => buildPublicationHtml(presentableOutput, "default", { includeTitle: false, includeAttribution: false }),
    [presentableOutput]
  );
  const previewHtml = useMemo(
    () => buildStandalonePublicationHtml(presentableOutput, "default", locale),
    [locale, presentableOutput]
  );
  const checks = useMemo(
    () => validatePublishingHandoff(presentableOutput, locale),
    [locale, presentableOutput]
  );
  const images = useMemo(() => publishingImageUrls(presentableOutput), [presentableOutput]);
  const passed = checks.filter((check) => check.ok).length;
  const selectedAccounts = publishingAccounts.filter((account) => selectedAccountIds.includes(account.id));
  const anySelectedCanSubmitPublish = selectedAccounts.some((account) => account.publishingCapability.canSubmitPublish);
  const onlinePublishingAvailable = output.platform === "wechat"
    && Boolean(kitId && output.id && output.updatedAt)
    && selectedAccounts.some((account) => account.publishingCapability.canCreateDraft);

  useEffect(() => {
    if (output.platform !== "wechat" || !kitId || !output.id || !output.updatedAt) return;
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/settings/social-connections", { cache: "no-store", signal: controller.signal }),
      fetch("/api/operations/program/tasks", { cache: "no-store", signal: controller.signal })
    ]).then(async ([connectionsResponse, queueResponse]) => {
      const connectionData = await connectionsResponse.json() as {
        connections?: Array<{
          connectorId: string;
          status: string;
          accounts: Array<PublishingAccount>;
        }>;
      };
      const wechat = connectionData.connections?.find((connection) => (
        connection.connectorId === "wechat" && connection.status === "connected"
      ));
      const accounts = (wechat?.accounts ?? []).filter((account) => account.publishingCapability?.canCreateDraft);
      setPublishingAccounts(accounts);
      captureEvent(accounts.length > 0 ? "wechat_smart_publishing_available" : "wechat_publishing_fallback_shown", {
        account_count: accounts.length
      });
      const preferred = accounts.find((account) => account.isSelected) ?? accounts[0];
      if (preferred) {
        setSelectedAccountIds([preferred.id]);
        setMode(preferred.publishingCapability.canSubmitPublish ? "scheduled_publish" : "draft_only");
      }
      if (queueResponse.ok) {
        const queueData = await queueResponse.json() as {
          queue?: { tasks?: Array<{ platform?: string; status?: string; dueAt?: string }> } | null;
        };
        const next = queueData.queue?.tasks
          ?.filter((task) => task.platform === "wechat" && task.status === "open" && task.dueAt && Date.parse(task.dueAt) > Date.now())
          .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))[0];
        if (next?.dueAt) setScheduledFor(toDateTimeLocal(next.dueAt));
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [kitId, output.id, output.platform, output.updatedAt]);

  useEffect(() => {
    if (mode === "scheduled_publish" && selectedAccounts.length > 0 && !anySelectedCanSubmitPublish) {
      setMode("draft_only");
    }
  }, [mode, selectedAccounts.length, anySelectedCanSubmitPublish]);

  useEffect(() => {
    if (jobs.length === 0 || jobs.every((job) => TERMINAL_JOB_STATUSES.has(job.status))) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void Promise.all(jobs.map((job) => {
        if (TERMINAL_JOB_STATUSES.has(job.status)) return Promise.resolve(null);
        return fetch(`/api/wechat-publications/${encodeURIComponent(job.id)}`, {
          cache: "no-store",
          signal: controller.signal
        }).then(async (response) => {
          const data = await response.json() as { job?: PublicationJob };
          return response.ok && data.job ? data.job : null;
        }).catch(() => null);
      })).then((updates) => {
        setJobs((current) => current.map((job, index) => {
          const update = updates[index];
          return update ? { ...update, accountName: job.accountName } : job;
        }));
      }).catch(() => undefined);
    }, 4_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [jobs]);

  if (!profile) return null;
  const handoffProfile = profile;

  function guardExport(): boolean {
    if (canExport) return true;
    onLockedExport?.();
    return false;
  }

  async function copyTitle() {
    if (!guardExport()) return;
    await navigator.clipboard.writeText(presentableOutput.title);
    showCopied("title");
  }

  async function copyBody() {
    if (!guardExport()) return;
    const plainBody = publishingBody(presentableOutput);
    if (handoffProfile.copyFormat === "rich_html" && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([bodyHtml], { type: "text/html" }),
          "text/plain": new Blob([plainBody], { type: "text/plain" })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(plainBody);
    }
    showCopied("body");
  }

  function showCopied(target: "title" | "body" | "cover") {
    setCopied(target);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function downloadCoverImage() {
    if (!guardExport()) return;
    const url = output.imageUrl;
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
      downloadBlob(`finfold-wechat-cover-${new Date().toISOString().slice(0, 10)}.${ext}`, blob);
      showCopied("cover");
    } catch {
      // Cross-origin fetch refused or transient failure: opening the image
      // keeps a one-right-click save path alive instead of dead-ending.
      window.open(url, "_blank", "noopener");
    }
  }

  async function downloadManifest() {
    if (!guardExport()) return;
    if (images.length > 0 && onConfirmImageRights && !(await onConfirmImageRights())) return;
    downloadFile(
      `finfold-${output.platform}-publishing-handoff-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(buildPublishingHandoffManifest(presentableOutput, locale), null, 2),
      "application/json"
    );
  }

  async function schedulePublication() {
    if (!kitId || !output.id || !output.updatedAt || selectedAccounts.length === 0) return;
    if (!guardExport()) return;
    if (images.length > 0 && onConfirmImageRights && !(await onConfirmImageRights())) return;
    setPublishingLoading(true);
    setPublishingError(null);
    setJevBlocked(null);
    captureEvent("wechat_publication_confirmation_started", { mode, accountCount: selectedAccounts.length });
    const accepted: PublicationJob[] = [];
    const failures: string[] = [];
    const blockedAccounts: PublishingAccount[] = [];
    const blockedFindings: string[] = [];
    for (const account of selectedAccounts) {
      const accountMode = mode === "scheduled_publish" && !account.publishingCapability.canSubmitPublish
        ? "draft_only"
        : mode;
      try {
        const response = await fetch(`/api/kits/${encodeURIComponent(kitId)}/outputs/${encodeURIComponent(output.id)}/wechat-publications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            mode: accountMode,
            scheduledFor: accountMode === "draft_only" ? new Date().toISOString() : new Date(scheduledFor).toISOString(),
            contentVersion: output.updatedAt,
            idempotencyKey: crypto.randomUUID(),
            theme: "default"
          })
        });
        const data = await response.json() as { job?: PublicationJob; error?: string; findings?: string[]; code?: string };
        if (response.status === 409 && data.code === "jev_review_blocked") {
          blockedAccounts.push(account);
          for (const finding of data.findings ?? []) {
            if (!blockedFindings.includes(finding)) blockedFindings.push(finding);
          }
          continue;
        }
        if (!response.ok || !data.job) throw new Error(data.error || (locale === "zh" ? "暂时无法安排发布。" : "Could not schedule publishing."));
        accepted.push({ ...data.job, accountName: account.displayName || account.handle });
        captureEvent("wechat_publication_task_accepted", { mode: accountMode, status: data.job.status });
      } catch (error) {
        const label = account.displayName || account.handle || account.id;
        failures.push(`${label}: ${error instanceof Error ? error.message : (locale === "zh" ? "暂时无法安排发布。" : "Could not schedule publishing.")}`);
      }
    }
    setPublishingLoading(false);
    setJevBlocked(blockedAccounts.length > 0 ? { accounts: blockedAccounts, findings: blockedFindings } : null);
    if (accepted.length > 0) {
      setJobs(accepted);
      onScheduled?.(mode);
    }
    if (failures.length > 0) {
      captureEvent("wechat_publication_task_failed", { mode, accountCount: failures.length });
      setPublishingError(failures.join(" · "));
    }
  }

  async function retryBlockedAfterJev() {
    if (!kitId || !output.id || !output.updatedAt || !jevBlocked) return;
    if (images.length > 0 && onConfirmImageRights && !(await onConfirmImageRights())) return;
    setPublishingLoading(true);
    setPublishingError(null);
    const accepted: PublicationJob[] = [];
    const failures: string[] = [];
    for (const account of jevBlocked.accounts) {
      const accountMode = mode === "scheduled_publish" && !account.publishingCapability.canSubmitPublish
        ? "draft_only"
        : mode;
      try {
        const response = await fetch(`/api/kits/${encodeURIComponent(kitId)}/outputs/${encodeURIComponent(output.id)}/wechat-publications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            mode: accountMode,
            scheduledFor: accountMode === "draft_only" ? new Date().toISOString() : new Date(scheduledFor).toISOString(),
            contentVersion: output.updatedAt,
            idempotencyKey: crypto.randomUUID(),
            theme: "default",
            forceAfterJev: true
          })
        });
        const data = await response.json() as { job?: PublicationJob; error?: string };
        if (!response.ok || !data.job) throw new Error(data.error || (locale === "zh" ? "暂时无法安排发布。" : "Could not schedule publishing."));
        accepted.push({ ...data.job, accountName: account.displayName || account.handle });
      } catch (error) {
        const label = account.displayName || account.handle || account.id;
        failures.push(`${label}: ${error instanceof Error ? error.message : (locale === "zh" ? "暂时无法安排发布。" : "Could not schedule publishing.")}`);
      }
    }
    setPublishingLoading(false);
    if (accepted.length > 0) {
      // Already-accepted accounts are never re-sent (unique active job index).
      setJobs((current) => [...current, ...accepted]);
      setJevBlocked(null);
    }
    if (failures.length > 0) setPublishingError(failures.join(" · "));
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="publishing-handoff-title" className="fixed inset-0 z-50 flex items-center justify-center bg-fg/55 p-0 backdrop-blur-sm md:p-4">
      <div className="rk-enter flex h-dvh w-full max-w-[1280px] flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-[calc(100vh-2rem)] md:rounded-2xl 2xl:max-w-[1600px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-action/[0.12] text-action-strong dark:text-action">
              <FileStack className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="publishing-handoff-title" className="truncate text-sm font-bold text-fg">
                {locale === "zh" ? handoffProfile.titleZh : handoffProfile.titleEn}
              </h2>
              <p className="truncate text-[10px] text-fg-muted">
                {locale === "zh" ? handoffProfile.descriptionZh : handoffProfile.descriptionEn}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={locale === "zh" ? "关闭" : "Close"} className="focus-ring rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-hairline p-4 lg:border-b-0 lg:border-r lg:p-5">
            {onlinePublishingAvailable ? (
              <section className="rounded-xl border border-action/25 bg-action/[0.06] p-4" data-testid="wechat-smart-publishing">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-action-strong dark:text-action" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-fg">
                      {locale === "zh" ? "Finfold 自动完成发布准备" : "Finfold handles publishing preparation"}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-fg-muted">
                      {locale === "zh"
                        ? "你只确认这一次；图片上传、草稿、提交和结果追踪在后台完成。"
                        : "Confirm once; asset upload, draft creation, submission, and status tracking run in the background."}
                    </p>
                  </div>
                </div>

                {jobs.length > 0 ? (
                  <div className="mt-4 grid gap-2 rounded-lg border border-hairline bg-surface px-3 py-3" aria-live="polite">
                    {jobs.map((job) => (
                      <div key={job.id} className="grid gap-1">
                        <div className="flex items-center gap-2">
                          {!TERMINAL_JOB_STATUSES.has(job.status)
                            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-action-strong dark:text-action" />
                            : <Check className="h-3.5 w-3.5 shrink-0 text-positive" />}
                          <p className="min-w-0 truncate text-[10px] font-black text-fg">
                            {jobs.length > 1 && job.accountName ? `${job.accountName} · ` : ""}{job.statusLabel}
                          </p>
                          {job.jevReviewed ? (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${job.jevReviewed.decision === "overridden" ? "bg-warn/10 text-warn" : "bg-action/10 text-action"}`}>
                              {job.jevReviewed.decision === "overridden"
                                ? (locale === "zh" ? "已人工确认发布" : "Human-confirmed")
                                : (locale === "zh" ? "已通过内容质检" : "Passed content review")}
                            </span>
                          ) : null}
                        </div>
                        {job.error ? <p className="text-[9px] leading-4 text-warn">{job.error}</p> : null}
                        {job.articleUrl ? (
                          <a href={job.articleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-action-strong dark:text-action">
                            {locale === "zh" ? "查看已发布文章" : "Open published article"}<ArrowUpRight className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {publishingAccounts.length > 1 ? (
                      <fieldset className="grid gap-1.5">
                        <legend className="text-[10px] font-bold text-fg">
                          {locale === "zh" ? `公众号（已选 ${selectedAccountIds.length}/${publishingAccounts.length}）` : `Official Accounts (${selectedAccountIds.length}/${publishingAccounts.length})`}
                        </legend>
                        {publishingAccounts.map((account) => {
                          const checked = selectedAccountIds.includes(account.id);
                          return (
                            <label key={account.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${checked ? "border-action/45 bg-action/[0.07] text-fg" : "border-hairline bg-surface text-fg hover:bg-surface-2"}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedAccountIds((current) => {
                                    const next = current.includes(account.id)
                                      ? current.filter((id) => id !== account.id)
                                      : [...current, account.id];
                                    return next.length > 0 ? next : current;
                                  });
                                }}
                                className="focus-ring h-3.5 w-3.5 accent-action"
                              />
                              <span className="min-w-0 flex-1 truncate">{account.displayName || account.handle || account.id}</span>
                              {account.publishingCapability.canSubmitPublish ? null : (
                                <span className="shrink-0 text-[9px] font-bold text-fg-muted">{locale === "zh" ? "仅草稿" : "Draft only"}</span>
                              )}
                            </label>
                          );
                        })}
                      </fieldset>
                    ) : (
                      <label className="grid gap-1.5 text-[10px] font-bold text-fg">
                        {locale === "zh" ? "公众号" : "Official Account"}
                        <span className="rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-black text-fg">{selectedAccounts[0]?.displayName || selectedAccounts[0]?.handle}</span>
                      </label>
                    )}

                    {mode === "scheduled_publish" ? (
                      <label className="grid gap-1.5 text-[10px] font-bold text-fg">
                        <span className="flex items-center justify-between gap-2">
                          {locale === "zh" ? "发布时间" : "Publish time"}
                          <button type="button" onClick={() => setScheduledFor(toDateTimeLocal(new Date().toISOString()))} className="text-[9px] font-black text-action-strong hover:underline dark:text-action">
                            {locale === "zh" ? "立即" : "Now"}
                          </button>
                        </span>
                        <span className="relative">
                          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
                          <input type="datetime-local" value={scheduledFor} min={toDateTimeLocal(new Date().toISOString())} onChange={(event) => setScheduledFor(event.target.value)} className="focus-ring w-full rounded-lg border border-hairline bg-surface py-2 pl-9 pr-3 text-xs text-fg" />
                        </span>
                      </label>
                    ) : (
                      <p className="rounded-lg border border-hairline bg-surface px-3 py-2 text-[10px] leading-4 text-fg-muted">
                        {locale === "zh" ? "选中的账号当前仅支持自动同步草稿。" : "The selected accounts currently support automatic draft sync only."}
                      </p>
                    )}

                    {anySelectedCanSubmitPublish ? (
                      <details className="text-[9px] text-fg-muted">
                        <summary className="cursor-pointer font-bold">{locale === "zh" ? "发布方式" : "Publishing mode"}</summary>
                        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                          <button type="button" onClick={() => setMode("scheduled_publish")} className={`rounded-md px-2 py-1.5 font-bold ${mode === "scheduled_publish" ? "bg-surface text-fg shadow-sm" : "text-fg-muted"}`}>{locale === "zh" ? "正式发布" : "Publish"}</button>
                          <button type="button" onClick={() => setMode("draft_only")} className={`rounded-md px-2 py-1.5 font-bold ${mode === "draft_only" ? "bg-surface text-fg shadow-sm" : "text-fg-muted"}`}>{locale === "zh" ? "仅同步草稿" : "Draft only"}</button>
                        </div>
                      </details>
                    ) : null}

                    <button type="button" onClick={() => void schedulePublication()} disabled={publishingLoading || !scheduledFor} className="btn-primary focus-ring min-h-10 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-60">
                      {publishingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                      {publishingLoading
                        ? (locale === "zh" ? "正在接受任务…" : "Accepting…")
                        : mode === "scheduled_publish"
                          ? (locale === "zh" ? "确认并安排发布" : "Confirm and schedule")
                          : (locale === "zh" ? "确认并同步草稿" : "Confirm and sync draft")}
                    </button>
                    {publishingError ? <p role="alert" className="text-[9px] leading-4 text-warn">{publishingError}</p> : null}
                  </div>
                )}
                {jevBlocked ? (
                  <div className="mt-4 rounded-lg border border-warn/40 bg-warn/[0.05] px-3 py-3" role="alert">
                    <p className="text-[10px] font-black text-warn">
                      {locale === "zh"
                        ? `内容质检拦截了以下账号的发布：${jevBlocked.accounts.map((account) => account.displayName || account.handle || account.id).join("、")}`
                        : `Content review blocked publishing for: ${jevBlocked.accounts.map((account) => account.displayName || account.handle || account.id).join(", ")}`}
                    </p>
                    <ul className="mt-2 grid gap-1">
                      {jevBlocked.findings.map((finding) => (
                        <li key={finding} className="text-[9px] leading-4 text-fg-muted">· {finding}</li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => void retryBlockedAfterJev()} disabled={publishingLoading} className="focus-ring mt-3 rounded-lg border border-warn/40 px-3 py-1.5 text-[10px] font-bold text-warn transition hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-60">
                      {locale === "zh" ? "仍要发布" : "Publish anyway"}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : (
              <div className="rounded-xl border border-action/20 bg-action/[0.06] p-3">
                <p className="flex items-start gap-2 text-[10px] font-bold leading-5 text-fg">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-action-strong dark:text-action" />
                  {locale === "zh"
                    ? "Finfold 已准备好富文本、图片和清单；当前账号暂不具备联网发布条件，登录、最终预览与提交仍由你确认。"
                    : "Finfold prepared the rich text, images, and checklist. This account cannot publish online yet, so finish in the official editor."}
                </p>
              </div>
            )}

            <section className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{locale === "zh" ? "发布前检查" : "Preflight"}</p>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black ${passed === checks.length ? "bg-positive/10 text-positive" : "bg-warn/10 text-warn"}`}>
                  {passed}/{checks.length}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2">
                    {check.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" /> : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" />}
                    <div>
                      <p className="text-[10px] font-bold text-fg">{locale === "zh" ? check.labelZh : check.labelEn}</p>
                      {!check.ok ? <p className="mt-0.5 text-[9px] leading-4 text-fg-muted">{locale === "zh" ? check.detailZh : check.detailEn}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <details open={!onlinePublishingAvailable} className="mt-5 border-t border-hairline pt-4">
              <summary className="cursor-pointer text-[10px] font-black text-fg-muted hover:text-fg">
                {onlinePublishingAvailable
                  ? (locale === "zh" ? "需要时使用人工交接" : "Use manual handoff if needed")
                  : (locale === "zh" ? "人工发布交接" : "Manual publishing handoff")}
              </summary>
            <section className="mt-4">
              <p className="eyebrow">{locale === "zh" ? "交接步骤" : "Handoff steps"}</p>
              <ol className="mt-3 grid gap-2">
                {(locale === "zh" ? handoffProfile.stepsZh : handoffProfile.stepsEn).map((step, index) => (
                  <li key={step} className="flex gap-2 text-[10px] leading-5 text-fg-muted">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[9px] font-black text-fg">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-5 grid gap-2 border-t border-hairline pt-5">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void copyTitle()} className="btn-ghost focus-ring justify-center px-3 py-2.5 text-xs">
                  {copied === "title" ? <Check className="h-3.5 w-3.5 text-positive" /> : <Clipboard className="h-3.5 w-3.5" />}
                  {!canExport ? (locale === "zh" ? "升级后复制" : "Upgrade to copy") : copied === "title" ? (locale === "zh" ? "标题已复制" : "Title copied") : (locale === "zh" ? "复制标题" : "Copy title")}
                </button>
                <button type="button" onClick={() => void copyBody()} className="btn-primary focus-ring justify-center px-3 py-2.5 text-xs">
                  {copied === "body" ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                  {!canExport ? (locale === "zh" ? "升级后复制" : "Upgrade to copy") : copied === "body" ? (locale === "zh" ? "正文已复制" : "Body copied") : (locale === "zh" ? "复制正文" : "Copy body")}
                </button>
              </div>
              {handoffProfile.platform === "xiaohongshu" && onPrepareImages ? (
                <button type="button" onClick={onPrepareImages} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-2.5 text-xs font-bold text-fg hover:bg-surface-2">
                  <FileStack className="h-3.5 w-3.5" />{locale === "zh" ? "准备 3:4 图组" : "Prepare 3:4 carousel"}
                </button>
              ) : null}
              <a href={handoffProfile.editorUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-action/25 bg-action/[0.06] px-3 py-2.5 text-xs font-bold text-action-strong hover:bg-action/[0.1] dark:text-action">
                <ArrowUpRight className="h-3.5 w-3.5" />{locale === "zh" ? handoffProfile.editorLabelZh : handoffProfile.editorLabelEn}
              </a>
              {handoffProfile.platform === "wechat" && output.imageUrl ? (
                <button
                  type="button"
                  onClick={() => void downloadCoverImage()}
                  className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-2.5 text-xs font-bold text-fg hover:bg-surface-2"
                >
                  {copied === "cover" ? <Check className="h-3.5 w-3.5 text-positive" /> : <Download className="h-3.5 w-3.5" />}
                  {copied === "cover"
                    ? (locale === "zh" ? "封面已下载" : "Cover downloaded")
                    : locale === "zh" ? "下载封面" : "Download cover"}
                </button>
              ) : null}
              <button type="button" onClick={() => void downloadManifest()} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg">
                <Download className="h-3.5 w-3.5" />{locale === "zh" ? "下载发布清单" : "Download handoff manifest"}
              </button>
            </section>
            </details>
          </aside>

          <main className="min-h-0 overflow-auto bg-surface-2 p-4 md:p-8">
            {handoffProfile.copyFormat === "rich_html" ? (
              <div className="mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-hairline bg-white shadow-raised">
                <iframe title={locale === "zh" ? "长文发布预览" : "Article handoff preview"} srcDoc={previewHtml} sandbox="" className="h-[760px] w-full border-0 bg-white" />
              </div>
            ) : (
              <div className="mx-auto max-w-[430px] rounded-[30px] border border-hairline bg-surface p-4 shadow-raised">
                <div className="grid grid-cols-2 gap-2">
                  {images.length > 0 ? images.slice(0, 9).map((imageUrl, index) => (
                    <div key={imageUrl} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-2">
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                      <span className="absolute left-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-black/65 px-1 text-[9px] font-black text-white">{index + 1}</span>
                    </div>
                  )) : (
                    <div className="col-span-2 grid aspect-[3/2] place-items-center rounded-xl border border-dashed border-hairline bg-surface-2 text-xs text-fg-muted">
                      {locale === "zh" ? "尚未准备 3:4 图组" : "No 3:4 carousel yet"}
                    </div>
                  )}
                </div>
                <h3 className="mt-4 text-base font-black leading-6 text-fg">{presentableOutput.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg-muted">{publishingBody(presentableOutput)}</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function downloadFile(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadBlob(filename: string, blob: Blob) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
