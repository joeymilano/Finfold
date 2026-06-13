"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarDays,
  CreditCard,
  FileStack,
  Gauge,
  Library,
  Settings,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

const primaryTabs = [
  { href: "/dashboard", zh: "态势", en: "Dash", icon: Gauge },
  { href: "/workbench", zh: "生产", en: "Build", icon: WandSparkles },
  { href: "/packages", zh: "套件", en: "Kits", icon: FileStack },
  { href: "/agents", zh: "流程", en: "Agents", icon: Bot },
  { href: "/assets", zh: "资产", en: "Assets", icon: Library },
  { href: "/calendar", zh: "排期", en: "Plan", icon: CalendarDays },
  { href: "/guardrails", zh: "规则", en: "Rules", icon: ShieldCheck },
  { href: "/billing", zh: "订阅", en: "Plans", icon: CreditCard },
  { href: "/settings", zh: "设置", en: "Prefs", icon: Settings },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const locale = useLocale();

  const tabs = primaryTabs;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch gap-1 overflow-x-auto border-t border-hairline bg-surface/95 px-2 backdrop-blur-xl lg:hidden">
      {tabs.map(({ href, zh, en, icon: Icon }) => {
        const active = pathname === href || (href !== "/workbench" && pathname?.startsWith(href));
        const label = locale === "en" ? en : zh;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-w-[58px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
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
    </nav>
  );
}
