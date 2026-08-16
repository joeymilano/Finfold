"use client";

import Link from "next/link";
import React from "react";
import type { Locale } from "@/lib/i18n";

type UsageMeterProps = {
  /** Gross Credits reserved from this cycle's plan batch. Refunds are
   *  separate positive balance rows, so this is not a net-charged figure. */
  used: number;
  /** Plan credits granted this cycle. */
  limit: number;
  plan: string;
  locale: Locale;
  /** Total credits still spendable, including refunds, grants, and top-ups. */
  available?: number;
  status?: "ready" | "refreshing" | "unavailable";
};

export function UsageMeter({ used, limit, plan, locale, available, status = "ready" }: UsageMeterProps) {
  const label = locale === "zh" ? "创作点数" : "AI Credits";
  const isUnavailable = status === "unavailable";
  const remaining = Math.max(0, limit - used);
  const spendable = available ?? remaining;
  const ariaLabel = status !== "ready"
    ? isUnavailable
      ? locale === "zh"
        ? `${label}暂时不可用，${plan} 方案`
        : `${label} temporarily unavailable, ${plan} plan`
      : locale === "zh"
        ? `${label}余额刷新中，${plan} 方案`
        : `${label} balance refreshing, ${plan} plan`
    : locale === "zh"
      ? `${label} 本周期方案已预留 ${used} / ${limit}，可用 ${spendable}，${plan} 方案`
      : `${label} ${used} / ${limit} reserved from this cycle's plan, ${spendable} spendable, ${plan} plan`;

  return (
    <Link
      href="/billing"
      aria-label={ariaLabel}
      className="focus-ring inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-surface-2/55 px-3 py-1.5 text-[11px] transition hover:border-brand/35 hover:bg-brand/[0.06]"
    >
      <span className="whitespace-nowrap text-fg-muted">{label}</span>
      <span className="tabular whitespace-nowrap font-bold text-fg">
        {status !== "ready" ? (
          isUnavailable
            ? locale === "zh" ? "暂不可用" : "Unavailable"
            : locale === "zh" ? "刷新中…" : "Refreshing…"
        ) : (
          <span
            title={
              locale === "zh"
                ? `本周期方案已预留 ${used} / ${limit}；可用余额包含已退还、补充包与奖励点数。`
                : `${used} / ${limit} reserved from this cycle's plan; spendable balance includes refunds, top-ups, and bonus credits.`
            }
          >
            {spendable.toLocaleString()} <span className="font-medium text-fg-muted">{locale === "zh" ? "可用" : "left"}</span>
          </span>
        )}
      </span>
      <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-brand" />
      <span className="max-w-24 truncate font-semibold text-brand">{plan}</span>
    </Link>
  );
}
