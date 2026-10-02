"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Copy, Loader2, ShieldAlert, X } from "@/components/ui/icons";

// ZCW aggregate-gateway cashier. Shown as an overlay right after
// /api/checkout-zcwpay returns: renders the wallet QR, counts down the order
// window, and polls the order until it flips to paid (the poll itself
// completes fulfillment, so a lost gateway callback never strands the user).
//
// Copy follows the repo rules: no sentence periods in titles, no internal
// payment-rail jargon on screen.

export type ZcwCheckoutOrder = {
  id: string;
  orderCode: string;
  amountYuan: string;
  credits: number;
  channel: "alipay" | "wxpay" | null;
  payType: string | null;
  payInfo: string | null;
  expiresAt: string | null;
  /** Pricing V2 plan for a subscription order; null for a credit-pack order. */
  plan: "starter_v2" | "creator_v2" | null;
  status: string;
};

const POLL_INTERVAL_MS = 3000;

function planNameCN(plan: "starter_v2" | "creator_v2"): string {
  return plan === "starter_v2" ? "入门版" : "创作者";
}

export function ZcwPayModal({
  order,
  onClose,
  onPaid
}: {
  order: ZcwCheckoutOrder;
  onClose: () => void;
  /** Called once when the order turns paid — lets the host refresh balances. */
  onPaid?: () => void;
}) {
  const isEn = false; // scan-to-pay is CN-only; zh copy with en fallbacks.
  const [status, setStatus] = useState<"waiting" | "paid" | "expired">(
    order.status === "paid" ? "paid" : "waiting"
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const paidNotified = useRef(false);

  const channelLabel =
    order.channel === "wxpay"
      ? isEn ? "WeChat Pay" : "微信支付"
      : isEn ? "Alipay" : "支付宝";

  // Render the QR once from the checkout response payload.
  useEffect(() => {
    if (status !== "waiting" || !order.payInfo) return;
    let active = true;
    QRCode.toDataURL(order.payInfo, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" }
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [order.payInfo, status]);

  // Countdown + expiry.
  useEffect(() => {
    if (status !== "waiting" || !order.expiresAt) return;
    const tick = () => {
      const left = new Date(order.expiresAt as string).getTime() - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setStatus("expired");
      } else {
        setRemainingMs(left);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [order.expiresAt, status]);

  // Poll order status; a paid answer means fulfillment already happened.
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/zcwpay-order/${order.id}`, { cache: "no-store" });
      const data = (await res.json()) as { order?: { status?: string }; error?: string };
      if (res.ok && data.order?.status === "paid") {
        setStatus("paid");
      }
    } catch {
      // transient network error — next tick retries
    }
  }, [order.id]);

  useEffect(() => {
    if (status !== "waiting") return;
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [poll, status]);

  useEffect(() => {
    if (status === "paid" && !paidNotified.current) {
      paidNotified.current = true;
      onPaid?.();
    }
  }, [status, onPaid]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(order.orderCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  function formatRemaining(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  const itemLabel = order.plan
    ? planNameCN(order.plan)
    : `${order.credits.toLocaleString()} ${isEn ? "credits" : "创作点数"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? "Scan to pay" : "扫码支付"}
    >
      <div className="panel-inset relative w-full max-w-sm rounded-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label={isEn ? "Close" : "关闭"}
          className="focus-ring absolute right-4 top-4 rounded-lg p-1.5 text-fg-muted transition-colors hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>

        {status === "paid" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-fg">
                {isEn ? "Payment received" : "支付成功"}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-fg-muted">
                {order.plan
                  ? isEn
                    ? `${planNameCN(order.plan)} is active for 30 days. It reverts to the free plan on expiry.`
                    : `${planNameCN(order.plan)}已开通，有效期 30 天，到期后自动恢复为免费版`
                  : isEn
                    ? `${order.credits.toLocaleString()} credits have been added to your account.`
                    : `${order.credits.toLocaleString()} 创作点数已到账，可立即使用`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-primary focus-ring rounded-xl px-4 py-2 text-xs font-bold"
            >
              {isEn ? "Done" : "完成"}
            </button>
          </div>
        ) : status === "expired" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <ShieldAlert className="h-10 w-10 text-risk" />
            <div>
              <h2 className="text-lg font-bold text-fg">{isEn ? "Order expired" : "订单已超时"}</h2>
              <p className="mt-1.5 text-sm leading-6 text-fg-muted">
                {isEn
                  ? "Close this window and start a new payment."
                  : "请关闭本窗口后重新发起支付"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-primary focus-ring rounded-xl px-4 py-2 text-xs font-bold"
            >
              {isEn ? "Close" : "知道了"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="text-lg font-bold text-fg">
                {isEn ? `Scan with ${channelLabel}` : `使用${channelLabel}扫码付款`}
              </h2>
              <p className="mt-1 text-xs text-fg-muted">
                {itemLabel} · ¥{order.amountYuan}
                {isEn ? "" : " · "}
                {isEn ? "" : remainingMs != null ? `${formatRemaining(remainingMs)} 内有效` : null}
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-white p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={isEn ? "Payment QR code" : "支付二维码"}
                  width={220}
                  height={220}
                  className="h-[220px] w-[220px]"
                />
              ) : order.payInfo ? (
                <div className="flex h-[220px] w-[220px] items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-brand" />
                </div>
              ) : (
                <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 px-4">
                  <ShieldAlert className="h-8 w-8 text-risk" />
                  <p className="text-xs leading-5 text-fg-muted">
                    {isEn
                      ? "The code is unavailable. Close this window and start a new payment."
                      : "二维码获取失败，请关闭后重新发起支付"}
                  </p>
                </div>
              )}
            </div>

            {order.payInfo && order.payType !== "qrcode" ? (
              <a
                href={order.payInfo}
                className="btn-primary focus-ring rounded-xl px-4 py-2 text-xs font-bold"
              >
                {isEn ? "Open payment page" : "打开支付页面"}
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => void copyCode()}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-hairline px-3 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {isEn ? "Order" : "订单号"} {order.orderCode}{" "}
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
            </button>

            <p className="text-[11px] leading-5 text-fg-muted">
              {isEn
                ? "Keep this window open. The page updates itself once the payment lands."
                : "请保持本窗口打开，到账后会自动完成"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
