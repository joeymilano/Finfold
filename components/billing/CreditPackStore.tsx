"use client";

import { ChevronDown, Coins, CreditCard, Loader2, ScanLine, Sparkles } from "@/components/ui/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/payment/types";

// §10.4 — top-up store. Sells one-off, never-expiring credit packs. Top-up
// credits are spent only AFTER the monthly plan allowance runs out (the FIFO
// reserve order in migration 044 consumes soonest-expiring plan credits
// first), so a top-up is a safety net for busy months, not a replacement for
// a subscription.
//
// Each pack offers TWO payment methods:
//   - Alipay (支付宝·经营码) — the transitional CN channel. Creates a local
//     QR order and routes to /billing/pay/[id] (semi-manual reconcile).
//   - Card — the existing Creem checkout (Visa/Mastercard/Apple Pay, INTL).
//
// Collapsed by default — top-ups are an occasional need.

type CreditPackStoreProps = {
  locale: string;
};

export function CreditPackStore({ locale }: CreditPackStoreProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loadingPack, setLoadingPack] = useState<{ id: CreditPackId; method: "alipay" | "card" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEn = locale === "en";

  async function purchase(packId: CreditPackId, method: "alipay" | "card") {
    setLoadingPack({ id: packId, method });
    setError(null);
    try {
      if (method === "alipay") {
        const response = await fetch("/api/credits/checkout-qrcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId: packId })
        });
        const data = (await response.json()) as { orderId?: string; error?: string };
        if (!response.ok || !data.orderId) {
          throw new Error(data.error ?? (isEn ? "Unable to create order." : "无法创建订单。"));
        }
        router.push(`/billing/pay/${data.orderId}`);
        return;
      }

      // Card path — existing Creem checkout.
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: packId })
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? (isEn ? "Unable to start checkout." : "无法发起支付。"));
      }
      window.location.href = data.url;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : isEn ? "Unable to start checkout." : "无法发起支付。"
      );
      setLoadingPack(null);
    }
  }

  return (
    <section className="panel-inset overflow-hidden">
      {/* Clickable header — always visible. Default collapsed; expands on click. */}
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

      {/* Collapsible body — smooth height transition via grid-rows 0fr→1fr */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 px-5 pb-5">
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
                const unitPriceCNY = ((pack.priceCNY / pack.credits) * 100).toFixed(1);
                const unitPriceUSD = ((pack.priceUSD / pack.credits) * 100).toFixed(1);
                const displayPrice = isEn ? `$${pack.priceUSD}` : `¥${pack.priceCNY}`;
                const secondaryPrice = isEn ? `¥${pack.priceCNY}` : `$${pack.priceUSD}`;
                const unitPrice = isEn ? `$${unitPriceUSD} / 100 credits` : `¥${unitPriceCNY} / 100 创作点数`;
                const isLoading = loadingPack?.id === pack.id;
                const isAlipayLoading = isLoading && loadingPack?.method === "alipay";
                const isCardLoading = isLoading && loadingPack?.method === "card";

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
                      <p className={`mt-0.5 text-[11px] font-medium ${muted}`}>{unitPrice}</p>

                      <div
                        className={`mt-4 border-t pt-3 ${highlighted ? "border-white/10" : "border-hairline"}`}
                      >
                        <p className={`tabular text-lg font-bold leading-none ${fg}`}>{displayPrice}</p>
                        <p className={`mt-0.5 text-[10px] ${muted}`}>{secondaryPrice}</p>
                      </div>

                      {/* Two payment methods */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void purchase(pack.id, "alipay")}
                          disabled={loadingPack !== null}
                          className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                            highlighted
                              ? "bg-brand text-white hover:bg-brand-strong"
                              : "bg-fg text-bg hover:opacity-90"
                          }`}
                        >
                          {isAlipayLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ScanLine className="h-3.5 w-3.5" />
                          )}
                          <span>{isEn ? "Alipay" : "支付宝"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void purchase(pack.id, "card")}
                          disabled={loadingPack !== null}
                          className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl border border-hairline py-2 text-xs font-bold text-fg transition-all hover:border-brand/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCardLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CreditCard className="h-3.5 w-3.5" />
                          )}
                          <span>{isEn ? "Card" : "信用卡"}</span>
                        </button>
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
    </section>
  );
}
