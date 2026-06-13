"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bot,
  CalendarDays,
  CreditCard,
  FileStack,
  Gauge,
  Library,
  Settings,
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

// V1 launch: only show core nav items. Future items are listed below — set `hidden: false` to re-enable.
const navItemDefs = [
  { href: "/workbench", zh: "内容生产区", en: "Workbench", descZh: "生成与编辑", descEn: "Generate", icon: WandSparkles },
  { href: "/packages", zh: "内容套件", en: "Content Kits", descZh: "历史记录", descEn: "History", icon: FileStack },
  { href: "/billing", zh: "订阅与额度", en: "Billing", descZh: "计划与用量", descEn: "Plans & Usage", icon: CreditCard },
  { href: "/settings", zh: "偏好设置", en: "Settings", descZh: "账号与偏好", descEn: "Preferences", icon: Settings },
  // ── V2+ features (hidden until ready) ─────────────────────────────────────
  // { href: "/dashboard", zh: "运营态势", en: "Dashboard", descZh: "增长驾驶舱", descEn: "Operations", icon: Gauge, hidden: true },
  // { href: "/agents", zh: "自动化流程", en: "Agents", descZh: "Agent 指挥中心", descEn: "Automation", icon: Bot, hidden: true },
  // { href: "/assets", zh: "产品资产库", en: "Assets", descZh: "素材与资产", descEn: "Media & Files", icon: Library, hidden: true },
  // { href: "/calendar", zh: "内容排期", en: "Calendar", descZh: "发布日历", descEn: "Publish Plan", icon: CalendarDays, hidden: true },
  // { href: "/guardrails", zh: "品牌规则", en: "Guardrails", descZh: "品牌与合规", descEn: "Brand Rules", icon: ShieldCheck, hidden: true },
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
    <div className="min-h-screen bg-bg text-fg">
      {/* Mobile fixed top header */}
      <MobileHeader />

      {/* Mobile fixed bottom tab bar */}
      <MobileTabBar />

      <div className="mx-auto max-w-[1680px] lg:grid lg:grid-cols-[280px_1fr]">
        {/* Sidebar — desktop only */}
        <aside className="hidden flex-col border-r border-hairline bg-surface lg:flex lg:min-h-screen">
          {/* Logo + toggles */}
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            <Link href="/workbench" className="group flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-brand shadow-glow-brand">
                <FishLogo variant="app-icon" className="h-11 w-11 object-cover" />
              </span>
              <span className="leading-none">
                <span className="block text-base font-semibold tracking-normal text-fg">{brand.name}</span>
                <span className="brand-cn mt-1 block text-[12px] text-fg-muted">{brand.chineseName}</span>
              </span>
            </Link>
            <div className="flex items-center gap-1.5">
              <LocaleToggle />
              <ThemeToggle />
            </div>
          </div>

          {/* User profile / Login banner */}
          <SidebarUserPanel />

          {/* Nav links */}
          <nav className="mt-5 grid gap-1 px-4">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          <div className="flex-1" />
        </aside>

        {/* Main content */}
        {/* pt-14 on mobile = clear fixed header; pb-20 = clear fixed tab bar */}
        <main className="min-w-0 overflow-x-hidden px-4 pt-16 pb-20 md:px-6 lg:px-8 lg:pt-5 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
