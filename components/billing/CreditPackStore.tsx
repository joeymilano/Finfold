"use client";

import React, { useState } from "react";
import { AlipayIcon, WechatPayIcon } from "@/components/billing/PaymentBrandIcons";
import { ChevronDown, Coins, CreditCard, Loader2, Sparkles } from "@/components/ui/icons";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/payment/types";
import { ZcwPayModal, type ZcwCheckoutOrder } from "@/components/billing/ZcwPayModal";

// §10.4 — top-up store. Sells one-off, never-expiring credit packs. Top-up
// credits are spent only AFTER the monthly plan allowance runs out (the FIFO
// reserve order in migration 044 consumes soonest-expiring plan credits
// first), so a top-up is a safety net for busy months, not a replacement for
// a subscription.
//
// CN checkout: Alipay / WeChat scan-to-pay via the ZCW aggregate gateway
// (exact CNY prices, cashier overlay with QR + auto-fulfillment polling).
// Global checkout: Creem card (USD). Which buttons appear follows the
// buyer's UI language — zh shows the wallets at CNY prices, en shows the card.

type CreditPackStoreProps = {
  locale: string;
  /**
   * Balance-card embedding: the host card owns the toggle button, so the
   * store renders without its own header and always expanded.
   */
  embedded?: boolean;
};

export function CreditPackStore({ locale, embedded = false }: CreditPackStoreProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = embedded || expanded;
  const [loadingPack, setLoadingPack] = useState<{ id: CreditPackId; method: PaymentMethod } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zcwOrder, setZcwOrder] = useState<ZcwCheckoutOrder | null>(null);
  const isEn = locale === "en";
  // zh buyers get both wallets at CNY prices; en buyers get the card path.
  const paymentMethodOrder: ReadonlyArray<PaymentMethod> = isEn ? ["card"] : ["alipay", "wxpay"];

  async function purchase(packId: CreditPackId, method: PaymentMethod) {
    setLoadingPack({ id: packId, method });
    setError(null);
    try {
      if (method === "card") {
        // Card path — existing Creem checkout.
        const response = await fetch("/api/credits/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: packId,
            locale: isEn ? "en" : "zh",
            market: isEn ? "global" : "cn"
          })
        });
        const data = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !data.url) {
          throw new Error(data.error ?? (isEn ? "Unable to start checkout." : "无法发起支付。"));
        }
        window.location.href = data.url;
        return;
      }

      // Wallet path — ZCW scan-to-pay cashier overlay.
      const response = await fetch("/api/checkout-zcwpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "credits",
          packageId: packId,
          channel: method
        })
      });
      const data = (await response.json()) as { order?: ZcwCheckoutOrder; error?: string };
      if (!response.ok || !data.order) {
        throw new Error(data.error ?? (isEn ? "Unable to start checkout." : "无法发起支付。"));
      }
      setZcwOrder(data.order);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : isEn ? "Unable to start checkout." : "无法发起支付。"
      );
    } finally {
      setLoadingPack(null);
    }
  }

  function closeCashier() {
    const wasPaid = zcwOrder?.status === "paid";
    setZcwOrder(null);
    // A paid top-up changes the balance card — refresh the billing page.
    if (wasPaid) window.location.reload();
  }

  return (
    <section
      className={
        embedded
          ? "rounded-2xl border border-hairline bg-surface"
          : "panel-inset overflow-hidden"
      }
    >
      {/* Clickable header — always visible. Default collapsed; expands on click.
          Embedded mode omits it: the balance card's own button does the toggling. */}
      {!embedded ? (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="focus-ring flex w-full items-center gap-3 p-5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Coins className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-fg">
            {isEn ? "Top up with credit packs" : "购买创作点数补充包"}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">
            {isEn
              ? "Never-expiring credits, spent only after your plan allowance runs out."
              : "永久有效，套餐额度耗尽后才消耗。"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-fg-muted transition-transform duration-300 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      ) : null}

      {/* Collapsible body — smooth height transition via grid-rows 0fr→1fr */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`space-y-4 ${embedded ? "p-4 sm:p-5" : "px-5 pb-5"}`}>
            <p className="max-w-2xl text-[11px] leading-relaxed text-fg-muted">
              {isEn
                ? "Top-up credits never expire and are spent only after your monthly plan allowance runs out — a safety net for busy months, not a replacement for a subscription."
                : "补充的创作点数永久有效，且会在每月套餐点数耗尽后才被消耗——它是忙碌月份的补充，不替代订阅。"}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CREDIT_PACKS.map((pack) => {
                const highlighted = Boolean(pack.badge);
                const muted = highlighted ? "text-white/55" : "text-fg-muted";
                const fg = highlighted ? "text-white" : "text-fg";

                // CN buyers pay explicit CNY prices; global buyers USD.
                const displayPrice = isEn ? `$${pack.priceUSD} USD` : `¥${pack.priceCNY}`;
                const secondaryPrice = isEn ? "One-time payment" : "一次性付款";
                const unitBase = isEn ? pack.priceUSD : pack.priceCNY;
                const unitPrice = ((unitBase / pack.credits) * 100).toFixed(1);
                const unitLabel = isEn
                  ? `$${unitPrice} / 100 credits`
                  : `¥${unitPrice} / 100 创作点数`;
                const isLoading = loadingPack?.id === pack.id;
                const methodLoading = (method: PaymentMethod) =>
                  isLoading && loadingPack?.method === method;

                return (
                  <article
                    key={pack.id}
                    className={`relative flex flex-col rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 ${
                      highlighted ? "panel-command shadow-glow-brand" : "panel panel-hover"
                    }`}
                  >
                    {pack.badge ? (
                      <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                          <Sparkles className="h-3 w-3" />
                          {isEn ? pack.badge.en : pack.badge.zh}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex flex-1 flex-col">
                      <p className={`text-[11px] font-semibold ${muted}`}>{isEn ? pack.name : pack.nameCN}</p>

                      <p className="mt-1 flex items-baseline gap-1">
                        <Coins className="h-4 w-4 text-brand" />
                        <span className="tabular text-2xl font-bold text-brand">
                          {pack.credits.toLocaleString()}
                        </span>
                      </p>
                      <p className={`mt-0.5 text-[11px] font-medium ${muted}`}>{unitLabel}</p>

                      <div
                        className={`mt-4 border-t pt-3 ${highlighted ? "border-white/10" : "border-hairline"}`}
                      >
                        <p className={`tabular text-lg font-bold leading-none ${fg}`}>{displayPrice}</p>
                        <p className={`mt-0.5 text-[10px] ${muted}`}>{secondaryPrice}</p>
                      </div>

                      {/* Preferred settlement path first; the alternate remains explicit. */}
                      <div className={`mt-3 grid gap-2 ${paymentMethodOrder.length > 1 ? "grid-cols-2" : ""}`}>
                        {paymentMethodOrder.map((method, index) => {
                          const primary = index === 0;
                          return (
                            <button
                              key={method}
                              type="button"
                              onClick={() => void purchase(pack.id, method)}
                              disabled={loadingPack !== null}
                              className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                                primary
                                  ? highlighted
                                    ? "bg-brand text-white hover:bg-brand-strong"
                                    : "bg-fg text-bg hover:opacity-90"
                                  : "border border-hairline text-fg hover:border-brand/40"
                              }`}
                            >
                              {methodLoading(method) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : method === "card" ? (
                                <CreditCard className="h-3.5 w-3.5" />
                              ) : method === "alipay" ? (
                                <AlipayIcon className="h-4 w-4 shrink-0" decorative />
                              ) : (
                                <WechatPayIcon className="h-4 w-4 shrink-0" decorative />
                              )}
                              <span>
                                {method === "card"
                                  ? isEn ? "Card · USD" : "信用卡 · USD"
                                  : method === "alipay"
                                    ? "支付宝"
                                    : "微信支付"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {error ? (
              <p className="rounded-xl border border-risk/30 bg-risk/10 px-3.5 py-2.5 text-xs font-medium text-risk">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {zcwOrder ? (
        <ZcwPayModal
          order={zcwOrder}
          onClose={closeCashier}
          onPaid={() => {
            setZcwOrder((prev) => (prev ? { ...prev, status: "paid" } : prev));
          }}
        />
      ) : null}
    </section>
  );
}

type PaymentMethod = "alipay" | "wxpay" | "card";
