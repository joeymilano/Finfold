"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bot,
  CreditCard,
  FileStack,
  Gauge,
  MessageSquare,
  ShieldCheck,
  WandSparkles
} from "lucide-react";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { MobileHeader } from "@/components/app-shell/MobileHeader";
import { MobileTabBar } from "@/components/app-shell/MobileTabBar";
import { NavLink } from "@/components/app-shell/NavLink";
import { SidebarUserPanel } from "@/components/app-shell/SidebarUserPanel";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand } from "@/lib/brand";
import { getStoredLocale, type Locale } from "@/lib/theme";

const navItemDefs = [
  { href: "/dashboard", zh: "仪表板", en: "Dashboard", descZh: "概览", descEn: "Overview", icon: Gauge },
  { href: "/workbench", zh: "创作台", en: "Workbench", descZh: "生成与编辑", descEn: "Create & edit", icon: WandSparkles },
  { href: "/packages", zh: "内容库", en: "Saved Kits", descZh: "已保存内容", descEn: "Saved output", icon: FileStack },
  { href: "/brand-memory", zh: "品牌记忆", en: "Brand Memory", descZh: "产品与语气", descEn: "Product memory", icon: MessageSquare },
  { href: "/guardrails", zh: "品牌规则", en: "Brand Rules", descZh: "禁用词与规范", descEn: "Rules", icon: ShieldCheck },
  { href: "/agents", zh: "AI 助手", en: "Agent Chat", descZh: "对话与执行", descEn: "Chat & run", icon: Bot },
  { href: "/billing", zh: "订阅", en: "Billing", descZh: "计划与额度", descEn: "Plans", icon: CreditCard },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    setLocale(getStoredLocale());
    function onLocaleChange(e: Event) {
      setLocale((e as CustomEvent<Locale>).detail);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, []);

  const navItems = navItemDefs.map((item) => ({
    href: item.href,
    label: locale === "en" ? item.en : item.zh,
    description: locale === "en" ? item.descEn : item.descZh,
    icon: item.icon,
  }));

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-bg text-fg">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgb(var(--brand)/0.18),transparent_28%),radial-gradient(circle_at_86%_4%,rgb(var(--accent)/0.14),transparent_24%),linear-gradient(180deg,rgb(var(--surface-2)/0.34),transparent_42%)]" />
      {/* Mobile fixed top header */}
      <MobileHeader />

      {/* Mobile fixed bottom tab bar */}
      <MobileTabBar />

      <div className="mx-auto w-full max-w-[1680px] lg:grid lg:grid-cols-[280px_1fr]">
        {/* Sidebar — desktop only */}
        <aside className="hidden flex-col border-r border-hairline bg-surface/88 backdrop-blur-xl lg:flex lg:sticky lg:top-0 lg:self-start lg:h-screen lg:overflow-y-auto">
          {/* Logo + toggles */}
          <div className="flex items-center justify-between gap-2 px-4 py-3.5">
            <Link href="/workbench" className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-brand shadow-glow-brand">
                <FishLogo variant="app-icon" className="h-10 w-10 object-cover" />
              </span>
              <span className="leading-none">
                <span className="block text-sm font-bold tracking-tight text-fg">{brand.name}</span>
                <span className="brand-cn mt-1 block text-[11px] text-fg-muted">{brand.chineseName}</span>
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </div>

          {/* User profile / Login banner */}
          <SidebarUserPanel />

          {/* Nav links */}
          <nav className="mt-5 grid gap-1.5 px-4">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          <div className="flex-1" />
        </aside>

        {/* Main content */}
        {/* pt-14 on mobile = clear fixed header; pb-20 = clear fixed tab bar */}
        <main className="w-full max-w-full min-w-0 overflow-x-hidden px-4 pt-16 pb-20 md:px-6 lg:px-8 lg:pt-5 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
