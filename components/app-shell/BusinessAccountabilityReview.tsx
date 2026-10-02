"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Coins,
  DatabaseZap,
  RefreshCw,
  Repeat2,
  Target,
  Wrench,
  type LucideIcon
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type {
  BusinessAccountabilityReview,
  BusinessReviewDecisionItem
} from "@/lib/operations/business-review";
import type { BusinessMissionReviewBottleneck } from "@/lib/agent/growth-missions";

type Props = {
  locale: "zh" | "en";
};

export function BusinessAccountabilityReviewCard({ locale }: Props) {
  const en = locale === "en";
  const [review, setReview] = useState<BusinessAccountabilityReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/business-review", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        review?: BusinessAccountabilityReview;
        error?: string;
      };
      if (!response.ok || !data.review) {
        throw new Error(data.error || "Unable to load the business review.");
      }
      setReview(data.review);
    } catch (loadError) {
      setReview(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load the business review.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (loading) {
    return (
      <Panel className="min-h-64 animate-pulse p-5 md:p-6">
        <div className="h-3 w-36 rounded-full bg-surface-3" />
        <div className="mt-4 h-8 w-64 rounded-lg bg-surface-3" />
        <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 rounded-xl bg-surface-2" />)}
        </div>
      </Panel>
    );
  }

  if (!review || error) {
    return (
      <Panel className="p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-fg">
              {en ? "Business review unavailable" : "业务复盘暂时不可用"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">
              {en
                ? "Please try again in a moment."
                : "请稍后重试。"}
            </p>
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />
            {en ? "Retry" : "重试"}
          </button>
        </div>
      </Panel>
    );
  }

  const hasRecordedOutcomes = review.outcomes.recordedEvents > 0;
  const reviewedCount = review.decisions.replicate.length
    + review.decisions.repair.length
    + review.decisions.collectEvidence.length;
  const status = review.decisions.reviewDue.length > 0
    ? { tone: "warn" as const, label: en ? `${review.decisions.reviewDue.length} awaiting review` : `${review.decisions.reviewDue.length} 项待复盘` }
    : reviewedCount > 0
      ? { tone: "success" as const, label: en ? "Reviewed with evidence" : "已按证据复盘" }
      : { tone: "neutral" as const, label: en ? "Awaiting first review" : "等待首轮复盘" };

  return (
    <Panel className="relative overflow-hidden p-0">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-action via-positive to-transparent" />
      <div className="p-5 md:p-6">
        <div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">{en ? "ACCOUNTABILITY REVIEW" : "经营复盘"}</p>
              <Tag tone={status.tone} dot>{status.label}</Tag>
              <span className="font-mono text-[10px] font-bold text-fg-muted">{review.period.key}</span>
            </div>
            <h2 className="mt-3 text-2xl font-black text-fg md:text-3xl">
              {en ? "Monthly business results" : "本月经营结果"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-fg-muted">
              {en
                ? "A monthly summary of recorded leads, signups, purchases, revenue, and review decisions."
                : "汇总本月已记录的线索、注册、成交、收入和复盘决定。"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-hairline lg:grid-cols-4">
          <OutcomeMetric
            label={en ? "Recorded leads" : "已记录线索"}
            value={hasRecordedOutcomes ? formatNumber(review.outcomes.leads, locale) : "—"}
            detail={en ? "Lead events in this cycle" : "本周期线索事件"}
          />
          <OutcomeMetric
            label={en ? "Recorded signups" : "已记录注册"}
            value={hasRecordedOutcomes ? formatNumber(review.outcomes.signups, locale) : "—"}
            detail={en ? "Signup events in this cycle" : "本周期注册事件"}
          />
          <OutcomeMetric
            label={en ? "Recorded purchases" : "已记录成交"}
            value={hasRecordedOutcomes ? formatNumber(review.outcomes.purchases, locale) : "—"}
            detail={en ? "Purchase events in this cycle" : "本周期成交事件"}
          />
          <RevenueMetric review={review} locale={locale} />
        </div>

        <p className="mt-3 text-[11px] font-semibold leading-5 text-fg-muted">
          {hasRecordedOutcomes
            ? en
              ? `${review.outcomes.automaticEvents} automatic event(s) and ${review.outcomes.manualEvents} manually recorded event(s) this cycle.`
              : `本周期包含 ${review.outcomes.automaticEvents} 条自动回传和 ${review.outcomes.manualEvents} 条人工记录。`
            : en
              ? "No leads, signups, purchases, or revenue have been recorded this cycle."
              : "本周期暂无线索、注册、成交或收入记录。"}
        </p>

        {review.decisions.reviewDue.length > 0 ? (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-warn/30 bg-warn/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-fg">
                {en ? "A business decision is waiting for you" : "有商业任务已经到期，等你确认结论"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-fg-muted">
                {en
                  ? "Choose the next step: repeat the result, repair one breakpoint, or continue measuring."
                  : "请选择下一步：复现结果、修复一个断点或继续观察。"}
              </p>
            </div>
            <Link href={`/operations/missions/${review.decisions.reviewDue[0].id}`} className="btn-primary shrink-0 text-xs">
              {en ? "Review now" : "现在复盘"}<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <DecisionLane
            title={en ? "Worth repeating" : "值得复现"}
            detail={en ? "Target reached and confirmed by the user" : "目标达成，并经用户确认"}
            empty={en ? "No confirmed result to repeat this cycle." : "本周期还没有已确认、可复现的结果。"}
            icon={Repeat2}
            tone="positive"
            items={review.decisions.replicate}
            locale={locale}
          />
          <DecisionLane
            title={en ? "Needs one repair" : "需要修复"}
            detail={en ? "One selected breakpoint for the next test" : "选择一个断点进入下一轮验证"}
            empty={en ? "No repair decision this cycle." : "本周期暂无修复决定。"}
            icon={Wrench}
            tone="warn"
            items={review.decisions.repair}
            locale={locale}
          />
          <DecisionLane
            title={en ? "Evidence still missing" : "证据不足"}
            detail={en ? "Continue measuring for the next review" : "继续收集下一轮复盘所需数据"}
            empty={en ? "No measurement extension is active this cycle." : "本周期没有需要延期取证的任务。"}
            icon={DatabaseZap}
            tone="action"
            items={review.decisions.collectEvidence}
            locale={locale}
          />
        </div>
      </div>

      <ResourceStrip review={review} locale={locale} />
    </Panel>
  );
}

function OutcomeMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-b border-r border-hairline p-4 last:border-r-0 lg:border-b-0">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fg-muted">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums text-fg">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-fg-muted">{detail}</p>
    </div>
  );
}

function RevenueMetric({
  review,
  locale
}: {
  review: BusinessAccountabilityReview;
  locale: "zh" | "en";
}) {
  const values = review.outcomes.revenueByCurrency;
  return (
    <div className="border-b border-r border-hairline p-4 last:border-r-0 lg:border-b-0">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fg-muted">
        {locale === "en" ? "Recorded revenue" : "已记录收入"}
      </p>
      {values.length > 0 ? (
        <div className="mt-2 grid gap-0.5">
          {values.slice(0, 2).map((item) => (
            <p key={item.currency} className="text-lg font-black tabular-nums text-fg">
              {formatCurrency(item.value, item.currency, locale)}
            </p>
          ))}
          {values.length > 2 ? <p className="text-[10px] font-bold text-fg-muted">+{values.length - 2}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-2xl font-black text-fg">—</p>
      )}
      <p className="mt-1 text-[10px] font-semibold text-fg-muted">
        {values.length > 0
          ? locale === "en" ? "Shown separately by currency" : "按币种分别统计"
          : locale === "en" ? "No revenue recorded this cycle" : "本周期暂无收入记录"}
      </p>
    </div>
  );
}

function DecisionLane({
  title,
  detail,
  empty,
  icon: Icon,
  tone,
  items,
  locale
}: {
  title: string;
  detail: string;
  empty: string;
  icon: LucideIcon;
  tone: "positive" | "warn" | "action";
  items: BusinessReviewDecisionItem[];
  locale: "zh" | "en";
}) {
  const toneClass = tone === "positive"
    ? "border-positive/25 bg-positive/[0.055] text-positive"
    : tone === "warn"
      ? "border-warn/30 bg-warn/[0.055] text-warn"
      : "border-action/25 bg-action/[0.055] text-action";
  return (
    <section className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-fg">{title}</p>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-fg-muted">{detail}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface/80">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {items.length > 0 ? items.slice(0, 3).map((item) => (
          <DecisionRow key={item.id} item={item} locale={locale} />
        )) : (
          <p className="rounded-lg border border-dashed border-current/20 bg-surface/45 px-3 py-3 text-[11px] font-semibold leading-5 text-fg-muted">
            {empty}
          </p>
        )}
        {items.length > 3 ? (
          <Link href="/operations/missions" className="inline-flex items-center gap-1 pt-1 text-[10px] font-black text-action">
            {locale === "en" ? `View ${items.length - 3} more mission(s)` : `还有 ${items.length - 3} 项，查看全部任务`}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function DecisionRow({ item, locale }: { item: BusinessReviewDecisionItem; locale: "zh" | "en" }) {
  const en = locale === "en";
  const supportingText = item.decision === "fix_bottleneck" && item.bottleneck
    ? `${en ? "Breakpoint selected for testing" : "待验证断点"}：${bottleneckLabel(item.bottleneck, locale)}`
    : item.decision === "collect_more_evidence" && item.evidenceNote
      ? item.evidenceNote
      : decisionEvidenceText(item, locale);
  return (
    <Link href={`/operations/missions/${item.id}`} className="group rounded-lg border border-hairline bg-surface/80 p-3 transition hover:border-action/35">
      <p className="line-clamp-2 text-xs font-black leading-5 text-fg">{item.title}</p>
      <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-4 text-fg-muted">{supportingText}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-action">
        {en ? "Open evidence" : "查看证据"}<ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ResourceStrip({ review, locale }: { review: BusinessAccountabilityReview; locale: "zh" | "en" }) {
  const en = locale === "en";
  const missions = review.resources.businessMissions;
  const credits = review.resources.credits;
  const missionPercent = missions.limit > 0 ? Math.min(100, (missions.used / missions.limit) * 100) : 0;
  return (
    <div className="grid gap-4 border-t border-hairline bg-surface-2/55 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:px-6">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-action" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fg-muted">{en ? "Plan" : "当前套餐"}</p>
          <p className="mt-0.5 text-xs font-black text-fg">{planLabel(review.resources.plan, locale)}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
          <span className="text-fg-muted">{en ? "Business missions this cycle" : "本周期商业任务"}</span>
          <span className="tabular-nums text-fg">{missions.used}/{missions.limit}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={missions.limit} aria-valuenow={Math.min(missions.used, missions.limit)}>
          <div className="h-full rounded-full bg-action" style={{ width: `${missionPercent}%` }} />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-action" />
        {credits ? (
          <div className="min-w-0 text-[11px] font-semibold leading-5 text-fg-muted">
            <span className="font-black text-fg">
              {credits.netCharged === null
                ? en ? "Credit ledger unavailable" : "点数账本暂不可用"
                : en ? `${formatNumber(credits.netCharged, locale)} net credits charged` : `净消耗 ${formatNumber(credits.netCharged, locale)} 点`}
            </span>
            {credits.refunded && credits.refunded > 0
              ? en ? ` · ${formatNumber(credits.refunded, locale)} refunded` : ` · 失败退回 ${formatNumber(credits.refunded, locale)} 点`
              : ""}
            {` · ${en ? "monthly allowance" : "月度额度"} ${formatNumber(credits.planAllowance, locale)}`}
          </div>
        ) : (
          <p className="text-[11px] font-semibold leading-5 text-fg-muted">
            {en ? "Credit usage is temporarily unavailable. Please try again later." : "点数消耗暂时无法读取，请稍后重试。"}
          </p>
        )}
      </div>
    </div>
  );
}

function decisionEvidenceText(item: BusinessReviewDecisionItem, locale: "zh" | "en"): string {
  const en = locale === "en";
  if (item.primaryMetricKey !== "revenue") {
    return `${item.primaryMetric} ${formatNumber(item.actualValue ?? 0, locale)} / ${en ? "target" : "目标"} ${formatNumber(item.targetValue, locale)}`;
  }
  if (item.revenueByCurrency.length === 0) {
    return en
      ? "No revenue has been recorded by currency yet."
      : "暂无分币种收入记录。";
  }
  const actual = item.revenueByCurrency
    .map((entry) => formatCurrency(entry.value, entry.currency, locale))
    .join(" + ");
  if (item.revenueByCurrency.length > 1) {
    return en
      ? `${item.primaryMetric} ${actual}; shown separately by currency.`
      : `${item.primaryMetric} ${actual}；按币种分别统计。`;
  }
  const currency = item.revenueByCurrency[0].currency;
  return `${item.primaryMetric} ${actual} / ${en ? "target" : "目标"} ${formatCurrency(item.targetValue, currency, locale)}`;
}

function formatNumber(value: number, locale: "zh" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value: number, currency: string, locale: "zh" | "en"): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value, locale)}`;
  }
}

function bottleneckLabel(value: BusinessMissionReviewBottleneck, locale: "zh" | "en"): string {
  const labels: Record<BusinessMissionReviewBottleneck, { zh: string; en: string }> = {
    acquisition_message: { zh: "获客信息", en: "Acquisition message" },
    landing_page: { zh: "落地页", en: "Landing page" },
    lead_capture: { zh: "线索收集", en: "Lead capture" },
    signup_flow: { zh: "注册流程", en: "Signup flow" },
    checkout: { zh: "支付流程", en: "Checkout" }
  };
  return locale === "en" ? labels[value].en : labels[value].zh;
}

function planLabel(plan: BusinessAccountabilityReview["resources"]["plan"], locale: "zh" | "en"): string {
  const labels: Record<BusinessAccountabilityReview["resources"]["plan"], { zh: string; en: string }> = {
    free: { zh: "免费版", en: "Free" },
    starter: { zh: "Starter", en: "Starter" },
    pro: { zh: "Pro", en: "Pro" },
    growth: { zh: "Growth", en: "Growth" },
    employee: { zh: "数字员工", en: "Digital Employee" },
    starter_v2: { zh: "Starter", en: "Starter" },
    creator_v2: { zh: "Creator", en: "Creator" },
    growth_v2: { zh: "Growth", en: "Growth" },
    digital_employee_v2: { zh: "数字员工", en: "Digital Employee" }
  };
  return locale === "en" ? labels[plan].en : labels[plan].zh;
}
