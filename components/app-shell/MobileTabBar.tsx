"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  CreditCard,
  FileStack,
  Gauge,
  Settings,
  User,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

// V1 launch: show 4 core tabs. Uncomment items below to re-enable future tabs.
const primaryTabs = [
  { href: "/workbench",  zh: "生产区",  en: "Workbench", icon: WandSparkles },
  { href: "/packages",   zh: "套件",    en: "Kits",      icon: FileStack },
  { href: "/billing",    zh: "订阅",    en: "Billing",   icon: CreditCard },
  { href: "/settings",   zh: "设置",   en: "Settings",  icon: Settings },
  // ── V2+ (hidden until ready) ──────────────────────────────────
  // { href: "/dashboard",  zh: "态势",   en: "Dashboard", icon: Gauge },
  // { href: "/agents",     zh: "流程",   en: "Agents",    icon: Bot },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const locale = useLocale();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    import("@/lib/supabase-client").then(({ createSupabaseBrowserClient }) => {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user));
      supabase.auth.onAuthStateChange((_e, session) => setIsLoggedIn(!!session?.user));
    });
  }, []);

  const tabs = isLoggedIn
    ? primaryTabs
    : [...primaryTabs.slice(0, 3), { href: "/login", zh: "登录", en: "Log in", icon: User }];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-hairline bg-surface/95 backdrop-blur-sm lg:hidden">
      {tabs.map(({ href, zh, en, icon: Icon }) => {
        const active = pathname === href || (href !== "/workbench" && pathname?.startsWith(href));
        const label = locale === "en" ? en : zh;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
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
