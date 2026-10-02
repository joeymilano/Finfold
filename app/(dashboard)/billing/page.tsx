"use client";

import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Info,
  Loader2,
  ReceiptText,
  RotateCcw,
  Smartphone,
  Users,
  Zap
} from "@/components/ui/icons";
import { AlipayIcon, WechatPayIcon } from "@/components/billing/PaymentBrandIcons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PlanId } from "@/lib/payment/types";
import { useLocale } from "@/hooks/useLocale";
import { captureEvent } from "@/lib/posthog";
import { CreditBalanceCard } from "@/components/billing/CreditBalanceCard";
import { MonthlyRenewalChoice } from "@/components/billing/MonthlyRenewalChoice";
import { formatMonthlyUsd, monthlyOfferPrice } from "@/lib/payment/monthly-offer";
import { ZcwPayModal, type ZcwCheckoutOrder } from "@/components/billing/ZcwPayModal";
import {
  buildPlanApplicationHref,
  getBillingPlanAcquisition,
  getGrowthCheckoutMode
} from "@/lib/billing-plan-acquisition";
import {
  ENTERPRISE_SECTION,
  PLAN_SCENARIOS,
  PRICING_PLAN_ORDER,
  PRICING_PLANS,
  buildEnterpriseContactHref,
  formatPlanPrice,
  getLocalizedPlanCopy,
  isPaidPublicPlanKey,
  marketForLocale,
  type PaidPublicPlanKey,
  type PublicPlanKey
} from "@/lib/pricing";

type EffectivePlan = PlanId | "free";

/** Plans purchasable via scan-to-pay in zh — mirrors QRCODE_PLANS. */
const SCAN_PLAN_KEYS = ["starter", "creator", "growth", "digital_employee"] as const;
type ScanPlanKey = (typeof SCAN_PLAN_KEYS)[number];

function isScanPlanKey(key: PublicPlanKey): key is ScanPlanKey {
  return SCAN_PLAN_KEYS.some((k) => k === key);
}

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
  const [autoRenewPlans, setAutoRenewPlans] = useState<Partial<Record<PaidPublicPlanKey, boolean>>>({});
  const [cancelLoading, setCancelLoading] = useState(false);
  const [renewalCanceled, setRenewalCanceled] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PaidPublicPlanKey | null>(null);
  const [scanLoadingChannel, setScanLoadingChannel] = useState<"alipay" | "wxpay" | null>(null);
  const [zcwOrder, setZcwOrder] = useState<ZcwCheckoutOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [currentPlan, setCurrentPlan] = useState<EffectivePlan | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [refundEligible, setRefundEligible] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const selectedIsCurrent = selectedPlan !== null && publicPlanForEntitlement(currentPlan) === selectedPlan;

  useEffect(() => {
    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; plan?: string; paymentProvider?: string | null }) => {
        if (data.authenticated) {
          setCurrentPlan((data.plan as EffectivePlan) ?? "free");
          setPaymentProvider(data.paymentProvider ?? null);
        }
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

  async function startCheckout(plan: PaidPublicPlanKey, opts?: { autoRenew?: boolean }) {
    const market = marketForLocale(locale);
    const pricingPlan = PRICING_PLANS[plan];
    const isExistingUser = currentPlan !== null && currentPlan !== "free";
    // This button always opens Creem card billing. Creem currently charges the
    // global USD product even when the billing page is displaying the CN market;
    // keep analytics and confirmation copy aligned with the real charge.
    const checkoutCurrency = "USD";
    // The payment-method panel's card option enters here with autoRenew: true
    // directly (no checkbox in that UI), so the explicit opt-in wins.
    const autoRenew = opts?.autoRenew === true || (currentPlan === "free" && autoRenewPlans[plan] === true);
    if (currentPlan === "free" && !autoRenew) {
      setMessageTone("info");
      setMessage(locale === "en" ? "Select monthly auto-renewal on your plan to continue with card billing." : "请在套餐卡片上勾选连续包月，再使用信用卡付款。");
      document.getElementById(`renewal-${plan}`)?.focus();
      return;
    }
    const checkoutPrice = autoRenew ? monthlyOfferPrice(pricingPlan.price.global) : pricingPlan.price.global;
    const growthCheckoutMode = plan === "growth"
      ? getGrowthCheckoutMode(currentPlan, paymentProvider)
      : null;
    if (growthCheckoutMode === "assisted_migration") {
      setMessageTone("info");
      setMessage(
        locale === "en"
          ? "Your current plan uses a different payment channel. Contact support@finfold.app to migrate to Growth without paying twice."
          : "你当前套餐使用其他支付渠道。请联系 support@finfold.app 迁移到增长引擎，避免重复付款。"
      );
      captureEvent("subscription_upgrade_assistance_required", {
        locale,
        market,
        from_plan: currentPlan,
        to_plan: "growth",
        payment_provider: paymentProvider ?? "unknown"
      });
      return;
    }
    if (plan === "growth") {
      const confirmed = window.confirm(
        isExistingUser
          ? locale === "en"
            ? `Creem will charge the prorated USD difference immediately. Future renewals are $${pricingPlan.price.global}/month. Continue?`
            : `Creem 将立即以美元补扣本周期差价；后续按 $${pricingPlan.price.global}/月续费。是否继续？`
          : locale === "en"
            ? `Creem will charge ${formatMonthlyUsd(checkoutPrice)} USD per month with auto-renewal. Continue to secure checkout?`
            : `Creem 将按 ${formatMonthlyUsd(checkoutPrice)} USD/月自动续费（已享九折）。是否继续？`
      );
      if (!confirmed) return;
    }
    setLoadingPlan(plan);
    setMessage(null);
    setMessageTone("info");
    captureEvent("pricing_plan_cta_clicked", {
      locale,
      market,
      currency: checkoutCurrency,
      plan_key: plan,
      billing_period: "monthly",
      price: checkoutPrice,
      source_page: "billing",
      is_existing_user: isExistingUser
    });
    captureEvent("checkout_started", {
      locale,
      market,
      currency: checkoutCurrency,
      plan_key: plan,
      billing_period: "monthly",
      price: checkoutPrice,
      source_page: "billing",
      is_existing_user: isExistingUser
    });

    try {
      const upgradingExistingSubscription = growthCheckoutMode === "creem_upgrade";
      const response = await fetch(upgradingExistingSubscription ? "/api/subscriptions/upgrade" : "/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, market, locale, paymentMethod: "creem", autoRenew })
      });
      const data = (await response.json()) as { url?: string; pending?: boolean; message?: string; error?: string };

      if (!response.ok || (!data.url && !data.pending)) {
        throw new Error(data.error ?? "Unable to start checkout.");
      }

      if (data.pending) {
        setMessageTone("info");
        setMessage(data.message ?? (locale === "en" ? "Upgrade accepted. Confirming your Growth access…" : "升级已受理，正在确认 Growth 权益…"));
        const activated = await waitForGrowthEntitlement();
        if (activated) {
          setCurrentPlan("growth_v2");
          setMessageTone("success");
          setMessage(locale === "en" ? "Growth is active. Your upgraded allowance is ready." : "Growth 已生效，升级后的额度可以使用了。");
        } else {
          setMessageTone("info");
          setMessage(locale === "en" ? "Payment was accepted. Growth will unlock as soon as Creem's signed confirmation arrives." : "支付已受理；收到 Creem 签名确认后，Growth 会自动生效。");
        }
        return;
      }

      window.location.href = data.url!;
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      captureEvent("checkout_failed", {
        locale,
        market,
        currency: checkoutCurrency,
        plan_key: plan,
        billing_period: "monthly",
        price: checkoutPrice,
        source_page: "billing",
        is_existing_user: isExistingUser
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  // CN scan-to-pay path (ZCW aggregate gateway): Alipay / WeChat QR for one
  // starter/creator/growth month at the exact CNY price. No auto-renewal —
  // the card path below keeps the monthly-offer flow, so the two never mix.
  async function startScanCheckout(plan: ScanPlanKey, channel: "alipay" | "wxpay") {
    const planId = PRICING_PLANS[plan].internalPlan;
    const pricingPlan = PRICING_PLANS[plan];
    setScanLoadingChannel(channel);
    setMessage(null);
    try {
      const response = await fetch("/api/checkout-zcwpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "plan",
          planId,
          channel,
          name: `Finfold ${getLocalizedPlanCopy(plan, locale).name} · 1个月`
        })
      });
      const data = (await response.json()) as { order?: ZcwCheckoutOrder; error?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.error ?? (locale === "en" ? "Unable to start checkout." : "无法发起支付。"));
      }
      captureEvent("checkout_started", {
        locale,
        market: "cn",
        currency: "CNY",
        plan_key: plan,
        billing_period: "monthly",
        price: pricingPlan.price.cn,
        source_page: "billing",
        payment_method: "scan_qrcode",
        wallet: channel
      });
      setZcwOrder(data.order);
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : locale === "en"
            ? "Unable to start checkout."
            : "无法发起支付。"
      );
      captureEvent("checkout_failed", {
        locale,
        market: "cn",
        currency: "CNY",
        plan_key: plan,
        source_page: "billing",
        payment_method: "scan_qrcode",
        reason: error instanceof Error ? error.message : "unknown"
      });
    } finally {
      setScanLoadingChannel(null);
    }
  }

  async function waitForGrowthEntitlement(): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      try {
        const response = await fetch("/api/entitlements/check", { method: "POST", cache: "no-store" });
        const data = await response.json() as { authenticated?: boolean; plan?: string };
        if (response.ok && (data.plan === "growth" || data.plan === "growth_v2")) return true;
      } catch {
        // Keep polling within the short confirmation window. The webhook is
        // asynchronous and a transient entitlement read must not look like a
        // failed payment.
      }
    }
    return false;
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

  async function cancelRenewal() {
    if (!window.confirm(locale === "en"
      ? "Stop monthly renewal? Your plan stays available until the end of the paid period."
      : "确认取消连续包月？当前已付费周期仍可使用，到期后不再扣款。")) return;
    setCancelLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/subscriptions/cancel-renewal", { method: "POST" });
      const data = await response.json() as { error?: string; currentPeriodEnd?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to cancel renewal.");
      setRenewalCanceled(true);
      setMessageTone("success");
      setMessage(locale === "en" ? "Auto-renewal is canceled. Access remains available through your paid period." : "已取消连续包月。当前已付费周期仍可使用，到期后不再扣款。");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to cancel renewal.");
    } finally {
      setCancelLoading(false);
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

      <CreditBalanceCard locale={locale} />

      {paymentProvider === "creem" && currentPlan && currentPlan !== "free" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4">
          <p className="text-xs leading-5 text-fg-muted">{locale === "en" ? "Manage renewal for your existing subscription. Canceling keeps access through the paid period." : "管理当前订阅续费。取消后，已付费周期仍可使用。"}</p>
          <button type="button" className="btn-ghost focus-ring text-xs" onClick={() => void cancelRenewal()} disabled={cancelLoading || renewalCanceled}>
            {cancelLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {renewalCanceled ? locale === "en" ? "Renewal canceled" : "已取消续费" : locale === "en" ? "Cancel auto-renewal" : "取消连续包月"}
          </button>
        </div>
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
            const isDowngrade = currentPublicPlan !== null &&
              PRICING_PLAN_ORDER.indexOf(key) < PRICING_PLAN_ORDER.indexOf(currentPublicPlan);

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
              // Downgrades check out exactly like any other paid plan —
              // scan-to-pay is a self-serve single-month switch, so the card
              // only keeps the "Downgrade to …" label for clarity.
              const acquisition = getBillingPlanAcquisition(key, locale);
              actionLabel = isDowngrade
                ? locale === "en"
                  ? `Downgrade to ${getLocalizedPlanCopy(key, locale).name}`
                  : `降级至${getLocalizedPlanCopy(key, locale).name}`
                : acquisition.cta;
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
                autoRenew={!isFree && autoRenewPlans[key] === true}
                onAutoRenewChange={currentPlan === "free" && !isFree && key !== "digital_employee"
                  ? (checked) => setAutoRenewPlans((previous) => ({ ...previous, [key]: checked }))
                  : undefined}
                onAlipay={
                  !disableAction && locale !== "en" && isScanPlanKey(key)
                    ? () => void startScanCheckout(key, "alipay")
                    : undefined
                }
                onWechat={
                  !disableAction && locale !== "en" && isScanPlanKey(key)
                    ? () => void startScanCheckout(key, "wxpay")
                    : undefined
                }
                onCardCheckout={
                  !disableAction && locale !== "en" && isScanPlanKey(key)
                    ? () => void startCheckout(key, { autoRenew: true })
                    : undefined
                }
                alipayLoading={scanLoadingChannel === "alipay"}
                wechatLoading={scanLoadingChannel === "wxpay"}
              />
            );
          })}
        </div>
      </div>

      <div
        id="enterprise"
        data-testid="billing-enterprise-banner"
        className="mt-2 rounded-xl border border-brand/30 bg-brand/[0.04] p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{ENTERPRISE_SECTION[locale].eyebrow}</p>
          <p className="mt-2 text-sm font-bold text-fg sm:text-base">{ENTERPRISE_SECTION[locale].title}</p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">{ENTERPRISE_SECTION[locale].subtitle}</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {ENTERPRISE_SECTION[locale].features.map((feature) => (
              <li key={feature} className="flex items-center gap-1.5 text-xs leading-5 text-fg">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-positive" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-fg-muted">{ENTERPRISE_SECTION[locale].note}</p>
        </div>
        <a
          href={buildEnterpriseContactHref(locale)}
          onClick={() =>
            captureEvent("pricing_plan_cta_clicked", {
              locale,
              market: marketForLocale(locale),
              plan_key: "enterprise",
              source_page: "billing",
              is_existing_user: true
            })
          }
          className="btn-ghost focus-ring mt-4 w-full justify-center lg:mt-0 lg:w-auto"
        >
          {ENTERPRISE_SECTION[locale].cta} <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {message ? (
        <p className={`max-w-md rounded-xl border p-4 text-xs font-medium sm:text-sm ${
          messageTone === "error"
            ? "border-risk/30 bg-risk/10 text-risk"
            : messageTone === "success"
              ? "border-positive/30 bg-positive/10 text-positive"
              : "border-action/30 bg-action/[0.08] text-fg"
        }`}>{message}</p>
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

        {/* 购买与邀请入口已并入顶部余额卡（CreditBalanceCard），不再有底部面板。 */}

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
                      <p className="text-xs font-semibold text-fg">{locale === "en" ? "Alipay / WeChat Pay" : "支付宝 / 微信支付"}</p>
                      <span className="inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                        {locale === "en" ? "Scan to pay" : "扫码付款"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-5 text-fg-muted">
                      {locale === "en"
                        ? "Scan with the app to buy one starter or creator month in CNY. No auto-renewal."
                        : "入门版与创作者可扫码按月购买，人民币结算，不自动续费"}
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

              <Link
                href="/billing/orders"
                onClick={() => captureEvent("orders_entry_clicked", { surface: "billing-refund-policy" })}
                className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
              >
                <ReceiptText className="h-3.5 w-3.5" />
                {locale === "en" ? "View order history & refund status" : "查看订单记录与退款进度"}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </section>

            <section aria-labelledby="billing-notes" className="border-t border-hairline pt-5 text-fg-muted">
              <p id="billing-notes" className="text-xs font-bold uppercase tracking-wide text-fg">
                {locale === "en" ? "Billing notes" : "订阅须知"}
              </p>
              <p className="mt-2 max-w-4xl text-xs leading-6">
                {locale === "en"
                  ? "New Creem subscriptions require explicit auto-renewal consent and receive 10% off every monthly payment in USD. Existing subscriptions keep their agreed terms. Cancel renewal above to keep access through the paid period."
                  : "新开通 Creem 连续包月须主动勾选，首月及后续每月均按美元九折价扣款；现有订阅保留原约定。可在上方取消续费，已付费周期仍可使用。"}
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

      {/* 套餐扫码收银台：页面级挂载；购买补充包的收银台在余额卡的商店组件内部 */}
      {zcwOrder ? (
        <ZcwPayModal
          order={zcwOrder}
          onClose={() => {
            const wasPaid = zcwOrder.status === "paid";
            setZcwOrder(null);
            // A paid plan month changes entitlements — refresh.
            if (wasPaid) window.location.reload();
          }}
          onPaid={() =>
            setZcwOrder((prev) => (prev ? { ...prev, status: "paid" } : prev))
          }
        />
      ) : null}
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
  onWechat,
  onCardCheckout,
  alipayLoading,
  wechatLoading,
  selected = false,
  autoRenew = false,
  onAutoRenewChange
}: {
  locale: "zh" | "en";
  planKey: PublicPlanKey;
  action: string;
  onAction?: () => void;
  loading?: boolean;
  onAlipay?: () => void;
  onWechat?: () => void;
  onCardCheckout?: () => void;
  alipayLoading?: boolean;
  wechatLoading?: boolean;
  selected?: boolean;
  autoRenew?: boolean;
  onAutoRenewChange?: (checked: boolean) => void;
}) {
  const plan = PRICING_PLANS[planKey];
  const copy = getLocalizedPlanCopy(planKey, locale);
  // Price display follows the actual settlement channel. Chinese buyers can
  // settle a single month in CNY via scan-to-pay (every paid plan incl. the
  // digital employee); the Creem card path (the auto-renewal offer, or any
  // checkout from the en locale) charges USD, so the card says USD.
  const cnyScanAvailable =
    locale !== "en" && (planKey === "free" || isScanPlanKey(planKey));
  const market =
    cnyScanAvailable && !autoRenew
      ? marketForLocale(locale)
      : "global";
  const highlighted = plan.highlighted;
  const badge = copy.badge;
  const acquisition = planKey === "free" ? null : getBillingPlanAcquisition(planKey, locale);
  // 中文可购套餐：一个订阅主按钮，点开选择支付方式（支付宝 / 微信 / 信用卡）。
  // 英文与其他状态保持原有单按钮流程。
  const panelMode = Boolean(onAlipay && onWechat && onCardCheckout);
  const scanBusy = Boolean(alipayLoading || wechatLoading);
  const [payPanelOpen, setPayPanelOpen] = useState(false);
  const cardActionLabel = onAutoRenewChange
    ? autoRenew ? locale === "en" ? "Subscribe · 10% off" : "九折开通连续包月"
      : locale === "en" ? "Select auto-renewal above" : "请先勾选连续包月"
    : action;

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
                {market === "global" ? (locale === "en" ? "USD / month" : "美元 / 月") : "/ 月"}
              </p>
            </div>
            <div className="text-right">
              <p className={`tabular whitespace-nowrap text-2xl font-bold leading-none ${highlighted ? "text-brand" : "text-fg"}`}>{autoRenew && market === "global" ? formatMonthlyUsd(monthlyOfferPrice(plan.price.global)) : formatPlanPrice(plan, market)}</p>
              {autoRenew && market === "global" ? <del className={`mt-1 block text-xs ${highlighted ? "text-white/50" : "text-fg-muted"}`}>{formatPlanPrice(plan, market)}</del> : null}
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
            {!panelMode && onAutoRenewChange ? (
              <MonthlyRenewalChoice id={`renewal-${planKey}`} locale={locale} price={plan.price.global}
                checked={autoRenew} onChange={onAutoRenewChange} disabled={loading} highlighted={highlighted} />
            ) : null}
            {panelMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setPayPanelOpen((open) => !open)}
                  aria-expanded={payPanelOpen}
                  aria-controls={`pay-methods-${planKey}`}
                  disabled={loading || scanBusy}
                  className={`focus-ring inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm ${
                    highlighted
                      ? "bg-brand text-white hover:bg-brand-strong"
                      : "bg-fg text-bg hover:opacity-90"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className={`h-4 w-4 transition-transform ${payPanelOpen ? "rotate-180" : ""}`} />
                  )}
                  <span>{action}</span>
                </button>
                {payPanelOpen ? (
                  <div
                    id={`pay-methods-${planKey}`}
                    role="group"
                    aria-label={locale === "en" ? "Choose a payment method" : "选择支付方式"}
                    className="space-y-1.5 rounded-xl border border-hairline bg-surface-2 p-2"
                  >
                    <p className="px-1 pb-0.5 text-[10px] font-semibold text-fg-muted">
                      {locale === "en" ? "Payment method" : "选择支付方式"}
                    </p>
                    <button
                      type="button"
                      onClick={onAlipay}
                      disabled={scanBusy || loading}
                      className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-bg px-2.5 py-2 text-left transition-all hover:border-brand/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <AlipayIcon className="h-6 w-6 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-fg">{locale === "en" ? "Alipay" : "支付宝"}</span>
                        <span className="block text-[10px] text-fg-muted">扫码付 ¥{plan.price.cn}/{locale === "en" ? "month" : "月"} · 单月</span>
                      </span>
                      {alipayLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />}
                    </button>
                    <button
                      type="button"
                      onClick={onWechat}
                      disabled={scanBusy || loading}
                      className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-bg px-2.5 py-2 text-left transition-all hover:border-brand/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <WechatPayIcon className="h-6 w-6 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-fg">{locale === "en" ? "WeChat Pay" : "微信支付"}</span>
                        <span className="block text-[10px] text-fg-muted">扫码付 ¥{plan.price.cn}/{locale === "en" ? "month" : "月"} · 单月</span>
                      </span>
                      {wechatLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />}
                    </button>
                    <button
                      type="button"
                      onClick={onCardCheckout}
                      disabled={scanBusy || loading}
                      className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-bg px-2.5 py-2 text-left transition-all hover:border-brand/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] bg-fg/[0.07] dark:bg-white/10">
                        <CreditCard className="h-3.5 w-3.5 text-fg" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-fg">{locale === "en" ? "Card · Monthly" : "信用卡 · 连续包月"}</span>
                        <span className="block text-[10px] text-fg-muted">{formatMonthlyUsd(monthlyOfferPrice(plan.price.global))}/{locale === "en" ? "mo" : "月"} · 九折 · 美元结算</span>
                      </span>
                      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />}
                    </button>
                    <p className="px-1 pt-0.5 text-center text-[10px] leading-4 text-fg-muted">
                      {locale === "en" ? "QR pays one month, no auto-renewal · Card renews monthly with 10% off" : "扫码为单月购买、不自动续费；信用卡为连续包月，享九折"}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
            <button
              type="button"
              onClick={onAction}
              disabled={!onAction || loading || scanBusy || Boolean(onAutoRenewChange && !autoRenew)}
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
              <span>{cardActionLabel}</span>
              {onAction && !loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
