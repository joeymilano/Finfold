"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  Loader2,
  Paperclip,
  Sparkles,
  X
} from "@/components/ui/icons";
import { AccountInvestigationReportCard } from "@/components/app-shell/AccountInvestigationReportCard";
import { addToast } from "@/components/ui/Toast";
import { useLocale } from "@/hooks/useLocale";
import type { AgentAttachment } from "@/lib/agent/attachments";
import type { AccountInvestigation, AccountDiagnosisPlatform } from "@/lib/agent/account-investigation";
import { OPEN_GLOBAL_AGENT_EVENT } from "@/lib/agent/presentation";
import { parseAccountHealthIntake, type AccountHealthConcern } from "@/lib/account-health-intake";
import { captureEvent } from "@/lib/posthog";

type ConnectedAccount = { id: string; handle: string | null; displayName: string | null; isSelected: boolean };

const PLATFORM_LABELS: Record<AccountDiagnosisPlatform, { zh: string; en: string }> = {
  xiaohongshu: { zh: "小红书", en: "Xiaohongshu" },
  x: { zh: "X", en: "X" },
  reddit: { zh: "Reddit", en: "Reddit" },
  linkedin: { zh: "LinkedIn", en: "LinkedIn" }
};

const CONCERN_LABELS: Record<AccountHealthConcern, { zh: string; en: string }> = {
  general: { zh: "全面体检", en: "Full check" },
  low_reach: { zh: "流量下降", en: "Reach drop" },
  suspected_restriction: { zh: "疑似限流", en: "Suspected restriction" },
  suspended: { zh: "账号受限", en: "Account restricted" },
  content_removed: { zh: "内容被移除", en: "Content removed" }
};

const LOADING_STEPS = {
  zh: ["读账号和 Post", "查流量异常", "扫风险词", "出诊断报告"],
  en: ["Reading account and posts", "Checking reach", "Scanning risky wording", "Building the report"]
} as const;

export function AccountHealthCenter() {
  const locale = useLocale();
  const zh = locale === "zh";
  const [intake, setIntake] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [investigation, setInvestigation] = useState<AccountInvestigation | null>(null);
  const [xOAuthAvailable, setXOAuthAvailable] = useState(false);
  const [xAccounts, setXAccounts] = useState<ConnectedAccount[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);
  const parsedIntake = useMemo(() => parseAccountHealthIntake(intake), [intake]);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings/social-connections", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as {
          oauthConnectors?: { x?: boolean };
          connections?: Array<{ connectorId: string; status: string; accounts: ConnectedAccount[] }>;
        };
        if (!response.ok || !active) return;
        setXOAuthAvailable(data.oauthConnectors?.x === true);
        const accounts = (data.connections ?? [])
          .filter((item) => item.connectorId === "x" && item.status === "connected")
          .flatMap((item) => item.accounts);
        setXAccounts(accounts);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!submitting) {
      setLoadingStep(0);
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingStep((current) => Math.min(current + 1, LOADING_STEPS.zh.length - 1));
    }, 1200);
    return () => window.clearInterval(interval);
  }, [submitting]);

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    const images = Array.from(nextFiles).filter((file) => file.type.startsWith("image/"));
    setFiles((current) => [...current, ...images].slice(0, 6));
    if (images.length !== nextFiles.length) {
      addToast("warning", zh ? "只收图片" : "Images only");
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function connectX() {
    try {
      const response = await fetch("/api/settings/social-connections/x/authorize", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? (zh ? "无法连接 X" : "Could not connect X"));
      window.location.assign(data.url);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : (zh ? "无法连接 X" : "Could not connect X"));
    }
  }

  async function submitDiagnosis(connectedAccountId?: string) {
    if (!connectedAccountId && !parsedIntake.accountUrl && files.length === 0) {
      setError(zh
        ? "贴主页链接，或加截图。"
        : "Add a profile link or screenshot.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSaveWarning("");
    setInvestigation(null);
    captureEvent("account_health_started", {
      platform: connectedAccountId ? "x" : parsedIntake.platform ?? "unknown",
      concern: parsedIntake.concern,
      source: connectedAccountId ? "oauth" : parsedIntake.accountUrl ? "smart_intake" : "screenshot",
      screenshot_count: files.length
    });

    try {
      const attachments = files.length > 0 ? await uploadScreenshots(files, zh) : [];
      const response = await fetch("/api/agent/account-health/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeText: connectedAccountId ? undefined : intake.trim(),
          connectedAccountId,
          platform: parsedIntake.platform,
          attachments,
          locale
        })
      });
      const data = await response.json() as { investigation?: AccountInvestigation; snapshotSaved?: boolean; error?: string };
      if (!response.ok || !data.investigation) {
        throw new Error(data.error ?? (zh ? "诊断失败，请重试" : "Diagnosis failed. Try again"));
      }
      setInvestigation(data.investigation);
      if (data.snapshotSaved === false) {
        setSaveWarning(zh ? "报告好了，但没存上。先别刷新。" : "The report is ready but wasn’t saved. Don’t refresh yet.");
      }
      captureEvent("account_health_completed", {
        platform: data.investigation.platform,
        concern: parsedIntake.concern,
        evidence_level: data.investigation.evidenceLevel,
        case_state: data.investigation.report.caseState,
        content_risk_count: data.investigation.report.contentRisks?.length ?? 0,
        snapshot_saved: data.snapshotSaved !== false
      });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : (zh ? "没诊断出来，再试一次。" : "Couldn’t finish the check. Try again.");
      setError(message);
      addToast("error", message);
    } finally {
      setSubmitting(false);
    }
  }

  function askAgent(prompt: string) {
    captureEvent("account_health_workbench_clicked", {
      platform: investigation?.platform,
      case_state: investigation?.report.caseState
    });
    window.dispatchEvent(new CustomEvent(OPEN_GLOBAL_AGENT_EVENT, { detail: { prompt } }));
  }

  const platformLabel = parsedIntake.platform ? PLATFORM_LABELS[parsedIntake.platform][zh ? "zh" : "en"] : null;
  const concernLabel = CONCERN_LABELS[parsedIntake.concern][zh ? "zh" : "en"];
  const steps = LOADING_STEPS[zh ? "zh" : "en"];
  const postCount = parsedIntake.posts.length;

  return (
    <main className="mx-auto max-w-[1240px] pb-24 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <section className="px-1 py-9 sm:py-12">
        <h1 className="text-pretty text-4xl font-black leading-[1.06] tracking-[-0.045em] text-fg sm:text-5xl lg:text-[3.5rem]">
          {zh ? "账号体检，交给 Finfold" : "Finfold checks the account"}
        </h1>
      </section>

      <section className="mx-auto max-w-4xl overflow-hidden rounded-[1.55rem] border border-hairline bg-surface shadow-panel">
        {xAccounts.length > 0 || xOAuthAvailable ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-6">
            <span className="mr-1 text-xs font-black text-fg-muted">{zh ? "X 已连接" : "X connected"}</span>
            {xAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={submitting}
                onClick={() => void submitDiagnosis(account.id)}
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-action/30 bg-action/[0.06] px-3 py-1.5 text-xs font-black text-fg transition hover:border-action disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
                {zh ? `体检 ${account.handle ?? account.displayName ?? "X"}` : `Check ${account.handle ?? account.displayName ?? "X"}`}
              </button>
            ))}
            {xAccounts.length === 0 && xOAuthAvailable ? (
              <button type="button" onClick={() => void connectX()} className="focus-ring inline-flex items-center gap-2 rounded-full border border-action/30 px-3 py-1.5 text-xs font-black text-action-strong dark:text-action">
                <Link2 className="h-3.5 w-3.5" />{zh ? "连接 X" : "Connect X"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="relative p-4 sm:p-6">
          <textarea
            value={intake}
            onChange={(event) => setIntake(event.target.value)}
            maxLength={12_000}
            disabled={submitting}
            aria-label={zh ? "账号诊断输入" : "Account diagnosis input"}
            className="focus-ring min-h-44 w-full resize-y bg-transparent px-1 text-base font-semibold leading-7 text-fg outline-none placeholder:font-medium placeholder:text-fg-subtle sm:min-h-52 sm:text-lg sm:leading-8"
            placeholder={zh
              ? "主页链接、Post、数据、通知，都可以贴"
              : "Profile link, posts, analytics, or notices"}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-3 py-1.5 text-[11px] font-black text-fg transition hover:border-action/45">
              <Paperclip className="h-3.5 w-3.5 text-action" />{zh ? "加截图" : "Add screenshots"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} />
            </label>
            {files.map((file, index) => (
              <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-positive/10 py-1 pl-2.5 pr-1 text-[11px] font-black text-positive">
                {zh ? `截图 ${index + 1}` : `Shot ${index + 1}`}
                <button type="button" onClick={() => removeFile(index)} disabled={submitting} aria-label={zh ? `删除截图 ${index + 1}` : `Remove screenshot ${index + 1}`} className="focus-ring flex h-5 w-5 items-center justify-center rounded-full hover:bg-positive/10 disabled:opacity-40">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {submitting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/95 backdrop-blur-sm">
              <div className="w-full max-w-sm px-6">
                <div className="mb-5 flex items-center gap-3 text-sm font-black text-fg"><Loader2 className="h-4 w-4 animate-spin text-action" />{steps[loadingStep]}</div>
                <div className="grid gap-2">
                  {steps.map((step, index) => (
                    <div key={step} className={`h-1 rounded-full transition-all duration-500 ${index <= loadingStep ? "bg-action" : "bg-hairline"}`} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-hairline bg-surface-2/45 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-fg-muted">
            {platformLabel ? <span className="rounded-full border border-positive/25 bg-positive/[0.06] px-2.5 py-1 text-positive">{platformLabel}</span> : null}
            {intake.trim() || files.length > 0 ? <span>{concernLabel}</span> : <span>{zh ? "自动识别平台、问题和证据" : "Detects platform, issue, and evidence"}</span>}
            {postCount > 0 ? <span>· {postCount} Post</span> : null}
            {files.length > 0 ? <span>· {zh ? `${files.length} 张截图` : `${files.length} screenshots`}</span> : null}
          </div>
          <button type="button" onClick={() => void submitDiagnosis()} disabled={submitting} className="btn-primary focus-ring min-h-11 shrink-0 justify-center px-5 text-sm disabled:opacity-55">
            <Sparkles className="h-4 w-4" />{zh ? "开始体检" : "Start check"}<ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="mx-auto mt-3 max-w-4xl px-2 text-center text-xs font-semibold leading-5 text-fg-muted">
        {zh ? "只看证据，不乱判限流" : "Evidence first. No fake shadowban claims."}
      </div>

      {error ? <p role="alert" className="mx-auto mt-4 max-w-4xl rounded-xl border border-risk/25 bg-risk/[0.06] px-4 py-3 text-xs font-semibold leading-5 text-risk">{error}</p> : null}
      {saveWarning ? <p role="status" className="mx-auto mt-4 max-w-4xl rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3 text-xs font-semibold leading-5 text-warn">{saveWarning}</p> : null}
      {investigation ? <div ref={resultRef} className="scroll-mt-24 pt-5"><AccountInvestigationReportCard investigation={investigation} locale={locale} onAskAgent={askAgent} /></div> : null}
    </main>
  );
}

async function uploadScreenshots(files: File[], zh: boolean): Promise<AgentAttachment[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  const response = await fetch("/api/agent/attachments", { method: "POST", body: formData });
  const data = await response.json() as { attachments?: AgentAttachment[]; error?: string };
  if (!response.ok || !data.attachments) throw new Error(data.error ?? (zh ? "截图上传失败" : "Screenshot upload failed"));
  return data.attachments.filter((attachment) => attachment.kind === "image");
}
