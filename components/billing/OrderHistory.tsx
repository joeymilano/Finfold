"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Loader2,
  LogIn,
  ReceiptText,
  RotateCcw,
  Zap
} from "@/components/ui/icons";
import type { OrderView, SubscriptionView } from "@/lib/payment/orders";
import { entitlementPlanName } from "@/lib/pricing";
import { captureEvent } from "@/lib/posthog";

/**
 * 订单记录页主体：当前订阅 + 全部一次性订单（扫码套餐月费、创作点数
 * 补充包），退款状态与 3 天自助退款入口都在每条记录上。
 * 数据源 /api/orders；退款走 /api/refund（orderId 参数=一次性订单，
 * 省略=订阅退款，服务端各自校验 3 天窗口）。
 */

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

type OrdersPayload = {
  orders?: OrderView[];
  subscription?: SubscriptionView | null;
};

function planDisplayName(planId: string | null, locale: string): string {
  return entitlementPlanName(planId, locale === "en" ? "en" : "zh");
}

function formatMoney(cents: number, currency: string): string {
  const value = (cents / 100).toFixed(2);
  return currency.toLowerCase() === "usd" ? `$${value}` : `¥${value}`;
}

function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function providerLabel(provider: string | null, locale: string): string {
  switch (provider) {
    case "zcwpay":
      return locale === "en" ? "Alipay / WeChat scan" : "支付宝 / 微信扫码";
    case "creem":
      return locale === "en" ? "Card via Creem" : "信用卡（Creem）";
    case "alipay_qrcode":
      return locale === "en" ? "Transfer QR" : "收款码转账";
    default:
      return provider ?? "—";
  }
}

const ORDER_STATUS_COPY: Record<OrderView["status"], { zh: string; en: string; className: string }> = {
  pending: { zh: "待支付", en: "Awaiting payment", className: "border-warning/30 bg-warning/10 text-warning" },
  paid: { zh: "已支付", en: "Paid", className: "border-positive/30 bg-positive/10 text-positive" },
  refunded: { zh: "已退款", en: "Refunded", className: "border-hairline bg-surface text-fg-muted" },
  failed: { zh: "未完成", en: "Failed", className: "border-risk/30 bg-risk/10 text-risk" }
};

const REFUND_STATUS_COPY: Record<
  Exclude<OrderView["refundStatus"], null>,
  { zh: string; en: string; className: string }
> = {
  pending: { zh: "退款处理中", en: "Refund in progress", className: "border-warning/30 bg-warning/10 text-warning" },
  completed: { zh: "已退款", en: "Refunded", className: "border-hairline bg-surface text-fg-muted" },
  rejected: { zh: "退款被驳回", en: "Refund declined", className: "border-risk/30 bg-risk/10 text-risk" }
};

function isPaidPlanId(planId: string | null): boolean {
  return Boolean(planId && planId !== "free");
}

export function OrderHistory({ locale }: { locale: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [subRefunding, setSubRefunding] = useState(false);

  const load = useCallback(() => {
    fetch("/api/orders", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          setLoadState("unauthenticated");
          return;
        }
        if (!res.ok) throw new Error("orders unavailable");
        const data = (await res.json()) as OrdersPayload;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setSubscription(data.subscription ?? null);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => {
    load();
    captureEvent("orders_viewed", { locale });
  }, [load, locale]);

  async function requestOrderRefund(order: OrderView) {
    const confirmed = window.confirm(
      locale === "en"
        ? `Request a refund for ${formatMoney(order.amountCents, order.currency)}? The credits from this order will be frozen and the payment returned to your original method within 5–10 business days.`
        : `确认退款 ${formatMoney(order.amountCents, order.currency)}？这份订单的点数将被冻结，款项按原支付方式在 5–10 个工作日内退回。`
    );
    if (!confirmed) return;

    setRefundingId(order.id);
    setMessage(null);
    captureEvent("order_refund_request_start", {
      order_code: order.orderCode,
      kind: order.kind,
      amount_cents: order.amountCents
    });

    try {
      const response = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id })
      });
      const data = (await response.json()) as { status?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to process refund request.");

      if (data.status === "already_requested") {
        setMessageTone("info");
      } else {
        setMessageTone("success");
        captureEvent("order_refund_request_success", { order_code: order.orderCode, kind: order.kind });
      }
      setMessage(data.message ?? null);
      load(); // refresh statuses
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to process refund request.");
      captureEvent("order_refund_request_failed", { order_code: order.orderCode });
    } finally {
      setRefundingId(null);
    }
  }

  async function requestSubscriptionRefund() {
    const confirmed = window.confirm(
      locale === "en"
        ? "Request a refund? Your subscription will be canceled immediately and the charge returned to your original payment method within 5–10 business days."
        : "确认申请退款？订阅将立即取消，款项按原支付方式在 5–10 个工作日内退回。"
    );
    if (!confirmed) return;

    setSubRefunding(true);
    setMessage(null);
    captureEvent("refund_request_start", { source_page: "orders" });

    try {
      const response = await fetch("/api/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as { status?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to process refund request.");

      setMessageTone(data.status === "already_requested" ? "info" : "success");
      setMessage(data.message ?? null);
      load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Unable to process refund request.");
    } finally {
      setSubRefunding(false);
    }
  }

  const subRefund = subscription?.refundStatus ?? null;
  const subRefundable =
    subscription !== null && isPaidPlanId(subscription.plan) && subRefund === null;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 pb-10">
      {/* Back — same top-left pattern as the pay page & opportunity detail */}
      <Link
        href="/billing"
        onClick={() => captureEvent("orders_back_clicked", { surface: "orders" })}
        className="focus-ring -mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {locale === "en" ? "Back to billing" : "返回账单"}
      </Link>

      {/* Header */}
      <div className="border-b border-hairline pb-5">
        <p className="eyebrow">{locale === "en" ? "Orders & Refunds" : "订单与退款"}</p>
        <h1 className="mt-1.5 text-3xl font-bold text-fg">
          {locale === "en" ? "Your orders" : "购买订单记录"}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-6 text-fg-muted">
          {locale === "en"
            ? "Every purchase is recorded here. Paid orders can be self-refunded within 3 days of the charge; the money returns to your original payment method."
            : "每一笔购买都会记录在这里。已支付的订单自扣费起 3 天内可自助申请退款，款项按原支付方式退回。"}
        </p>
      </div>

      {message ? (
        <p
          className={`max-w-md rounded-xl border p-4 text-xs font-medium sm:text-sm ${
            messageTone === "error"
              ? "border-risk/30 bg-risk/10 text-risk"
              : messageTone === "success"
                ? "border-positive/30 bg-positive/10 text-positive"
                : "border-action/30 bg-action/[0.08] text-fg"
          }`}
        >
          {message}
        </p>
      ) : null}

      {loadState === "loading" ? (
        <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface p-5 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {locale === "en" ? "Loading your orders…" : "正在加载订单记录…"}
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-5 text-sm text-fg-muted">
          <span>{locale === "en" ? "Couldn't load your orders." : "订单记录暂时加载不出来。"}</span>
          <button type="button" className="btn-ghost focus-ring text-xs" onClick={load}>
            <RotateCcw className="h-3.5 w-3.5" />
            {locale === "en" ? "Retry" : "重试"}
          </button>
        </div>
      ) : null}

      {loadState === "unauthenticated" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-5">
          <p className="text-sm text-fg-muted">
            {locale === "en" ? "Log in to see your order history." : "登录后即可查看你的订单记录。"}
          </p>
          <Link href="/login" className="btn-primary focus-ring text-xs">
            <LogIn className="h-4 w-4" />
            {locale === "en" ? "Log in" : "去登录"}
          </Link>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <>
          {/* Current subscription */}
          {subscription ? (
            <section
              aria-labelledby="orders-subscription-title"
              className="rounded-2xl border border-hairline bg-surface-2/40 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow">{locale === "en" ? "Current subscription" : "当前订阅"}</p>
                  <h2 id="orders-subscription-title" className="mt-1.5 text-sm font-bold text-fg">
                    {planDisplayName(subscription.plan, locale)}
                    <span className="ml-2 font-normal text-fg-muted">
                      {subscription.provider === "creem"
                        ? locale === "en"
                          ? "Monthly auto-renewal · Creem"
                          : "连续包月 · Creem"
                        : providerLabel(subscription.provider, locale)}
                    </span>
                  </h2>
                  {subscription.currentPeriodEnd ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {locale === "en" ? "Paid through " : "已付费至 "}
                      {formatDateTime(subscription.currentPeriodEnd, locale)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2.5">
                  {subRefund ? (
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${REFUND_STATUS_COPY[subRefund].className}`}
                    >
                      {locale === "en" ? REFUND_STATUS_COPY[subRefund].en : REFUND_STATUS_COPY[subRefund].zh}
                    </span>
                  ) : subRefundable ? (
                    <button
                      type="button"
                      onClick={() => void requestSubscriptionRefund()}
                      disabled={subRefunding}
                      className="btn-ghost focus-ring text-xs"
                    >
                      {subRefunding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {locale === "en" ? "Request refund" : "申请退款"}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {/* Orders */}
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-surface p-8 text-center">
              <ReceiptText className="mx-auto h-6 w-6 text-fg-muted" />
              <p className="mt-3 text-sm font-semibold text-fg">
                {locale === "en" ? "No orders yet" : "还没有订单记录"}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                {locale === "en"
                  ? "Plan months and credit packs you buy will show up here."
                  : "购买套餐或创作点数补充包后，记录会出现在这里。"}
              </p>
              <Link href="/billing" className="btn-primary focus-ring mt-4 inline-flex items-center gap-2 text-xs">
                {locale === "en" ? "Browse plans" : "去看看套餐"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3" data-testid="orders-list">
              {orders.map((order) => {
                const statusCopy = ORDER_STATUS_COPY[order.status];
                const refundCopy = order.refundStatus ? REFUND_STATUS_COPY[order.refundStatus] : null;
                const title =
                  order.kind === "plan"
                    ? locale === "en"
                      ? `${planDisplayName(order.planId, locale)} · 30 days`
                      : `${planDisplayName(order.planId, locale)} · 30 天`
                    : locale === "en"
                      ? `${order.credits.toLocaleString()} AI Credits pack`
                      : `${order.credits.toLocaleString()} 创作点数补充包`;
                return (
                  <li
                    key={order.id}
                    className="grid gap-3 rounded-xl border border-hairline bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-fg">{title}</p>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusCopy.className}`}
                        >
                          {locale === "en" ? statusCopy.en : statusCopy.zh}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
                        <span className="font-mono">{order.orderCode}</span>
                        <span aria-hidden>·</span>
                        <span>{formatDateTime(order.createdAt, locale)}</span>
                        <span aria-hidden>·</span>
                        <span>{providerLabel(order.provider, locale)}</span>
                      </p>
                      {order.refundBlock === "consumed" ? (
                        <p className="mt-1 text-[11px] leading-4 text-fg-muted">
                          {locale === "en"
                            ? "Credits from this pack are partially spent — contact support to refund."
                            : "这份补充包的点数已有消耗，退款请联系客服。"}
                        </p>
                      ) : null}
                      {order.refundBlock === "plan_changed" ? (
                        <p className="mt-1 text-[11px] leading-4 text-fg-muted">
                          {locale === "en"
                            ? "Your plan has changed since this order — contact support to refund."
                            : "购买后套餐已变更，退款请联系客服。"}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2.5">
                      <p className="text-base font-black tabular text-fg">
                        {formatMoney(order.amountCents, order.currency)}
                      </p>
                      {refundCopy ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${refundCopy.className}`}
                        >
                          {locale === "en" ? refundCopy.en : refundCopy.zh}
                        </span>
                      ) : order.refundable ? (
                        <button
                          type="button"
                          onClick={() => void requestOrderRefund(order)}
                          disabled={refundingId !== null}
                          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-bold text-fg-muted transition hover:border-risk/35 hover:text-risk disabled:opacity-60"
                        >
                          {refundingId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {locale === "en" ? "Request refund" : "申请退款"}
                        </button>
                      ) : order.payable ? (
                        <Link
                          href={`/billing/pay/${order.id}`}
                          onClick={() =>
                            captureEvent("orders_continue_payment_clicked", { order_code: order.orderCode })
                          }
                          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-strong"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {locale === "en" ? "Continue payment" : "继续支付"}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="max-w-2xl text-xs leading-5 text-fg-muted">
            {locale === "en"
              ? "Pending orders close automatically once the payment window expires — finish paying from the order while it's still open. Refunds follow the 3-day no-questions-asked policy from each charge; packs must be unspent to self-refund. Anything else — email support@finfold.app."
              : "待支付订单超过收款时限会自动关闭，关闭前可随时从订单上继续支付。退款按每笔扣费起 3 天无理由执行，补充包需未消耗方可自助退款；其他情况邮件 support@finfold.app。"}
          </p>
        </>
      ) : null}
    </div>
  );
}
