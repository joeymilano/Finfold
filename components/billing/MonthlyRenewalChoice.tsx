"use client";

import { formatMonthlyUsd, monthlyOfferPrice } from "@/lib/payment/monthly-offer";

export function MonthlyRenewalChoice({ id, locale, price, checked, onChange, disabled, highlighted = false }: {
  id: string;
  locale: "zh" | "en";
  price: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  const en = locale === "en";
  return (
    <div className={`rounded-xl border p-3 transition-colors ${checked
      ? "border-brand/60 bg-brand/10 ring-1 ring-brand/20"
      : highlighted ? "border-white/15 bg-white/5" : "border-hairline bg-surface-2"}`}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}
          disabled={disabled} aria-describedby={`${id}-terms`}
          className="focus-ring mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand disabled:cursor-wait" />
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold ${highlighted ? "text-white" : "text-fg"}`}>
            {en ? "Monthly auto-renewal" : "开启连续包月"}
          </span>
          <span className="mt-1.5 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-black text-on-brand">
            {en ? "SAVE 10% EVERY MONTH" : "每月再省 10%"}
          </span>
        </span>
      </label>
      <div aria-live="polite" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-lg font-bold tabular-nums ${highlighted ? "text-white" : "text-fg"}`}>
          {formatMonthlyUsd(checked ? monthlyOfferPrice(price) : price)}
          <span className="ml-1 text-[10px] font-medium">USD/{en ? "month" : "月"}</span>
        </span>
        {checked ? <del className={`text-xs tabular-nums ${highlighted ? "text-white/50" : "text-fg-muted"}`}>{formatMonthlyUsd(price)}</del> : null}
      </div>
      <p id={`${id}-terms`} className={`mt-1.5 text-[10px] leading-[1.65] ${highlighted ? "text-white/60" : "text-fg-muted"}`}>
        {checked
          ? en
            ? "Creem card billing. First month and every renewal are 10% off. Renews monthly until canceled; access lasts through the paid period."
            : "Creem 信用卡支付，首月及后续每月均享九折。按月自动扣款，可随时取消，已付费周期仍可使用。"
          : en
            ? "Select to authorize monthly card payments through Creem and receive 10% off."
            : "勾选即同意通过 Creem 信用卡按月续费，每月享九折。"}
      </p>
    </div>
  );
}
