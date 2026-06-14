"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";
import type { Locale } from "@/lib/i18n";

type KitHistoryProps = {
  kits: ContentKit[];
  locale: Locale;
};

export function KitHistory({ kits, locale }: KitHistoryProps) {
  return (
    <section id="history" className="panel rounded-md p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-fg" />
        <h2 className="text-sm font-black">{locale === "zh" ? "最近内容包" : "Recent kits"}</h2>
      </div>
      {kits.length === 0 ? (
        <p className="rounded-sm border border-dashed border-hairline bg-surface p-4 text-sm font-semibold text-fg-muted">
          {locale === "zh" ? "生成第一个内容包，建立可复用的发布资产库。" : "Generate your first content kit to build a reusable launch library."}
        </p>
      ) : (
        <div className="grid gap-2">
          {kits.slice(0, 6).map((kit) => (
            <Link
              href={`/kits/${kit.id}`}
              key={kit.id}
              className="focus-ring rounded-sm border border-hairline bg-surface p-3 text-sm shadow-panel transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-surface-2"
            >
              <span className="block truncate font-semibold">{kit.ideaText}</span>
              <span className="mt-1 block text-xs text-fg-muted">
                {locale === "zh" ? getGoal(kit.goal).label : getGoal(kit.goal).labelEn} · {kit.outputs.length} {locale === "zh" ? "个输出" : "outputs"} ·{" "}
                {new Date(kit.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
