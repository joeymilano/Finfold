"use client";

import { ChevronDown, Gauge, Globe, FileText, Image as ImageIcon, Bot, Sparkles } from "@/components/ui/icons";
import React, { useEffect, useState } from "react";
import {
  ACTION_LABEL,
  SPEND_CATEGORIES,
  aggregateSpendByCategory,
  type CreditSpendSummary,
  type SpendCategoryKey,
} from "@/lib/payment/types";

// §10.2 "explain your credits" — shows where this cycle's credits went,
// rolled up into a few user-facing categories (内容生成 / 联网研究 / …).
// Renders only once the ledger returns actual spend, so users who haven't
// generated this cycle never see an empty shell.

type SpendSummaryResponse = CreditSpendSummary & {
  cycleStart: string;
  cycleEnd: string;
};

const CATEGORY_ICON: Record<SpendCategoryKey, React.ElementType> = {
  generation: FileText,
  research: Globe,
  visuals: ImageIcon,
  quality: Gauge,
  agent: Bot,
  other: Sparkles
};

function categoryLabel(key: SpendCategoryKey, locale: string): string {
  const meta = SPEND_CATEGORIES[key];
  return locale === "en" ? meta.label : meta.labelCN;
}

function actionLabel(action: string, locale: string): string {
  const meta = ACTION_LABEL[action];
  if (!meta) return action;
  return locale === "en" ? meta.label : meta.labelCN;
}

export function CreditSpendBreakdown({ locale }: { locale: string }) {
  const [data, setData] = useState<SpendSummaryResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [expanded, setExpanded] = useState<Set<SpendCategoryKey>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/credits/spend-summary", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Credits activity is unavailable.");
        return res.json() as Promise<SpendSummaryResponse>;
      })
      .then((payload: SpendSummaryResponse) => {
        if (!cancelled) {
          setData(payload);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = data?.items ?? [];
  const grossReserved = data?.grossReserved ?? 0;
  const refunded = data?.refunded ?? 0;
  const netCharged = data?.netCharged ?? 0;
  const manualCredits = data?.manualCredits ?? 0;
  const manualDebits = data?.manualDebits ?? 0;
  const expiredCredits = data?.expiredCredits ?? 0;

  if (loadState === "error") {
    return (
      <section
        role="status"
        data-testid="credits-billing-unavailable"
        className="panel-inset flex items-center justify-between gap-3 p-4"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold text-fg">
            {locale === "en" ? "Billing temporarily unavailable" : "账务暂不可用"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            {locale === "en"
              ? "Your balance has not been replaced with an estimated zero. Try again shortly."
              : "当前没有用估算的 0 替代真实账务，请稍后重试。"}
          </p>
        </div>
      </section>
    );
  }

  if (loadState === "loading") return null;

  // Silent until there's something to explain. A fully refunded attempt still
  // renders because showing net charged = 0 is the point of this panel.
  if (
    grossReserved <= 0 &&
    refunded <= 0 &&
    manualCredits <= 0 &&
    manualDebits <= 0 &&
    expiredCredits <= 0
  ) {
    return null;
  }

  const categories = aggregateSpendByCategory(items);
  const maxCategoryCredits = Math.max(...categories.map((c) => c.credits), 1);
  const totals =
    locale === "en"
      ? [
          {
            key: "gross-reserved",
            label: "Gross reserved",
            value: grossReserved,
            note: "All attempted actions before refunds"
          },
          {
            key: "refunded",
            label: "Refunded",
            value: refunded,
            note: "Restored to your available balance"
          },
          {
            key: "net-charged",
            label: "Net charged",
            value: netCharged,
            note: "Action activity only"
          }
        ]
      : [
          {
            key: "gross-reserved",
            label: "预留总额",
            value: grossReserved,
            note: "退款前的全部操作尝试"
          },
          {
            key: "refunded",
            label: "已退回",
            value: refunded,
            note: "已恢复到可用余额"
          },
          {
            key: "net-charged",
            label: "净计费",
            value: netCharged,
            note: "仅计算创作活动"
          }
        ];

  const toggle = (key: SpendCategoryKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Friendly "this cycle" label, e.g. "2026-07".
  const cycleLabel = data?.cycleStart ? data.cycleStart.slice(0, 7) : null;

  return (
    <section className="panel-inset space-y-4 p-5">
      <div className="min-w-0">
        <p className="eyebrow">{locale === "en" ? "Credits activity" : "创作点数记录"}</p>
        <h2 className="mt-1.5 text-sm font-bold text-fg">
          {locale === "en"
            ? `This cycle's billing summary${cycleLabel ? ` · ${cycleLabel}` : ""}`
            : `本周期计费汇总${cycleLabel ? ` · ${cycleLabel}` : ""}`}
        </h2>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        {totals.map((item) => (
          <div
            key={item.key}
            data-testid={`credits-${item.key}`}
            className={`rounded-xl border p-3 ${item.key === "net-charged" ? "border-brand/30 bg-brand/[0.06]" : "border-hairline bg-surface-2/40"}`}
          >
            <dt className="text-[10px] font-bold uppercase tracking-wide text-fg-muted">
              {item.label}
            </dt>
            <dd
              className={`mt-1 tabular text-xl font-bold ${item.key === "net-charged" ? "text-brand" : "text-fg"}`}
            >
              {item.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      {manualCredits > 0 || manualDebits > 0 ? (
        <div
          data-testid="credits-manual-adjustments"
          className="rounded-xl border border-hairline bg-surface-2/40 p-3.5"
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-muted">
            {locale === "en" ? "Manual balance adjustments" : "人工余额调整"}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] text-fg-muted">
                {locale === "en" ? "Credits added" : "人工增加"}
              </dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-brand">
                +{manualCredits.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-fg-muted">
                {locale === "en" ? "Credits removed" : "人工扣减"}
              </dt>
              <dd className="tabular mt-0.5 text-sm font-bold text-fg">
                −{manualDebits.toLocaleString()}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] leading-4 text-fg-muted">
            {locale === "en"
              ? "Operator adjustments change your balance directly. They are not action attempts, refunds, or part of net charged."
              : "人工调整会直接改变余额，不属于操作尝试、退款，也不计入净计费。"}
          </p>
        </div>
      ) : null}

      {expiredCredits > 0 ? (
        <div
          data-testid="credits-expired"
          className="rounded-xl border border-hairline bg-surface-2/40 p-3.5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-fg">
              {locale === "en" ? "Expired Credits" : "已过期点数"}
            </p>
            <p className="tabular text-sm font-bold text-fg">
              −{expiredCredits.toLocaleString()}
            </p>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-fg-muted">
            {locale === "en"
              ? "Unused expired Credits are a balance event, not an action attempt, refund, or charge."
              : "未使用点数到期属于余额事件，不是操作尝试、退款或计费。"}
          </p>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="space-y-2.5">
          <ul className="space-y-2.5">
            {categories.map((row) => {
              const Icon = CATEGORY_ICON[row.category];
              const shareOfTotal =
                grossReserved > 0 ? Math.round((row.credits / grossReserved) * 100) : 0;
              // Bar width is relative to the heaviest category so the biggest
              // spend always reads as the longest bar, regardless of total size.
              const barWidth = Math.max(
                6,
                Math.round((row.credits / maxCategoryCredits) * 100)
              );
              const isOpen = expanded.has(row.category);
              const hasDetail = row.items.length > 1;
              return (
                <li
                  key={row.category}
                  className="rounded-xl border border-hairline bg-surface-2/40"
                >
                  <div className="px-3.5 pt-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs font-bold text-fg">
                        {categoryLabel(row.category, locale)}
                      </span>
                      <span className="ml-auto tabular whitespace-nowrap text-xs font-bold text-fg">
                        {row.credits.toLocaleString()}
                      </span>
                      <span className="tabular w-9 shrink-0 text-right text-[11px] font-medium text-fg-muted">
                        {shareOfTotal}%
                      </span>
                      {hasDetail ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.category)}
                          aria-expanded={isOpen}
                          aria-label={
                            locale === "en"
                              ? `Toggle ${row.category} detail`
                              : `展开 ${row.category} 明细`
                          }
                          className="focus-ring grid h-5 w-5 shrink-0 place-items-center rounded text-fg-muted transition-colors hover:text-fg"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                    </div>
                    {/* Progress track sits below the label row, full width. */}
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${barWidth}%` }}
                        role="img"
                        aria-label={`${categoryLabel(row.category, locale)} ${shareOfTotal}%`}
                      />
                    </div>
                  </div>

                  {isOpen && hasDetail ? (
                    <ul className="mt-1 space-y-1 border-t border-hairline px-3.5 py-2.5">
                      {row.items.map((item) => (
                        <li
                          key={item.action}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="min-w-0 truncate text-fg-muted">
                            {actionLabel(item.action, locale)}
                          </span>
                          <span className="tabular shrink-0 font-semibold text-fg">
                            {item.credits.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
