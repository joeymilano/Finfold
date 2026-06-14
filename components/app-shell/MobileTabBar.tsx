"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  CreditCard,
  FileStack,
  Gauge,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
  WandSparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

// 4 primary tabs stay on the bar; the rest live behind "更多 / More".
const primaryTabs = [
  { href: "/dashboard", zh: "仪表", en: "Home", icon: Gauge },
  { href: "/workbench", zh: "创作", en: "Create", icon: WandSparkles },
  { href: "/packages", zh: "内容", en: "Saved", icon: FileStack },
  { href: "/agents", zh: "助手", en: "Agent", icon: Bot },
];

const moreTabs = [
  { href: "/brand-memory", zh: "品牌记忆", en: "Brand Memory", icon: MessageSquare },
  { href: "/guardrails", zh: "品牌规则", en: "Brand Rules", icon: ShieldCheck },
  { href: "/billing", zh: "订阅", en: "Billing", icon: CreditCard },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const locale = useLocale();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/workbench" && pathname?.startsWith(href));

  // Highlight the "More" button when one of its routes is active.
  const moreActive = moreTabs.some((tab) => isActive(tab.href));

  // Close the sheet whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Slide-up "More" sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={locale === "en" ? "Close menu" : "关闭菜单"}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-bg/60 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-16 rounded-t-2xl border-t border-hairline bg-surface px-3 pb-4 pt-3 shadow-raised">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                {locale === "en" ? "More" : "更多"}
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-1">
              {moreTabs.map(({ href, zh, en, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                      active ? "bg-brand/15 text-brand" : "text-fg hover:bg-surface-2"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {locale === "en" ? en : zh}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch gap-0.5 border-t border-hairline bg-surface/95 px-1.5 backdrop-blur-xl lg:hidden">
        {primaryTabs.map(({ href, zh, en, icon: Icon }) => {
          const active = isActive(href);
          const label = locale === "en" ? en : zh;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                active ? "text-brand" : "text-fg-muted"
              )}
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
                active ? "bg-brand/15 text-brand" : "text-fg-muted"
              )}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {label}
            </Link>
          );
        })}

        {/* More button */}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
            moreActive || moreOpen ? "text-brand" : "text-fg-muted"
          )}
        >
          <span className={cn(
            "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
            moreActive || moreOpen ? "bg-brand/15 text-brand" : "text-fg-muted"
          )}>
            <MoreHorizontal className="h-[18px] w-[18px]" />
          </span>
          {locale === "en" ? "More" : "更多"}
        </button>
      </nav>
    </>
  );
}
