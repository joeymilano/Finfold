"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Coins, Gift, ReceiptText } from "@/components/ui/icons";
import { CreditSpendBreakdown } from "@/components/billing/CreditSpendBreakdown";
import { CreditPackStore } from "@/components/billing/CreditPackStore";
import { captureEvent } from "@/lib/posthog";

/**
 * Pricing & Billing 页的点数概览卡：一级常驻展示可用余额 + 本周期额度进度条。
 * 购买补充包的主按钮在卡内直接展开补充包商店（复用 CreditPackStore），
 * 把「看到余额不足 → 完成购买」的路径缩短在同一个卡片里；
 * 邀请好友保留为同行轻量入口。点击「消耗与增加明细」展开账本视图
 * （复用 CreditSpendBreakdown）。数据同源：/api/entitlements/check。
 */

type Balance = {
  used: number;
  limit: number;
  plan: string;
  available: number;
};

type LoadState = "loading" | "ready" | "unavailable";

function balanceFromPayload(payload: Record<string, unknown>): Balance | null {
  const used = Number(payload.used);
  const limit = Number(payload.monthlyLimit);
  const available = Number(payload.available);
  const plan = payload.plan;
  if (
    !Number.isSafeInteger(used) ||
    used < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    !Number.isSafeInteger(available) ||
    available < 0 ||
    typeof plan !== "string" ||
    plan.length === 0
  ) {
    return null;
  }
  return { used, limit, plan, available };
}

export function CreditBalanceCard({ locale }: { locale: string }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [detailOpen, setDetailOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/entitlements/check", { method: "POST", cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("entitlements unavailable");
        return res.json() as Promise<Record<string, unknown>>;
      })
      .then((payload) => {
        if (cancelled) return;
        const next = balanceFromPayload(payload);
        if (next) {
          setBalance(next);
          setLoadState("ready");
        } else {
          setLoadState("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = locale === "zh" ? "创作点数" : "AI Credits";
  const isUnavailable = loadState !== "ready";
  const used = balance?.used ?? 0;
  const limit = balance?.limit ?? 0;
  const available = balance?.available ?? 0;
  const reservedShare = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const summaryLine = isUnavailable
    ? locale === "zh"
      ? "余额暂时不可用，稍后会自动恢复"
      : "Balance temporarily unavailable — it will return shortly"
    : locale === "zh"
      ? `本周期方案已预留 ${used.toLocaleString()} / ${limit.toLocaleString()}`
      : `${used.toLocaleString()} / ${limit.toLocaleString()} reserved from this cycle's plan`;

  const balanceTitle = isUnavailable
    ? locale === "zh"
      ? `${label}暂时不可用`
      : `${label} temporarily unavailable`
    : locale === "zh"
      ? `可用余额包含已退还、补充包与奖励点数`
      : `Spendable balance includes refunds, top-ups, and bonus credits`;

  return (
    <section
      data-testid="credit-balance-card"
      aria-labelledby="credit-balance-title"
      className="rounded-2xl border border-hairline bg-surface-2/40 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <h2 id="credit-balance-title" className="mt-1.5 text-sm font-bold text-fg">
            {locale === "zh" ? "剩余点数" : "Credits left"}
          </h2>
        </div>
        {!isUnavailable && balance ? (
          <span className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-bold text-fg-muted">
            {balance.plan}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <p
          title={balanceTitle}
          className="tabular text-4xl font-black leading-none text-fg"
          data-testid="credit-balance-value"
        >
          {isUnavailable ? (
            <span className="text-fg-muted">
              {locale === "zh" ? "暂不可用" : "Unavailable"}
            </span>
          ) : (
            <>
              {available.toLocaleString()}
              <span className="ml-2 text-base font-bold text-fg-muted">
                {locale === "zh" ? "可用" : "left"}
              </span>
            </>
          )}
        </p>
        <p className="text-xs font-medium text-fg-muted">{summaryLine}</p>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={summaryLine}
        data-testid="credit-balance-progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${isUnavailable ? 0 : reservedShare}%` }}
        />
      </div>

      {/* 操作行：购买主按钮视觉最重，明细次按钮保持描边样式，邀请入口最轻 */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setStoreOpen((prev) => !prev)}
          aria-expanded={storeOpen}
          aria-controls="credit-balance-store"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-strong active:scale-[0.98]"
        >
          <Coins className="h-3.5 w-3.5" />
          {locale === "zh" ? "购买补充包" : "Top up credits"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${storeOpen ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={() => setDetailOpen((prev) => !prev)}
          aria-expanded={detailOpen}
          aria-controls="credit-balance-detail"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-xs font-bold text-fg transition hover:border-brand/35 hover:text-brand"
        >
          {locale === "zh" ? "消耗与增加明细" : "Credits activity"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${detailOpen ? "rotate-180" : ""}`}
          />
        </button>
        <Link
          href="/billing/orders"
          onClick={() => captureEvent("orders_entry_clicked", { surface: "credit-balance-card" })}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-xs font-bold text-fg transition hover:border-brand/35 hover:text-brand"
        >
          <ReceiptText className="h-3.5 w-3.5" />
          {locale === "zh" ? "订单记录" : "Orders"}
        </Link>
        <Link
          href="/invite"
          onClick={() => captureEvent("referral_entry_clicked", { surface: "billing" })}
          className="focus-ring ml-auto inline-flex items-center gap-1.5 rounded-full px-1 py-1.5 text-xs font-bold text-fg-muted transition hover:text-brand"
        >
          <Gift className="h-3.5 w-3.5" />
          {locale === "zh"
            ? "邀请好友，双方各得 100 创作点数"
            : "Invite a friend — both earn 100 Credits"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {storeOpen ? (
        <div id="credit-balance-store" className="mt-4">
          <CreditPackStore locale={locale} embedded />
        </div>
      ) : null}

      {detailOpen ? (
        <div id="credit-balance-detail" className="mt-4">
          <CreditSpendBreakdown locale={locale} />
        </div>
      ) : null}
    </section>
  );
}
