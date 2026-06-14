"use client";

import { ArrowRight, CheckCircle2, CreditCard, Loader2, RefreshCw, Smartphone, TrendingUp, Users, Zap } from "lucide-react";
import { useState } from "react";
import { brand, type PricingPlanKey } from "@/lib/brand";
import type { PlanId } from "@/lib/payment";
import { useLocale } from "@/hooks/useLocale";

const VISIBLE_PLANS: PricingPlanKey[] = ["free", "starter", "creator", "pro", "team"];

export default function BillingPage() {
  const locale = useLocale();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startCheckout(plan: PlanId) {
    setLoadingPlan(plan);
    setMessage(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout.");
      }

      window.location.href = data.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-8 pb-10">

      {/* Header */}
      <div className="border-b border-hairline pb-6">
        <p className="eyebrow">{locale === "en" ? "Pricing & Billing" : "价格与账单"}</p>
        <h1 className="mt-1.5 text-3xl font-bold text-fg">
          {locale === "en" ? "Hire your AI marketing employee" : "雇一个 AI 营销员工"}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-fg-muted">
          {locale === "en"
            ? "Built exclusively for founders. Pay a monthly retainer — like a salary. If the results disappoint, claim a 30% refund. No risk, no lock-in."
            : "只为创业者而建。按月支付底薪，效果不理想退款 30%。降低风险，随时取消。"}
        </p>

        {/* Value props row */}
        <div className="mt-5 flex flex-wrap gap-4">
          <ValueProp
            icon={Users}
            title={locale === "en" ? "Founders only" : "只为创业者"}
            desc={locale === "en" ? "Built for solo teams & early-stage startups" : "专为独立创始人和早期团队设计"}
          />
          <ValueProp
            icon={TrendingUp}
            title={locale === "en" ? "Retainer + performance" : "底薪 + 绩效"}
            desc={locale === "en" ? "Fixed monthly base, results-tied refund guarantee" : "固定月付底薪，按效果退款保障"}
          />
          <ValueProp
            icon={RefreshCw}
            title={locale === "en" ? "30% refund guarantee" : "效果不理想退款 30%"}
            desc={locale === "en" ? "Show us the data, get 30% back — no questions" : "拿数据来，直接退 30%，无需解释"}
          />
        </div>
      </div>

      {/* Model explanation banner */}
      <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm leading-6">
        <p className="font-semibold text-fg">
          {locale === "en"
            ? "How the pricing model works"
            : "计费模式说明"}
        </p>
        <p className="mt-1 text-fg-muted">
          {locale === "en"
            ? "Think of it like hiring a marketing employee: you pay a fixed monthly retainer (the base salary), and if the AI doesn't deliver results you can measure — follower growth, engagement lift, traffic increase — submit your data within 30 days and receive a 30% refund on that month's charge. No questions asked."
            : "把它想成雇一名营销员工：你每月支付固定底薪，如果 AI 没有交出你能衡量的成果（涨粉、互动提升、流量增长），在 30 天内提交数据，当月费用退款 30%。无需解释原因。"}
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {VISIBLE_PLANS.map((key) => {
          const plan = brand.pricing[key];
          const isFree = plan.id === "free";
          const planId = isFree ? null : (plan.id as PlanId);

          let actionLabel: string;
          if (isFree) {
            actionLabel = locale === "en" ? "Current free plan" : "当前免费版";
          } else if (plan.highlighted) {
            actionLabel = locale === "en" ? "Hire Senior employee" : "雇用资深营销员工";
          } else {
            actionLabel = locale === "en" ? `Hire ${plan.name}` : `雇用${plan.nameCN}`;
          }

          return (
            <PlanCard
              key={plan.id}
              locale={locale}
              name={plan.name}
              nameCN={plan.nameCN}
              priceUsd={plan.price.usd}
              priceCny={plan.price.cny}
              allowance={plan.allowance}
              allowanceCN={plan.allowanceCN}
              features={plan.features}
              featuresCN={plan.featuresCN}
              highlighted={plan.highlighted}
              badge={plan.badge}
              action={actionLabel}
              loading={loadingPlan === planId}
              onAction={planId ? () => void startCheckout(planId) : undefined}
            />
          );
        })}
      </div>

      {message ? (
        <p className="max-w-md rounded-xl border border-risk/30 bg-risk/10 p-4 text-xs font-medium text-risk sm:text-sm">{message}</p>
      ) : null}

      {/* Refund policy detail */}
      <div className="panel-inset space-y-3 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-fg">
          {locale === "en" ? "Performance refund policy" : "效果退款政策"}
        </p>
        <p className="max-w-4xl text-xs leading-relaxed text-fg-muted">
          {locale === "en"
            ? "If your results after a full month of use are measurably disappointing — for example, no follower growth, no engagement increase, no traffic lift compared to your baseline — email us with your before/after data within 30 days of the charge. We will refund 30% of that month's payment, no questions asked. This applies to all paid plans (Junior and above)."
            : "如果使用满一个月后，效果不如预期且有数据为证（如粉丝数、互动率、流量与初始基线相比无明显提升），在扣费后 30 天内发邮件提交对比数据，我们退还当月费用的 30%，无需解释原因。适用于所有付费套餐（初级员工及以上）。"}
        </p>
      </div>

      {/* Payment methods */}
      <div className="panel-inset space-y-4 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-fg">
          {locale === "en" ? "Payment methods" : "付款方式"}
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-3.5">
            <CreditCard className="h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="text-xs font-semibold text-fg">
                {locale === "en" ? "Credit / Debit Card" : "信用卡 / 借记卡"}
              </p>
              <p className="text-[11px] text-fg-muted">
                {locale === "en" ? "Visa, Mastercard, Amex, Apple Pay, Google Pay" : "Visa、Mastercard、Amex、Apple Pay、Google Pay"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5 opacity-60">
            <Smartphone className="h-5 w-5 shrink-0 text-fg-muted" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-fg-muted">{locale === "en" ? "WeChat Pay" : "微信支付"}</p>
                <span className="inline-flex shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {locale === "en" ? "Soon" : "即将上线"}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted">
                {locale === "en" ? "Scan QR code to pay via WeChat" : "扫码支付，微信内直接完成"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5 opacity-60">
            <Smartphone className="h-5 w-5 shrink-0 text-fg-muted" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-fg-muted">{locale === "en" ? "Alipay" : "支付宝"}</p>
                <span className="inline-flex shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {locale === "en" ? "Soon" : "即将上线"}
                </span>
              </div>
              <p className="text-[11px] text-fg-muted">
                {locale === "en" ? "Pay with Alipay wallet" : "使用支付宝钱包支付"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Billing notes */}
      <div className="panel-inset space-y-2.5 p-5 text-fg-muted">
        <p className="text-xs font-bold uppercase tracking-wide text-fg">
          {locale === "en" ? "Billing notes" : "订阅须知"}
        </p>
        <p className="max-w-4xl text-xs leading-relaxed">
          {locale === "en"
            ? "All prices are monthly (billed per calendar month). Cancel, downgrade, or pause anytime — no charge next month. Payments processed securely via Creem.io across 190+ countries. Mainland China users pay in CNY (cross-border fees waived). For custom enterprise seats, contact sales."
            : "所有价格均为月付（按自然月计费），随时退订、降级或暂停，下月不再扣费。支付通过 Creem.io 安全处理，覆盖 190+ 国家和地区。中国大陆用户以人民币计价（已减免跨国通道费）。如需定制企业席位，请联系销售。"}
        </p>
      </div>
    </div>
  );
}

function ValueProp({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-2 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div>
        <p className="text-xs font-bold text-fg">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{desc}</p>
      </div>
    </div>
  );
}

function PlanCard({
  locale,
  name,
  nameCN,
  priceUsd,
  priceCny,
  allowance,
  allowanceCN,
  features,
  featuresCN,
  highlighted,
  badge,
  action,
  onAction,
  loading
}: {
  locale: string;
  name: string;
  nameCN: string;
  priceUsd: string;
  priceCny: string;
  allowance: string;
  allowanceCN: string;
  features: readonly string[];
  featuresCN: readonly string[];
  highlighted?: boolean;
  badge?: string | null;
  action: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  const displayPrice = locale === "en" ? priceUsd : priceCny;
  const displayAllowance = locale === "en" ? allowance : allowanceCN;
  const displayFeatures = locale === "en" ? features : featuresCN;
  const roleLabel = locale === "en" ? name : nameCN;

  return (
    <article
      className={`relative flex flex-col rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 ${
        highlighted ? "panel-command shadow-glow-brand" : "panel panel-hover"
      }`}
    >
      {badge ? (
        <div className="absolute -top-3 left-1/2 z-10 shrink-0 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
            <Zap className="h-3 w-3 animate-pulse" />
            {badge}
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col justify-between">
        <div>
          {/* Role title + price */}
          <div className={`mb-4 flex items-start justify-between gap-3 border-b pb-4 ${highlighted ? "border-white/10" : "border-hairline"}`}>
            <div>
              <h2 className={`text-lg font-bold leading-tight ${highlighted ? "text-white" : "text-fg"}`}>{roleLabel}</h2>
              <p className={`mt-0.5 text-[11px] font-semibold ${highlighted ? "text-white/50" : "text-fg-muted"}`}>
                {locale === "en" ? "/ month retainer" : "底薪 / 月"}
              </p>
            </div>
            <div className="text-right">
              <p className={`tabular text-2xl font-bold leading-none ${highlighted ? "text-brand" : "text-fg"}`}>{displayPrice}</p>
              <p className={`mt-1 text-[11px] font-medium ${highlighted ? "text-white/40" : "text-fg-muted"}`}>
                {locale === "en" ? priceCny : priceUsd} / mo
              </p>
            </div>
          </div>

          {/* Monthly kit allowance = "output quota" */}
          <p
            className={`rounded-lg p-2.5 text-center text-xs font-bold ${
              highlighted ? "border border-white/10 bg-white/[0.05] text-brand" : "border border-hairline bg-surface-2 text-brand-strong dark:text-brand"
            }`}
          >
            {displayAllowance}
          </p>
        </div>

        <div className="mt-5 flex flex-1 flex-col justify-between">
          <div className="space-y-3">
            {displayFeatures.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5 text-xs sm:text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className={highlighted ? "text-white/70" : "font-medium text-fg-muted"}>{feature}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAction}
            disabled={!onAction || loading}
            className={`focus-ring mt-7 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${
              highlighted
                ? "bg-brand text-white hover:bg-brand-strong active:scale-[0.98]"
                : onAction
                  ? "bg-fg text-bg hover:opacity-90 active:scale-[0.98]"
                  : "cursor-default bg-surface-2 text-fg-muted"
            }`}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{action}</span>
            {onAction && !loading ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </div>
      </div>
    </article>
  );
}
