"use client";

import { CreditCard } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type UsageMeterProps = {
  used: number;
  limit: number;
  plan: string;
  locale: Locale;
};

export function UsageMeter({ used, limit, plan, locale }: UsageMeterProps) {
  const percentage = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-fg">{locale === "zh" ? "用量" : "Usage"}</h2>
        </div>
        <span className="tag tag-brand">{plan}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-2 rounded-full bg-brand" style={{ width: `${percentage}%` }} />
      </div>
      <p className="tabular mt-2 text-xs text-fg-muted">
        {locale === "zh" ? `本月已生成 ${used} / ${limit} 个内容包` : `${used} / ${limit} kits this month`}
      </p>
    </section>
  );
}
