"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CreditCard,
  FileStack,
  Gift,
  Gauge,
  MessageSquare,
  Settings,
  ShieldCheck,
  Target,
  User,
  WandSparkles,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLocale } from "@/hooks/useLocale";

// 移动端把智能体作为默认工作区，并保留任务、创作和我的四个高频入口。
// 「我的」是抽屉，收纳所有次级目的地，避免新用户在底部被更多入口淹没、
// 且品牌记忆、品牌规则等配置不再与智能体平铺成同级能力。
const primaryTabs = [
  { href: "/dashboard", zh: "智能体", en: "Agent", icon: Bot },
  { href: "/overview", zh: "增长", en: "Growth", icon: Gauge },
  { href: "/operations", zh: "任务", en: "Missions", icon: Target },
  { href: "/workbench", zh: "创作台", en: "Studio", icon: WandSparkles },
];

type MineItem = { href: string; zh: string; en: string; subZh: string; subEn: string; icon: typeof Bot };
type MineGroup = { zh: string; en: string; items: MineItem[] };

const mineGroups: MineGroup[] = [
  {
    zh: "结果", en: "Results",
    items: [{ href: "/packages", zh: "内容库", en: "Content Library", subZh: "生成的内容、发布状态与成果", subEn: "Generated content and reviews", icon: FileStack }],
  },
  {
    zh: "高级工具", en: "Advanced tools",
    items: [
      // 小红书陪跑入口收敛到运营板块页签（任务 → 小红书陪跑），不再在此重复。
      { href: "/brand-memory", zh: "品牌记忆", en: "Identity Memory", subZh: "身份、语气、受众", subEn: "Identity, voice, audience", icon: MessageSquare },
      { href: "/guardrails", zh: "品牌规则", en: "Brand Rules", subZh: "禁用词、不能说的话", subEn: "Banned words & rules", icon: ShieldCheck },
    ],
  },
  {
    zh: "账户", en: "Account",
    items: [
      { href: "/billing", zh: "订阅", en: "Billing", subZh: "套餐与额度", subEn: "Plan & usage", icon: CreditCard },
      { href: "/invite", zh: "邀请好友", en: "Invite friends", subZh: "双方各得 100 创作点数", subEn: "Earn 100 Credits each", icon: Gift },
      { href: "/settings", zh: "设置", en: "Settings", subZh: "语言、头像、账号", subEn: "Language, avatar, account", icon: Settings },
    ],
  },
];

const mineHrefs = mineGroups.flatMap((g) => g.items.map((i) => i.href));

export function MobileTabBar() {
  const pathname = usePathname();
  const locale = useLocale();
  const [mineOpen, setMineOpen] = useState(false);
  const mineTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mineDialogRef = useRef<HTMLDivElement | null>(null);
  const mineCloseRef = useRef<HTMLButtonElement | null>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/workbench" && pathname?.startsWith(href));

  // 当某个「我的」子路由处于激活时，高亮「我的」按钮。
  const mineActive = mineHrefs.some((h) => isActive(h));

  // 路由变化时关闭抽屉。
  useEffect(() => {
    setMineOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mineOpen) return;
    const trigger = mineTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mineCloseRef.current?.focus();

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMineOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(mineDialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      trigger?.focus();
    };
  }, [mineOpen]);

  return (
    <>
      {/* 「我的」分组抽屉 */}
      {mineOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={locale === "en" ? "Close menu" : "关闭菜单"}
            onClick={() => setMineOpen(false)}
            className="absolute inset-0 bg-bg/60 backdrop-blur-sm"
          />
          <div
            ref={mineDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={locale === "en" ? "Mine navigation" : "我的导航"}
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-hairline bg-surface px-3 pb-4 pt-3 shadow-raised"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-fg-muted">
                {locale === "en" ? "Mine" : "我的"}
              </span>
              <button
                ref={mineCloseRef}
                type="button"
                onClick={() => setMineOpen(false)}
                aria-label={locale === "en" ? "Close mine navigation" : "关闭我的导航"}
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4">
              {mineGroups.map((group) => (
                <div key={group.en} className="grid gap-1">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted/70">
                    {locale === "en" ? group.en : group.zh}
                  </p>
                  {group.items.map(({ href, zh, en, subZh, subEn, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
                          active ? "bg-action/[0.11] text-action-strong dark:text-action" : "text-fg hover:bg-surface-2"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block text-sm font-semibold">{locale === "en" ? en : zh}</span>
                          <span className={cn("block text-[11px] font-medium", active ? "text-action-strong/80 dark:text-action/80" : "text-fg-muted")}>
                            {locale === "en" ? subEn : subZh}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch gap-0.5 border-t border-hairline bg-surface/95 px-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {primaryTabs.map(({ href, zh, en, icon: Icon }) => {
          const active = isActive(href);
          const label = locale === "en" ? en : zh;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                active ? "text-action-strong dark:text-action" : "text-fg-muted"
              )}
            >
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
                active ? "bg-action/[0.11] text-action-strong dark:text-action" : "text-fg-muted"
              )}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {label}
            </Link>
          );
        })}

        {/* 「我的」按钮（抽屉触发器） */}
        <button
          ref={mineTriggerRef}
          type="button"
          onClick={() => setMineOpen((open) => !open)}
          aria-expanded={mineOpen}
          aria-haspopup="dialog"
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
            mineActive || mineOpen ? "text-action-strong dark:text-action" : "text-fg-muted"
          )}
        >
          <span className={cn(
            "flex h-7 w-7 items-center justify-center rounded-xl transition-all",
            mineActive || mineOpen ? "bg-action/[0.11] text-action-strong dark:text-action" : "text-fg-muted"
          )}>
            <User className="h-[18px] w-[18px]" />
          </span>
          {locale === "en" ? "Mine" : "我的"}
        </button>
      </nav>
    </>
  );
}
