"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldAlert
} from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { QRCODE_PLANS, type QrcodePlanId } from "@/lib/payment/qrcode-constants";

// Historical order status only. Static QR collection is retired.

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

  return (
    <Shell isEn={isEn}>
      <div className="space-y-5 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-risk" />
        <h1 className="text-xl font-bold text-fg">{isEn ? "This payment method is unavailable" : "此付款方式已停用"}</h1>
        <p className="text-sm leading-6 text-fg-muted">{isEn
          ? "Do not scan or pay this order. If you already paid, do not pay again. Keep your Alipay receipt and contact us to resolve this order."
          : "请勿继续扫码或支付此订单。如已付款，请勿重复支付；请保留支付宝付款凭证，联系我们处理原订单。"}</p>
        <p className="text-sm text-fg">{isEn ? "Original order amount" : "原订单金额"}：¥{order.amountYuan}</p>
        <button type="button" onClick={() => void copyCode()} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-hairline px-3 py-2 text-sm text-fg">
          {order.orderCode} {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <div className="flex flex-wrap justify-center gap-3">
          <a className="btn-primary focus-ring rounded-xl px-4 py-2 text-xs font-bold"
            href={`mailto:support@finfold.app?subject=${encodeURIComponent(`Alipay order ${order.orderCode}`)}`}>
            {isEn ? "Resolve a paid order" : "处理已付款订单"}
          </a>
          <BackLink isEn={isEn} />
        </div>
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
