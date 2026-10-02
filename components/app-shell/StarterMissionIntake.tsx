"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { captureEvent } from "@/lib/posthog";
import type { GrowthAudit, GrowthAuditObjective, GrowthOpportunity } from "@/lib/growth-audit";

type Locale = "zh" | "en";

const OBJECTIVES: Array<{
  value: GrowthAuditObjective;
  zh: string;
  en: string;
  detailZh: string;
  detailEn: string;
}> = [
  { value: "leads", zh: "获得线索", en: "Get leads", detailZh: "咨询、私信或表单", detailEn: "Inquiries, DMs, or forms" },
  { value: "signups", zh: "增加注册", en: "Grow signups", detailZh: "试用或账户注册", detailEn: "Trials or new accounts" },
  { value: "purchases", zh: "推动购买", en: "Drive purchases", detailZh: "付费订单或预约", detailEn: "Paid orders or bookings" }
];

const PLATFORM_LABELS = {
  xiaohongshu: { zh: "小红书", en: "Xiaohongshu" },
  linkedin: { zh: "LinkedIn", en: "LinkedIn" },
  wechat: { zh: "微信公众号", en: "WeChat" }
} as const;

export function StarterMissionIntake({ locale }: { locale: Locale }) {
  const [url, setUrl] = useState("");
  const [objective, setObjective] = useState<GrowthAuditObjective>("leads");
  const [audit, setAudit] = useState<GrowthAudit | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [startingOpportunity, setStartingOpportunity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continuationHref, setContinuationHref] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/growth-audit", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { audit?: GrowthAudit | null };
        if (active && response.ok && data.audit) {
          setAudit(data.audit);
          setUrl(data.audit.sourceUrl);
          setObjective(data.audit.objective);
          captureEvent("growth_opportunities_presented", {
            audit_id: data.audit.id,
            opportunity_count: data.audit.opportunities.length,
            source: "resume_latest"
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingLatest(false);
      });
    return () => { active = false; };
  }, []);

  async function submitAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setContinuationHref(null);

    let normalizedUrl: string;
    try {
      const parsed = new URL(url.includes("://") ? url : `https://${url}`);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid");
      normalizedUrl = parsed.toString();
    } catch {
      setError(locale === "en" ? "Enter a public website URL." : "请输入可以公开访问的网站地址。");
      return;
    }

    setUrl(normalizedUrl);
    setAuditing(true);
    captureEvent("growth_source_submitted", { objective, source_type: "website" });
    captureEvent("growth_audit_started", { objective, source_type: "website" });
    try {
      const response = await fetch("/api/growth-audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "x-finfold-locale": locale
        },
        body: JSON.stringify({ url: normalizedUrl, objective })
      });
      const data = await response.json().catch(() => ({})) as { audit?: GrowthAudit; error?: string; cached?: boolean };
      if (!response.ok || !data.audit) throw new Error(data.error ?? "Growth Audit failed.");
      setAudit(data.audit);
      captureEvent("growth_audit_completed", {
        audit_id: data.audit.id,
        objective,
        cached: Boolean(data.cached),
        opportunity_count: data.audit.opportunities.length
      });
      captureEvent("growth_opportunities_presented", {
        audit_id: data.audit.id,
        opportunity_count: data.audit.opportunities.length,
        source: data.cached ? "cached" : "new"
      });
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Growth Audit failed.");
      captureEvent("growth_audit_failed", { objective });
    } finally {
      setAuditing(false);
    }
  }

  async function startMission(opportunity: GrowthOpportunity) {
    if (!audit) return;
    setStartingOpportunity(opportunity.id);
    setError(null);
    setContinuationHref(null);
    captureEvent("growth_mission_previewed", {
      audit_id: audit.id,
      opportunity_id: opportunity.id,
      objective: opportunity.objective,
      platform: opportunity.recommendedPlatform
    });
    try {
      const response = await fetch("/api/growth-audit/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: audit.id, opportunityId: opportunity.id, locale })
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        missionId?: string;
        missionHref?: string;
        workbenchHref?: string;
        existing?: boolean;
      };
      if (!response.ok || !data.missionId || !data.missionHref) {
        if (data.missionHref || data.workbenchHref) setContinuationHref(data.missionHref ?? data.workbenchHref ?? null);
        throw new Error(data.error ?? "Unable to start the mission.");
      }
      captureEvent("growth_mission_started", {
        audit_id: audit.id,
        opportunity_id: opportunity.id,
        mission_id: data.missionId,
        objective: opportunity.objective,
        platform: opportunity.recommendedPlatform,
        existing: Boolean(data.existing)
      });
      window.location.href = data.missionHref;
    } catch (missionError) {
      setError(missionError instanceof Error ? missionError.message : "Unable to start the mission.");
    } finally {
      setStartingOpportunity(null);
    }
  }

  if (loadingLatest) {
    return <Panel className="min-h-[420px] animate-pulse bg-surface-2/50"><span className="sr-only">{locale === "en" ? "Loading" : "加载中"}</span></Panel>;
  }

  return (
    <section className="grid gap-5" data-testid="starter-mission-intake">
      <Panel className="relative overflow-hidden p-5 sm:p-7 md:p-8">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_10%,rgb(var(--action)/0.12),transparent_34%),linear-gradient(135deg,rgb(var(--info)/0.045),transparent_55%)]" />
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:items-center">
          <div>
            <p className="eyebrow">{locale === "en" ? "Your first Growth Mission" : "你的第一个增长任务"}</p>
            <h1 className="mt-3 max-w-2xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">
              {locale === "en" ? "Give Finfold a website. Get one next move." : "给 Finfold 一个网址，拿到下一步增长行动"}
            </h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-fg-muted md:text-base">
              {locale === "en"
                ? "Finfold reads the public page, shows the evidence behind three opportunities, and prepares the mission you choose."
                : "Finfold 阅读公开页面，给出三个有页面证据的增长机会，并为你选中的方向准备执行任务。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-fg-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-positive" />{locale === "en" ? "Page evidence included" : "附页面证据"}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5"><Target className="h-3.5 w-3.5 text-brand" />{locale === "en" ? "One objective" : "一次只追一个结果"}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-brand" />{locale === "en" ? "You approve execution" : "执行前由你确认"}</span>
            </div>
          </div>

          <form onSubmit={submitAudit} className="rounded-2xl border border-hairline bg-surface/88 p-4 shadow-raised sm:p-5">
            <label className="grid gap-2 text-sm font-bold text-fg">
              <span>{locale === "en" ? "Your public website" : "你的公开网站"}</span>
              <span className="focus-within:ring-action/12 flex min-h-12 items-center gap-2.5 rounded-xl border border-hairline bg-bg/65 px-3.5 transition focus-within:border-action/55 focus-within:ring-4">
                <Globe2 className="h-4 w-4 shrink-0 text-fg-muted" />
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://your-product.com"
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm font-medium text-fg outline-none placeholder:text-fg-muted"
                />
              </span>
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-bold text-fg">{locale === "en" ? "The outcome that matters now" : "现在最重要的结果"}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {OBJECTIVES.map((item) => {
                  const selected = objective === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setObjective(item.value)}
                      className={`focus-ring rounded-xl border p-3 text-left transition ${selected ? "border-action/55 bg-action/[0.1]" : "border-hairline bg-bg/45 hover:border-action/30"}`}
                    >
                      <span className="block text-xs font-bold text-fg">{locale === "en" ? item.en : item.zh}</span>
                      <span className="mt-1 block text-[10px] leading-4 text-fg-muted">{locale === "en" ? item.detailEn : item.detailZh}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button type="submit" disabled={auditing || !url.trim()} className="btn-primary focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-55">
              {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {auditing
                ? locale === "en" ? "Reading the page and ranking opportunities…" : "正在阅读页面并排序机会…"
                : locale === "en" ? "Find my opportunities" : "发现增长机会"}
            </button>
            <p className="mt-2 text-center text-[10px] leading-4 text-fg-muted">
              {locale === "en" ? "Uses 5 AI Credits. Results are based only on public page evidence." : "消耗 5 创作点数；结论只基于公开页面证据。"}
            </p>
          </form>
        </div>
      </Panel>

      {error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk/10 p-4 text-sm font-semibold text-risk">
          {error}
          {continuationHref ? (
            <Link href={continuationHref} className="ml-2 underline underline-offset-4">
              {locale === "en" ? "Continue the active mission" : "继续当前任务"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {audit ? (
        <section aria-labelledby="growth-audit-opportunities" className="grid gap-4">
          <div className="rounded-2xl border border-hairline bg-surface/75 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="eyebrow">{locale === "en" ? "Evidence summary" : "证据摘要"}</p>
                <h2 id="growth-audit-opportunities" className="mt-2 text-2xl font-black text-fg">
                  {locale === "en" ? "Three opportunities worth testing" : "三个值得验证的增长机会"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-muted">{audit.summary}</p>
              </div>
              <a href={audit.sourceUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-bold text-fg-muted hover:border-brand/40 hover:text-fg">
                <Globe2 className="h-3.5 w-3.5" />
                {audit.business.name || new URL(audit.sourceUrl).hostname}
              </a>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {audit.signals.slice(0, 3).map((signal, index) => (
                <div key={`${signal.finding}-${index}`} className="rounded-xl border border-hairline bg-surface-2/60 p-3.5">
                  <p className="text-xs font-bold leading-5 text-fg">{signal.finding}</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-fg-muted">{signal.evidence}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {audit.opportunities.map((opportunity) => (
              <article key={opportunity.id} className={`flex min-h-[340px] flex-col rounded-2xl border p-5 ${opportunity.rank === 1 ? "border-brand/45 bg-brand/[0.055] shadow-glow-brand" : "border-hairline bg-surface"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/12 text-xs font-black text-brand">0{opportunity.rank}</span>
                  <span className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-fg-muted">
                    {PLATFORM_LABELS[opportunity.recommendedPlatform][locale]}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black leading-snug text-fg">{opportunity.title}</h3>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-fg-muted">{locale === "en" ? "Observed evidence" : "页面证据"}</p>
                <p className="mt-1.5 text-sm leading-6 text-fg-muted">{opportunity.evidence}</p>
                <div className="mt-4 flex-1 rounded-xl border border-hairline bg-surface-2/60 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-fg"><TrendingUp className="h-3.5 w-3.5 text-brand" />{locale === "en" ? "Mission hypothesis" : "任务假设"}</p>
                  <p className="mt-1.5 text-xs leading-5 text-fg-muted">{opportunity.rationale}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void startMission(opportunity)}
                  disabled={startingOpportunity !== null || opportunity.status === "accepted"}
                  className="btn-primary focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {startingOpportunity === opportunity.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                  {opportunity.status === "accepted"
                    ? locale === "en" ? "Mission started" : "任务已启动"
                    : locale === "en" ? "Start this mission" : "启动这个任务"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
          <p className="text-center text-[11px] leading-5 text-fg-muted">
            {locale === "en"
              ? "These are evidence-based hypotheses, not guaranteed outcomes. Finfold will prepare the execution draft; publishing still requires your approval."
              : "这些是基于页面证据的增长假设，不是结果保证。Finfold 会准备执行草稿，发布仍需你的确认。"}
          </p>
        </section>
      ) : null}
    </section>
  );
}
