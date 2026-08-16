"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Coins,
  CreditCard,
  Gift,
  Info,
  Loader2,
  ReceiptText,
  RotateCcw,
  Smartphone,
  Users,
  Zap
} from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PlanId } from "@/lib/payment";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { CreditSpendBreakdown } from "@/components/billing/CreditSpendBreakdown";
import { CreditPackStore } from "@/components/billing/CreditPackStore";
import {
  buildPlanApplicationHref,
  getBillingPlanAcquisition
} from "@/lib/billing-plan-acquisition";
import {
  PLAN_SCENARIOS,
  PRICING_PLAN_ORDER,
  PRICING_PLANS,
  formatPlanPrice,
  getLocalizedPlanCopy,
  isPaidPublicPlanKey,
  marketForLocale,
  type PaidPublicPlanKey,
  type PublicPlanKey
} from "@/lib/pricing";

type EffectivePlan = PlanId | "free";

function publicPlanForEntitlement(plan: EffectivePlan | null): PublicPlanKey | null {
  if (plan === "free") return "free";
  if (plan === "starter" || plan === "starter_v2") return "starter";
  if (plan === "pro" || plan === "creator_v2") return "creator";
  if (plan === "growth" || plan === "growth_v2") return "growth";
  if (plan === "employee" || plan === "digital_employee_v2") return "digital_employee";
  return null;
}

export default function BillingPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get("plan");
  const selectedPlan = isPaidPublicPlanKey(requestedPlan) ? requestedPlan : null;
  const [loadingPlan, setLoadingPlan] = useState<PaidPublicPlanKey | null>(null);
  const [alipayPlan, setAlipayPlan] = useState<PaidPublicPlanKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<EffectivePlan | null>(null);
  const [refundEligible, setRefundEligible] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const selectedIsCurrent = selectedPlan !== null && publicPlanForEntitlement(currentPlan) === selectedPlan;

  useEffect(() => {
    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; plan?: string }) => {
        if (data.authenticated) setCurrentPlan((data.plan as EffectivePlan) ?? "free");
      })
      .catch(() => undefined);

    captureEvent("pricing_viewed", {
      locale,
      market: marketForLocale(locale),
      currency: locale === "en" ? "USD" : "CNY",
      billing_period: "monthly",
      source_page: "billing",
      is_existing_user: false
    });

    fetch("/api/refund", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { eligible?: boolean; latestRequest?: { status?: string } | null }) => {
        setRefundEligible(Boolean(data.eligible));
        setRefundStatus(data.latestRequest?.status ?? null);
      })
      .catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    if (!selectedPlan) return;
    captureEvent("checkout_intent_resumed", {
      locale,
      plan_key: selectedPlan,
      source_page: "billing",
      market: marketForLocale(locale)
    });
  }, [locale, selectedPlan]);

  async function startCheckout(plan: PaidPublicPlanKey) {
    const market = marketForLocale(locale);
    const pricingPlan = PRICING_PLANS[plan];
    const isExistingUser = currentPlan !== null && currentPlan !== "free";
    setLoadingPlan(plan);
    setMessage(null);
    captureEvent("pricing_plan_cta_clicked", {
      locale,
      market,
      currency: pricingPlan.currency[market],
      plan_key: plan,
      billing_period: "monthly",
      price: pricingPlan.price[market],
      source_page: "billing",
      is_existing_user: isExistingUser
    });
    captureEvent("checkout_started", {
      locale,
      market,
      currency: pricingPlan.currency[market],
      plan_key: plan,
      billing_period: "monthly",
      price: pricingPlan.price[market],
      source_page: "billing",
      is_existing_user: isExistingUser
    });

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, market, locale })
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout.");
      }

      window.location.href = data.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      captureEvent("checkout_failed", {
        locale,
        market,
        currency: pricingPlan.currency[market],
        plan_key: plan,
        billing_period: "monthly",
        price: pricingPlan.price[market],
        source_page: "billing",
        is_existing_user: isExistingUser
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  function startPlanApplication(plan: PaidPublicPlanKey) {
    const market = marketForLocale(locale);
    const pricingPlan = PRICING_PLANS[plan];
    captureEvent("pricing_plan_cta_clicked", {
      locale,
      market,
      currency: pricingPlan.currency[market],
      plan_key: plan,
      billing_period: "monthly",
      price: pricingPlan.price[market],
      source_page: "billing",
      is_existing_user: currentPlan !== null && currentPlan !== "free",
      acquisition_mode: "application"
    });
    window.location.href = buildPlanApplicationHref(plan, locale);
  }

  async function startQrcodeCheckout(plan: "starter" | "creator") {
    const pricingPlan = PRICING_PLANS[plan];
    setAlipayPlan(plan);
    setMessage(null);
    captureEvent("pricing_plan_cta_clicked", {
      locale,
      market: "cn",
      currency: "CNY",
      plan_key: plan,
      billing_period: "monthly",
      price: pricingPlan.price.cn,
      source_page: "billing",
      is_existing_user: currentPlan !== null && currentPlan !== "free",
      payment_method: "alipay_qrcode"
    });
    captureEvent("checkout_started", {
      locale,
      market: "cn",
      currency: "CNY",
      plan_key: plan,
      billing_period: "monthly",
      price: pricingPlan.price.cn,
      source_page: "billing",
      is_existing_user: currentPlan !== null && currentPlan !== "free",
      payment_method: "alipay_qrcode"
    });
    try {
      const response = await fetch("/api/checkout-qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: pricingPlan.internalPlan })
      });
      const data = (await response.json()) as { orderId?: string; error?: string };
      if (!response.ok || !data.orderId) {
        throw new Error(data.error ?? "Unable to start checkout.");
      }
      window.location.href = `/billing/pay/${data.orderId}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      captureEvent("checkout_failed", {
        locale,
        market: "cn",
        currency: "CNY",
        plan_key: plan,
        billing_period: "monthly",
        price: pricingPlan.price.cn,
        source_page: "billing",
        is_existing_user: currentPlan !== null && currentPlan !== "free",
        payment_method: "alipay_qrcode"
      });
    } finally {
      setAlipayPlan(null);
    }
  }

  async function requestRefund() {
    const confirmed = window.confirm(
      locale === "en"
        ? "Request a refund? Your subscription will be canceled immediately and the charge returned to your original payment method within 5–10 business days."
        : "确认申请退款？订阅将立即取消，款项按原支付方式在 5–10 个工作日内退回。"
    );
    if (!confirmed) return;

    setRefundLoading(true);
    setRefundMessage(null);
    captureEvent("refund_request_start", {});

    try {
      const response = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to process refund request.");
      }

      setRefundStatus("pending");
      setRefundEligible(false);
      setCurrentPlan("free");
      setRefundMessage(data.message ?? null);
      captureEvent("refund_request_success", { status: data.status });
    } catch (error) {
      setRefundMessage(
        error instanceof Error ? error.message : "Unable to process refund request."
      );
      captureEvent("refund_request_failed", { error: String(error) });
    } finally {
      setRefundLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 pb-10">

      {/* Header */}
      <div className="border-b border-hairline pb-5">
        <p className="eyebrow">{locale === "en" ? "Pricing & Billing" : "价格与账单"}</p>
        <h1 className="mt-1.5 text-3xl font-bold text-fg">
          {locale === "en" ? "Choose the Finfold plan that fits you" : "选择适合你的 Finfold 方案"}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-fg-muted">
          {locale === "en"
            ? "Start with 50 AI Credits for free. Upgrade when you need more Credits, consistent multi-channel publishing, or ongoing automation."
            : "免费版每月包含 50 创作点数。需要更多点数、稳定经营多个平台或持续自动化时，再选择付费方案。"}
        </p>

        <details className="group mt-4 max-w-3xl">
          <summary className="focus-ring inline-flex list-none items-center gap-2 rounded-lg px-1 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
            <Info className="h-3.5 w-3.5 text-brand" />
            <span>{locale === "en" ? "What do paid plans add?" : "付费套餐替你省掉什么？"}</span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="mt-2 max-w-3xl rounded-xl border border-brand/20 bg-brand/[0.045] px-4 py-3 text-xs leading-6 text-fg-muted">
            {locale === "en"
              ? "Claude and Skills can generate content. Finfold's paid tiers replace the recurring work around generation: maintaining brand and channel rules, producing full visual sets, preserving publish state, feeding results into the next cycle, and — at the top tier — research and human growth-operator review."
              : "Claude 和 Skills 可以生成内容。Finfold 付费档替代的是生成之外反复发生的工作：维护品牌与平台规则、交付整套视觉、保存发布状态、把结果喂回下一轮；最高档再加入逐帖调研和真人增长运营复核。"}
          </p>
        </details>
      </div>

      {selectedPlan ? (
        <section className="rounded-2xl border border-brand/35 bg-brand/[0.07] p-4 shadow-glow-brand sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5" data-testid="billing-selected-plan">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">
              {locale === "en" ? "Selection preserved" : "已保留你的套餐选择"}
            </p>
            <h2 className="mt-1.5 text-lg font-bold text-fg">
              {getLocalizedPlanCopy(selectedPlan, locale).name} · {formatPlanPrice(PRICING_PLANS[selectedPlan], marketForLocale(locale))}/{locale === "en" ? "month" : "月"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-fg-muted">
              {selectedPlan === "starter"
                ? locale === "en"
                  ? "Start with one focused growth mission. Finfold prepares the work; you approve the important actions."
                  : "从一个明确的增长任务开始。Finfold 准备执行内容，你确认关键动作。"
                : locale === "en"
                  ? "Continue with the plan you selected before signing in."
                  : "继续开通你在登录前选择的套餐。"}
            </p>
          </div>
          <button
            type="button"
            disabled={currentPlan === null || loadingPlan === selectedPlan}
            onClick={() => {
              if (selectedIsCurrent) {
                window.location.href = "/dashboard";
                return;
              }
              const acquisition = getBillingPlanAcquisition(selectedPlan, locale);
              if (acquisition.kind === "checkout") void startCheckout(selectedPlan);
              else startPlanApplication(selectedPlan);
            }}
            className="btn-primary focus-ring mt-4 inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 px-5 sm:mt-0 sm:w-auto"
          >
            {loadingPlan === selectedPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {selectedIsCurrent
              ? locale === "en" ? "Open Mission Control" : "进入任务中心"
              : locale === "en" ? "Continue" : "继续开通"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      ) : null}

      {/* Plan cards */}
      <div
        role="region"
        aria-label={locale === "en" ? "Plan comparison" : "套餐横向对比"}
        tabIndex={0}
        className="focus-ring -mx-1 overflow-x-auto overscroll-x-contain rounded-xl px-1 pb-2 pt-3 [scrollbar-width:thin]"
      >
        <div className="grid min-w-[1320px] grid-cols-5 items-stretch gap-5">
          {PRICING_PLAN_ORDER.map((key) => {
            const plan = PRICING_PLANS[key];
            const isFree = key === "free";
            const currentPublicPlan = publicPlanForEntitlement(currentPlan);
            const isCurrent = currentPublicPlan === key;

            let actionLabel: string;
            let disableAction = false;
            let actionHandler: (() => void) | undefined;
            if (currentPlan === null) {
              actionLabel = locale === "en" ? "Checking subscription…" : "正在核对订阅…";
              disableAction = true;
            } else if (isCurrent) {
              actionLabel = locale === "en" ? "Current plan" : "当前套餐";
              disableAction = true;
            } else if (isFree) {
              actionLabel = locale === "en" ? "Free plan" : "免费方案";
              disableAction = true;
            } else {
              const acquisition = getBillingPlanAcquisition(key, locale);
              actionLabel = acquisition.cta;
              actionHandler =
                acquisition.kind === "checkout"
                  ? () => void startCheckout(key)
                  : () => startPlanApplication(key);
            }

            return (
              <PlanCard
                key={plan.key}
                locale={locale}
                planKey={key}
                selected={selectedPlan === key}
                action={actionLabel}
                loading={!isFree && loadingPlan === key}
                onAction={!disableAction ? actionHandler : undefined}
                onAlipay={
                  !isFree && !disableAction && locale !== "en" && (key === "starter" || key === "creator")
                    ? () => void startQrcodeCheckout(key)
                    : undefined
                }
                alipayLoading={!isFree && alipayPlan === key}
              />
            );
          })}
        </div>
      </div>

      {message ? (
        <p className="max-w-md rounded-xl border border-risk/30 bg-risk/10 p-4 text-xs font-medium text-risk sm:text-sm">{message}</p>
      ) : null}

      <div className="grid gap-3">
        <BillingDisclosure
          icon={CircleHelp}
          title={locale === "en" ? "Help me choose" : "选套餐帮助"}
          description={locale === "en" ? "Match a plan to your current publishing stage." : "按你当前的内容经营阶段快速定位套餐。"}
        >
          <div className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            {PLAN_SCENARIOS[locale].map((item) => (
              <div key={item.plan} className="flex items-center justify-between gap-4 border-b border-hairline py-3 first:pt-0 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0">
                <p className="text-sm leading-6 text-fg-muted">{item.scenario}</p>
                <p className="shrink-0 text-sm font-semibold text-fg">{PRICING_PLANS[item.plan].copy[locale].name}</p>
              </div>
            ))}
          </div>
        </BillingDisclosure>

        <BillingDisclosure
          icon={Coins}
          title={locale === "en" ? "Credits & top-ups" : "点数与加购"}
          description={locale === "en" ? "Review usage, earn referral Credits, or buy a permanent top-up." : "查看点数去向、邀请奖励，或购买永久有效的补充包。"}
        >
          <div className="grid gap-4">
            {/* §10.2 — where this cycle's credits went (only renders when there is spend) */}
            <CreditSpendBreakdown locale={locale} />

            <div className="relative overflow-hidden rounded-xl border border-brand/20 bg-brand/[0.045] p-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div className="relative flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Gift className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-fg">
                    {locale === "en" ? "Earn Credits by inviting a friend" : "邀请好友，双方各得 100 创作点数"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-fg-muted">
                    {locale === "en"
                      ? "The reward is issued after your friend completes their first creation."
                      : "好友完成第一次创作后，奖励自动发放。"}
                  </p>
                </div>
              </div>
              <Link
                href="/invite"
                onClick={() => captureEvent("referral_entry_clicked", { surface: "billing" })}
                className="btn-ghost focus-ring relative mt-3 w-full justify-center sm:mt-0 sm:w-auto"
              >
                {locale === "en" ? "Invite & earn" : "去邀请"} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* §10.4 — store stays independently collapsible because top-ups are occasional. */}
            <CreditPackStore locale={locale} />
          </div>
        </BillingDisclosure>

        <BillingDisclosure
          icon={ReceiptText}
          title={locale === "en" ? "Payments & billing" : "支付与账单"}
          description={locale === "en" ? "Payment methods, refund protection, and subscription terms." : "查看付款方式、退款保障与订阅须知。"}
        >
          <div className="grid gap-6">
            <section aria-labelledby="billing-payment-methods">
              <p id="billing-payment-methods" className="text-xs font-bold uppercase tracking-wide text-fg">
                {locale === "en" ? "Payment methods" : "付款方式"}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5">
                  <CreditCard className="h-5 w-5 shrink-0 text-brand" />
                  <div>
                    <p className="text-xs font-semibold text-fg">
                      {locale === "en" ? "Credit / Debit Card" : "信用卡 / 借记卡"}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-fg-muted">
                      {locale === "en" ? "Visa, Mastercard, Amex, Apple Pay, and Google Pay" : "支持 Visa、Mastercard、Amex、Apple Pay 与 Google Pay"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/[0.055] p-3.5">
                  <Smartphone className="h-5 w-5 shrink-0 text-brand" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-fg">{locale === "en" ? "Alipay" : "支付宝"}</p>
                      <span className="inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                        {locale === "en" ? "Available now" : "已开通"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-5 text-fg-muted">
                      {locale === "en"
                        ? "Available for Starter, Creator, and every permanent Credit pack."
                        : "入门版、创作者版及全部永久点数包均支持支付宝扫码付款。"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section aria-labelledby="billing-refund-policy" className="border-t border-hairline pt-5">
              <p id="billing-refund-policy" className="text-xs font-bold uppercase tracking-wide text-fg">
                {locale === "en" ? "Refund policy" : "退款政策"}
              </p>
              <p className="mt-2 max-w-4xl text-xs leading-6 text-fg-muted">
                {locale === "en"
                  ? "Every paid plan carries a 3-day no-questions-asked refund from the day you're charged. Digital Employee adds a first-month satisfaction guarantee."
                  : "所有付费套餐从扣费当天起享有 3 天无理由退款；数字员工档额外提供首月满意保障。"}
              </p>

              {/* Self-service refund action — shown to paid subscribers */}
              {refundEligible || refundStatus === "pending" ? (
                <div className="mt-3 flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-fg">
                      {refundStatus === "pending"
                        ? locale === "en"
                          ? "Your refund is being processed"
                          : "退款处理中"
                        : locale === "en"
                          ? "Not satisfied? Request a refund"
                          : "不满意？申请退款"}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
                      {refundStatus === "pending"
                        ? locale === "en"
                          ? "The charge will be returned to your original payment method within 5–10 business days."
                          : "款项将按原支付方式在 5–10 个工作日内退回。"
                        : locale === "en"
                          ? "One click — no email needed. Your subscription will be canceled and the charge refunded."
                          : "一键申请，无需邮件。订阅将取消，费用原路退回。"}
                    </p>
                  </div>
                  {refundStatus === "pending" ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-bold text-fg-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {locale === "en" ? "In progress" : "处理中"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void requestRefund()}
                      disabled={refundLoading}
                      className="focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-hairline bg-surface px-3.5 py-2 text-xs font-bold text-fg transition-all hover:border-risk/40 hover:text-risk active:scale-[0.98] disabled:opacity-50"
                    >
                      {refundLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      {locale === "en" ? "Request refund" : "申请退款"}
                    </button>
                  )}
                </div>
              ) : null}

              {refundMessage ? (
                <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-medium leading-relaxed text-fg-muted">
                  {refundMessage}
                </p>
              ) : null}
            </section>

            <section aria-labelledby="billing-notes" className="border-t border-hairline pt-5 text-fg-muted">
              <p id="billing-notes" className="text-xs font-bold uppercase tracking-wide text-fg">
                {locale === "en" ? "Billing notes" : "订阅须知"}
              </p>
              <p className="mt-2 max-w-4xl text-xs leading-6">
                {locale === "en"
                  ? "All prices are monthly. Cancel, downgrade, or pause anytime — no charge next month. Card payments are processed securely by Creem in USD. Alipay purchases use the displayed CNY amount. For custom enterprise seats, contact sales."
                  : "所有价格均为月付，随时退订、降级或暂停，下月不再扣费。页面人民币价格为本地参考价；信用卡由 Creem 按对应美元月价安全结算，支付宝按页面人民币金额实付。如需定制企业席位，请联系销售。"}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <a href="/terms" className="focus-ring rounded underline decoration-hairline underline-offset-2 transition-colors hover:text-fg">
                  {locale === "en" ? "Terms of Service" : "服务条款"}
                </a>
                <a href="/privacy" className="focus-ring rounded underline decoration-hairline underline-offset-2 transition-colors hover:text-fg">
                  {locale === "en" ? "Privacy Policy" : "隐私政策"}
                </a>
                <a href="/refund" className="focus-ring rounded underline decoration-hairline underline-offset-2 transition-colors hover:text-fg">
                  {locale === "en" ? "Refund Policy" : "退款政策"}
                </a>
              </p>
            </section>
          </div>
        </BillingDisclosure>
      </div>
    </div>
  );
}

function BillingDisclosure({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group panel-inset overflow-hidden">
      <summary className="focus-ring flex list-none items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-fg">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-5 text-fg-muted">{description}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-hairline px-4 py-5 sm:px-5">
        {children}
      </div>
    </details>
  );
}

function PlanCard({
  locale,
  planKey,
  action,
  onAction,
  loading,
  onAlipay,
  alipayLoading,
  selected = false
}: {
  locale: "zh" | "en";
  planKey: PublicPlanKey;
  action: string;
  onAction?: () => void;
  loading?: boolean;
  onAlipay?: () => void;
  alipayLoading?: boolean;
  selected?: boolean;
}) {
  const plan = PRICING_PLANS[planKey];
  const copy = getLocalizedPlanCopy(planKey, locale);
  const market = marketForLocale(locale);
  const highlighted = plan.highlighted;
  const badge = copy.badge;
  const acquisition = planKey === "free" ? null : getBillingPlanAcquisition(planKey, locale);

  return (
    <article
      aria-labelledby={`billing-plan-${planKey}`}
      className={`relative flex flex-col rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 ${
        highlighted
          ? "panel-command shadow-glow-brand ring-1 ring-brand/60"
          : selected
            ? "panel border-brand/60 bg-brand/[0.045] shadow-glow-brand ring-2 ring-brand/35"
          : planKey === "digital_employee"
            ? "panel panel-hover border-brand/30 bg-brand/[0.035]"
            : "panel panel-hover"
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
              <h2 id={`billing-plan-${planKey}`} className={`text-lg font-bold leading-tight ${highlighted ? "text-white" : "text-fg"}`}>{copy.name}</h2>
              <p className={`mt-0.5 text-[11px] font-semibold ${highlighted ? "text-white/50" : "text-fg-muted"}`}>
                {locale === "en" ? "/ month" : "/ 月"}
              </p>
            </div>
            <div className="text-right">
              <p className={`tabular whitespace-nowrap text-2xl font-bold leading-none ${highlighted ? "text-brand" : "text-fg"}`}>{formatPlanPrice(plan, market)}</p>
            </div>
          </div>

          <p className={`mb-4 min-h-[3.75rem] text-xs leading-5 ${highlighted ? "text-white/60" : "text-fg-muted"}`}>
            {copy.description}
          </p>

          {acquisition?.availabilityNote ? (
            <p
              data-testid={`billing-plan-${planKey}-availability`}
              className="mb-4 rounded-lg border border-brand/25 bg-brand/5 p-2.5 text-[11px] font-medium leading-5 text-fg-muted"
            >
              {acquisition.availabilityNote}
            </p>
          ) : null}

          <p
            className={`rounded-lg p-2.5 text-center text-xs font-bold ${
              highlighted ? "border border-white/10 bg-white/[0.05] text-brand" : "border border-hairline bg-surface-2 text-brand-strong dark:text-brand"
            }`}
          >
            {copy.allowance}
          </p>
        </div>

        <div className="mt-5 flex flex-1 flex-col justify-between">
          <ul className="space-y-3">
            {copy.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-xs sm:text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className={highlighted ? "text-white/70" : "font-medium text-fg-muted"}>{feature}</span>
              </li>
            ))}
          </ul>

          {copy.exclusions?.length ? (
            <ul className={`mt-5 space-y-1.5 border-t pt-4 ${highlighted ? "border-white/10" : "border-hairline"}`} aria-label={locale === "en" ? "Not included" : "暂不包含"}>
              {copy.exclusions.map((item) => (
                <li key={item} className={`flex gap-2 text-[11px] leading-5 ${highlighted ? "text-white/45" : "text-fg-muted"}`}>
                  <span aria-hidden>—</span>{item}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-7 space-y-2">
            <button
              type="button"
              onClick={onAction}
              disabled={!onAction || loading || alipayLoading}
              className={`focus-ring inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${
                highlighted
                  ? "bg-brand text-white hover:bg-brand-strong active:scale-[0.98]"
                  : onAction
                    ? "bg-fg text-bg hover:opacity-90 active:scale-[0.98]"
                    : "cursor-default bg-surface-2 text-fg-muted"
              }`}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : acquisition?.kind === "application" && onAction ? (
                <Users className="h-4 w-4" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              <span>{action}</span>
              {onAction && !loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
            {onAlipay ? (
              <button
                type="button"
                onClick={onAlipay}
                disabled={alipayLoading || loading}
                className="focus-ring inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand/30 bg-brand/5 py-2 text-xs font-bold text-brand transition-all hover:bg-brand/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {alipayLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                <span>{locale === "en" ? "Pay with Alipay" : "支付宝付款"}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
