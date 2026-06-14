"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CreditCard,
  FileStack,
  Gauge,
  MessageSquare,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

const primaryTabs = [
  { href: "/dashboard", zh: "仪表", en: "Home", icon: Gauge },
  { href: "/workbench", zh: "创作", en: "Create", icon: WandSparkles },
  { href: "/packages", zh: "内容", en: "Saved", icon: FileStack },
  { href: "/brand-memory", zh: "记忆", en: "Memory", icon: MessageSquare },
  { href: "/guardrails", zh: "规则", en: "Rules", icon: ShieldCheck },
  { href: "/agents", zh: "助手", en: "Agent", icon: Bot },
  { href: "/billing", zh: "订阅", en: "Billing", icon: CreditCard },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const locale = useLocale();

  const tabs = primaryTabs;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch gap-0.5 overflow-hidden border-t border-hairline bg-surface/95 px-1.5 backdrop-blur-xl lg:hidden">
      {tabs.map(({ href, zh, en, icon: Icon }) => {
        const active = pathname === href || (href !== "/workbench" && pathname?.startsWith(href));
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
    </nav>
  );
}
