"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert
} from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { QRCODE_PLANS, type QrcodePlanId } from "@/lib/payment/qrcode-constants";

// User-facing pay page for a 经营码 (Alipay QR) credit-pack order. Shows the
// receive QR + a PRECISE amount (pack price + unique tail) + short order code
// + a countdown, and polls /api/credits/qrcode-order/[id] until the operator
// confirms receipt (status pending → paid), then celebrates. The precise
// amount is the reconciliation anchor — the page tells the user not to change
// it so the operator can match the incoming Alipay payment to this order.

type QrcodeOrder = {
  id: string;
  userId: string;
  orderCode: string;
  credits: number;
  amountCents: number;
  amountYuan: string;
  status: string;
  /** Pricing V2 self-serve plan for a subscription order. */
  plan: QrcodePlanId | null;
  expiresAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export function QrcodePayClient({ orderId }: { orderId: string }) {
  const locale = useLocale();
  const isEn = locale === "en";

  const [order, setOrder] = useState<QrcodeOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const qrImage = process.env.NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL;
  const payee = process.env.NEXT_PUBLIC_ALIPAY_QRCODE_PAYEE_NAME ?? "Finfold";

  const fetchOrder = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/credits/qrcode-order/${orderId}`, { cache: "no-store" });
      const data = (await res.json()) as { order?: QrcodeOrder; error?: string };
      if (!res.ok || !data.order) {
        setLoadError(data.error ?? (isEn ? "Order not found." : "订单不存在。"));
        return false;
      }
      setOrder(data.order);
      return data.order.status === "pending";
    } catch {
      setLoadError(isEn ? "Network error." : "网络异常。");
      return false;
    }
  }, [orderId, isEn]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const stillPending = await fetchOrder();
      if (!active) return;
      setLoading(false);
      // Keep polling only while the order is still payable.
      if (stillPending) {
        timer = setTimeout(poll, 6000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetchOrder]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function copyCode() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.orderCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  if (loading) {
    return (
      <Shell isEn={isEn}>
        <div className="flex flex-col items-center gap-3 py-24">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
          <p className="text-sm text-fg-muted">{isEn ? "Loading order…" : "加载订单…"}</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !order) {
    return (
      <Shell isEn={isEn}>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <ShieldAlert className="h-10 w-10 text-risk" />
          <p className="text-sm font-semibold text-fg">{loadError ?? "—"}</p>
          <BackLink isEn={isEn} />
        </div>
      </Shell>
    );
  }

  const paid = order.status === "paid";
  const remainingMs = order.expiresAt ? new Date(order.expiresAt).getTime() - now : 0;
  const expired = !paid && remainingMs <= 0;
  const mm = Math.max(0, Math.floor(remainingMs / 60000));
  const ss = Math.max(0, Math.floor((remainingMs % 60000) / 1000));
  const countdown = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  if (paid) {
    return (
      <Shell isEn={isEn}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-fg">
              {isEn ? "Payment received" : "支付成功，已确认到账"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-fg-muted">
              {order.plan
                ? isEn
                  ? `${QRCODE_PLANS[order.plan].name} is active for 30 days. It auto-reverts to the free plan when it expires.`
                  : `${QRCODE_PLANS[order.plan].nameCN}套餐已开通，有效期 30 天，到期后自动恢复为免费版。`
                : isEn
                  ? `${order.credits.toLocaleString()} credits have been added to your account.`
                  : `${order.credits.toLocaleString()} 创作点数已到账，可立即使用。`}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <BackLink isEn={isEn} variant="ghost" />
            <Link
              href="/dashboard"
              className="btn-primary focus-ring inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            >
              {isEn ? "Start creating" : "开始创作"}
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell isEn={isEn}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
            <Clock className="h-9 w-9" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-fg">{isEn ? "Order expired" : "订单已过期"}</h1>
            <p className="mt-1.5 text-sm leading-6 text-fg-muted">
              {isEn ? "Please place a new order to pay." : "请返回重新下单，再完成支付。"}
            </p>
          </div>
          <Link
            href="/billing"
            className="btn-primary focus-ring inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
          >
            <RefreshCw className="h-4 w-4" /> {isEn ? "Back to billing" : "返回重新购买"}
          </Link>
        </div>
      </Shell>
    );
  }

  // Pending: show the QR + precise amount + countdown.
  return (
    <Shell isEn={isEn}>
      <div className="flex flex-col items-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
          <ScanLine className="h-3.5 w-3.5" />
          {isEn ? "Alipay" : "支付宝·经营码"}
        </div>
        <p className="mb-5 text-center text-base font-bold text-fg">
          {order.plan
            ? isEn
              ? `Subscribe to ${QRCODE_PLANS[order.plan].name} · 1 month`
              : `开通${QRCODE_PLANS[order.plan].nameCN}套餐 · 一个月`
            : isEn
              ? "Top up credit pack"
              : "购买创作点数包"}
        </p>

        {qrImage ? (
          /* eslint-disable @next/next/no-img-element -- external receive QR, Next/Image would need remotePatterns config */
          <img
            src={qrImage}
            alt={isEn ? "Alipay receive QR code" : "支付宝收款码"}
            className="h-60 w-60 rounded-2xl border border-hairline bg-white p-2 object-contain"
          />
        ) : (
          <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface-2 p-4 text-center">
            <ScanLine className="h-8 w-8 text-fg-muted" />
            <p className="text-[11px] leading-relaxed text-fg-muted">
              {isEn ? "Receive QR not configured yet." : "收款码暂未配置，请联系客服获取。"}
            </p>
          </div>
        )}

        <p className="mt-3 text-xs text-fg-muted">
          {isEn ? "Payee" : "收款方"}：
          <span className="font-semibold text-fg">{payee}</span>
        </p>

        {/* Precise amount — the reconciliation anchor */}
        <div className="mt-5 w-full rounded-2xl border border-brand/30 bg-brand/5 p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {isEn ? "Pay exactly" : "请按精确金额支付"}
          </p>
          <p className="mt-1 text-4xl font-black tabular text-brand">¥{order.amountYuan}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
            {isEn
              ? "Includes a unique tail that identifies your order — don't change it."
              : "金额已含唯一识别尾数，请勿修改，系统凭此自动匹配你的订单。"}
          </p>
        </div>

        {/* Order code with copy */}
        <button
          type="button"
          onClick={() => void copyCode()}
          className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:border-brand/40"
        >
          <span className="text-fg-muted">{isEn ? "Order" : "订单号"}</span>
          <span className="tabular">{order.orderCode}</span>
          {copied ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-fg-muted" />
          )}
        </button>

        {/* Countdown */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-fg">
          <Clock className="h-3.5 w-3.5 text-fg-muted" />
          <span className="tabular">{countdown}</span>
          <span className="font-medium text-fg-muted">{isEn ? "left" : "后失效"}</span>
        </div>

        <p className="mt-5 max-w-sm text-center text-[11px] leading-relaxed text-fg-muted">
          {isEn
            ? "Open Alipay and scan, or long-press to save and pay. Credits arrive within a few minutes after the operator confirms receipt — this page refreshes automatically."
            : "打开支付宝扫一扫完成付款。付款后，工作人员确认收款，创作点数将在几分钟内到账，本页会自动刷新。"}
        </p>
      </div>
    </Shell>
  );
}

function BackLink({ isEn, variant = "ghost" }: { isEn: boolean; variant?: "ghost" }) {
  return (
    <Link
      href="/billing"
      className={`focus-ring inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
        variant === "ghost" ? "btn-ghost" : ""
      }`}
    >
      <ArrowLeft className="h-4 w-4" /> {isEn ? "Back to billing" : "返回账单"}
    </Link>
  );
}

function Shell({ children, isEn }: { children: React.ReactNode; isEn: boolean }) {
  return (
    <div className="mx-auto max-w-md pb-10">
      <Link
        href="/billing"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {isEn ? "Back to billing" : "返回账单"}
      </Link>
      <div className="panel-inset rounded-2xl p-6 sm:p-8">{children}</div>
    </div>
  );
}
