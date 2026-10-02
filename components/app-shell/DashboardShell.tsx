"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Bot,
  ChevronDown,
  FileStack,
  Gauge,
  MessageSquare,
  ShieldCheck,
  Target,
  WandSparkles
} from "@/components/ui/icons";
import { BugReportButton } from "@/components/app-shell/BugReportButton";
import { BeianNotice } from "@/components/BeianNotice";
import { GlobalAgentRail } from "@/components/app-shell/GlobalAgentRail";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { MobileHeader } from "@/components/app-shell/MobileHeader";
import { MobileTabBar } from "@/components/app-shell/MobileTabBar";
import { NavLink } from "@/components/app-shell/NavLink";
import { SidebarUserPanel } from "@/components/app-shell/SidebarUserPanel";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { EASE } from "@/components/landing/motion-primitives";
import { brand } from "@/lib/brand";
import { getStoredLocale, type Locale } from "@/lib/theme";

const primaryNavItemDefs = [
  { href: "/dashboard", zh: "Finfold智能体", en: "Finfold Agent", descZh: "对话、判断与执行", descEn: "Chat, decide & run", icon: Bot },
  { href: "/overview", zh: "增长总览", en: "Growth Overview", descZh: "粉丝、增长与目标", descEn: "Followers, growth & goals", icon: Gauge },
  { href: "/operations", zh: "增长任务", en: "Missions", descZh: "目标、机会与执行", descEn: "Goals, opportunities & work", icon: Target },
  { href: "/workbench", zh: "创作台", en: "Studio", descZh: "高级生成与编辑", descEn: "Advanced creation", icon: WandSparkles },
  { href: "/packages", zh: "内容库", en: "Content Library", descZh: "已生成的内容与成果", descEn: "Generated content & results", icon: FileStack },
];

const advancedNavItemDefs = [
  // 小红书陪跑不再单列：入口收敛到运营板块页签（增长任务 → 小红书陪跑）。
  { href: "/brand-memory", zh: "品牌记忆", en: "Identity Memory", descZh: "身份与语气", descEn: "Identity & voice", icon: MessageSquare },
  { href: "/guardrails", zh: "品牌规则", en: "Brand Rules", descZh: "禁用词与规范", descEn: "Rules", icon: ShieldCheck },
];

export function DashboardShell({
  children
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>("zh");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setLocale(getStoredLocale());
    function onLocaleChange(e: Event) {
      setLocale((e as CustomEvent<Locale>).detail);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, []);

  const localizeNavItems = (items: typeof primaryNavItemDefs | typeof advancedNavItemDefs) => items.map((item) => ({
    href: item.href,
    label: locale === "en" ? item.en : item.zh,
    description: locale === "en" ? item.descEn : item.descZh,
    icon: item.icon,
  }));
  const navItems = localizeNavItems(primaryNavItemDefs);
  const advancedNavItems = localizeNavItems(advancedNavItemDefs);

  if (pathname === "/workbench" && searchParams.get("start") === "1") {
    return <div data-product-shell className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-hairline px-5 py-4">
        <Link href={locale === "en" ? "/en#stay" : "/#stay"} className="flex items-center gap-2.5 text-sm font-bold"><FishLogo variant="app-icon" className="h-8 w-8" />Finfold</Link>
        <div className="flex items-center gap-2"><LocaleToggle /><ThemeToggle /></div>
      </header>
      <main className="mx-auto max-w-5xl px-5">{children}</main>
    </div>;
  }

  return (
    <div data-product-shell className="min-h-screen w-full overflow-x-hidden bg-bg text-fg lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,rgb(var(--action)/0.11),transparent_28%),radial-gradient(circle_at_86%_4%,rgb(var(--info)/0.08),transparent_24%),linear-gradient(180deg,rgb(var(--surface-2)/0.34),transparent_42%)]" />
      {/* Mobile fixed top header */}
      <MobileHeader />

      {/* Mobile fixed bottom tab bar */}
      <MobileTabBar />

      {/* Persistent product feedback channel. Delivery stays server-side so the
          founder inbox and Resend credentials never reach the browser. */}
      <BugReportButton />

      {/* Persistent across dashboard routes; the audited Agent loop still
          controls capability selection, confirmation, and execution. */}
      <GlobalAgentRail />

      {/* 大屏不再把整个工作区锁死在 1680px：xl 起逐步放宽，让侧边栏贴边、
          主区域吃满屏幕，具体行宽由各页面自己的 max-w 控制。 */}
      <div className="mx-auto w-full max-w-[1680px] xl:max-w-[1920px] 2xl:max-w-[2240px] lg:grid lg:h-screen lg:grid-cols-[280px_1fr] lg:overflow-hidden">
        {/* Sidebar — desktop only.
            用 HTML hidden 属性而非 Tailwind .hidden：浏览器 UA 样式 [hidden]{display:none}
            在任何外部 CSS 加载/水合之前就已生效，彻底避免窄屏(<1024px)下侧边栏闪现出"黑边"。
            lg:flex 在 ≥1024px 覆盖它（author 层样式优先级高于 UA 层），桌面端正常显示。 */}
        <aside hidden className="relative flex-col border-r border-hairline bg-surface/88 backdrop-blur-xl lg:flex lg:h-full lg:min-h-0 lg:overflow-hidden">
          <div className="grain-local" aria-hidden />
          {/* Logo + toggles */}
          <div className="relative flex items-center justify-between gap-2 px-4 py-3.5">
            {/* #stay tells AuthenticatedRedirect to actually show the
                landing page instead of bouncing this signed-in user
                straight back to /workbench — see that component's doc. */}
            <Link href={locale === "en" ? "/en#stay" : "/#stay"} className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
              <motion.span
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl"
                whileHover={{ rotate: -6, scale: 1.06 }}
                transition={{ type: "spring", stiffness: 340, damping: 16 }}
              >
                <FishLogo variant="app-icon" className="h-10 w-10 object-cover" />
              </motion.span>
              <span className="leading-none">
                <span className="block text-sm font-bold tracking-tight text-fg">{brand.name}</span>
                {locale === "zh" ? (
                  <span className="brand-cn mt-1 block text-[11px] text-fg-muted">{brand.chineseName}</span>
                ) : null}
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
          <motion.nav
            className="mt-5 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto px-4 pb-4"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } }
            }}
          >
            {navItems.map((item) => (
              <motion.div
                key={item.href}
                variants={{
                  hidden: { opacity: 0, x: -14 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE } }
                }}
              >
                <NavLink {...item} />
              </motion.div>
            ))}
            <details className="group mt-2 border-t border-hairline pt-3">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-fg-muted transition hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden">
                <span>{locale === "en" ? "Advanced tools" : "高级工具"}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-1.5 grid gap-1.5">
                {advancedNavItems.map((item) => <NavLink key={item.href} {...item} />)}
              </div>
            </details>
          </motion.nav>

          {/* 国内站（www.finfold.cn）备案号；全球站构建未注入时为空。 */}
          <BeianNotice className="px-4 pb-3 text-[11px] text-fg-muted" />
        </aside>

        {/* Main content */}
        {/* pt-14 on mobile = clear fixed header; pb-20 = clear fixed tab bar */}
        <motion.main
          className="w-full max-w-full min-w-0 overflow-x-hidden px-3 pb-24 pt-16 sm:px-4 md:px-6 lg:h-screen lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-10 lg:pt-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
