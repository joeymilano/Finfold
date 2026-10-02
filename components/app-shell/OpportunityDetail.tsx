"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, ExternalLink, Flame, Loader2, Radar } from "@/components/ui/icons";
import { OpportunityPrepareButton } from "@/components/app-shell/OpportunityPrepareButton";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import {
  opportunityAlternateAngles,
  opportunityEvidenceTitle,
  opportunityFact,
  opportunityFormat,
  opportunityMainAngle,
  opportunityTitle,
  opportunityWhyNow,
  opportunityWhyYou
} from "@/lib/trends/display";
import { isActionableMatchScore, type TopicOpportunity } from "@/lib/trends/types";

export function OpportunityDetail({ opportunityId }: { opportunityId: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<TopicOpportunity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/operations/topic-opportunities/${encodeURIComponent(opportunityId)}?locale=${locale}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { opportunity?: TopicOpportunity; error?: string };
        if (!response.ok || !payload.opportunity || !isActionableMatchScore(payload.opportunity.matchScore)) {
          throw new Error(locale === "zh" ? "机会不存在、匹配度不足，或中文分析暂不可用。" : payload.error || "This opportunity is unavailable.");
        }
        setOpportunity(payload.opportunity);
        captureEvent("opportunity_opened", { opportunity_id: opportunityId, surface: "detail" });
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught)); });
    return () => controller.abort();
  }, [locale, opportunityId]);

  return (
    <>
      {/* 板块导航由页面层渲染：受控页签（增长闭环/X 流水线）的开关只能服务端计算。 */}
      <div className="mx-auto max-w-[1120px]">
        {!opportunity && !error ? <div className="grid min-h-[560px] place-items-center rounded-[26px] border border-hairline bg-surface"><Loader2 className="h-7 w-7 animate-spin text-action" /></div> : null}
        {error ? <div className="grid min-h-[480px] place-items-center rounded-[26px] border border-risk/20 bg-surface p-6 text-center"><div><p className="text-lg font-black text-fg">{localized(locale, "无法打开这个机会", "Unable to open this opportunity")}</p><p className="mt-3 text-sm text-fg-muted">{error}</p><button type="button" onClick={() => router.push("/operations/opportunities")} className="focus-ring mt-6 h-10 rounded-xl bg-fg px-4 text-xs font-black text-bg">{localized(locale, "返回机会雷达", "Back to radar")}</button></div></div> : null}
        {opportunity ? (
          <article className="relative overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-[0_30px_100px_rgb(var(--fg)/0.07)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_15%_0%,rgb(var(--action)/0.18),transparent_38%),radial-gradient(circle_at_90%_5%,rgb(var(--info)/0.09),transparent_28%)]" />
            <div className="relative px-5 py-6 sm:px-8 sm:py-9 lg:px-10">
              <Link href="/operations/opportunities" className="focus-ring inline-flex items-center gap-2 rounded-lg text-[11px] font-black text-fg-muted hover:text-action"><Radar className="h-4 w-4" />{localized(locale, "返回机会雷达", "Back to Opportunity Radar")}</Link>
              <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-fg-subtle"><span className="inline-flex items-center gap-1 rounded-full bg-action/10 px-2.5 py-1 text-action"><Flame className="h-3 w-3" />{lifecycleLabel(opportunity.lifecycle, locale)}</span><span>{getLocalizedPlatformLabel(opportunity.recommendedPlatform, locale)}</span><span>·</span><span>{opportunityFormat(opportunity, locale)}</span></div>
                  <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-[-0.045em] text-fg sm:text-5xl">{opportunityTitle(opportunity, locale)}</h1>
                  <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-muted sm:text-base">{opportunityFact(opportunity, locale)}</p>
                </div>
                <div className="rounded-[22px] border border-action/20 bg-action/[0.055] p-5">
                  <p className="text-[9px] font-black tracking-[0.15em] text-action">{localized(locale, "匹配度", "MATCH")}</p>
                  <p className="mt-2 text-5xl font-black tracking-[-0.06em] text-fg">{opportunity.matchScore}</p>
                  <p className="mt-2 text-[11px] leading-5 text-fg-muted">{localized(locale, `证据可信度 ${opportunity.evidenceConfidence}`, `Evidence confidence ${opportunity.evidenceConfidence}`)}</p>
                  <div className="mt-5"><OpportunityPrepareButton opportunity={opportunity} /></div>
                </div>
              </div>

              <section className="mt-9 grid gap-3 md:grid-cols-3">
                <ReasonBlock eyebrow={localized(locale, "为什么是现在", "WHY NOW")} body={opportunityWhyNow(opportunity, locale)} />
                <ReasonBlock eyebrow={localized(locale, "为什么适合你", "WHY YOU")} body={opportunityWhyYou(opportunity, locale)} />
                <ReasonBlock eyebrow={localized(locale, "为什么是这个平台", "WHY THIS PLATFORM")} body={localized(locale, `${getLocalizedPlatformLabel(opportunity.recommendedPlatform, locale)} 是当前运营目标和账号资产中最直接的执行入口。`, `${getLocalizedPlatformLabel(opportunity.recommendedPlatform, locale)} is the clearest execution surface in your current operating setup.`)} />
              </section>

              {opportunity.analysisStatus === "unavailable" ? (
                <div className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.05] px-4 py-3 text-xs leading-5 text-fg-muted">
                  {localized(locale, "个性化分析暂不可用。当前匹配度仍来自可复核的确定性规则；系统没有用模板结果冒充 AI 分析。", "Personalized analysis is temporarily unavailable. The match score still comes from auditable deterministic rules; no template result is being presented as AI analysis.")}
                </div>
              ) : null}

              <section className="mt-8 rounded-[22px] border border-hairline bg-bg/45 p-5 sm:p-6">
                <p className="text-[10px] font-black tracking-[0.15em] text-action">{localized(locale, "内容角度", "CONTENT ANGLES")}</p>
                <h2 className="mt-3 text-xl font-black tracking-[-0.025em] text-fg">{opportunityMainAngle(opportunity, locale)}</h2>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {opportunityAlternateAngles(opportunity, locale).map((angle, index) => <div key={angle} className="rounded-xl border border-hairline bg-surface px-4 py-3"><p className="text-[9px] font-black text-fg-subtle">{localized(locale, `备选 ${index + 1}`, `ALT ${index + 1}`)}</p><p className="mt-1 text-xs font-bold leading-6 text-fg">{angle}</p></div>)}
                </div>
              </section>

              <section className="mt-8">
                <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.15em] text-action">{localized(locale, "证据", "EVIDENCE")}</p><h2 className="mt-2 text-lg font-black text-fg">{localized(locale, "这个机会从哪里来", "Where this opportunity came from")}</h2></div><span className="inline-flex items-center gap-1 text-[10px] font-bold text-fg-subtle"><Clock className="h-3.5 w-3.5" />{localized(locale, "原始信号仅保留 72 小时", "Signals retained for 72 hours")}</span></div>
                <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
                  {opportunity.evidence.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="focus-ring flex items-center gap-4 bg-surface px-4 py-3 transition hover:bg-surface-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-action/8 text-action"><ExternalLink className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-black text-action">{item.sourceLabel}</span><span className="mt-1 block truncate text-xs font-bold text-fg">{opportunityEvidenceTitle(opportunity, item, locale)}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-fg-subtle" /></a>)}
                </div>
              </section>
            </div>
          </article>
        ) : null}
      </div>
    </>
  );
}

function ReasonBlock({ eyebrow, body }: { eyebrow: string; body: string }) {
  return <div className="rounded-2xl border border-hairline bg-bg/40 p-4"><p className="text-[9px] font-black tracking-[0.13em] text-action">{eyebrow}</p><p className="mt-2 text-xs leading-6 text-fg-muted">{body}</p></div>;
}

function lifecycleLabel(value: TopicOpportunity["lifecycle"], locale: "zh" | "en") {
  if (value === "hot") return localized(locale, "高热", "Hot");
  if (value === "rising") return localized(locale, "上升中", "Rising");
  if (value === "cooling") return localized(locale, "降温", "Cooling");
  return localized(locale, "新出现", "New");
}

function localized(locale: "zh" | "en", zh: string, en: string): string {
  return locale === "en" ? en : zh;
}
