"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { CreditCard, LogIn, LogOut, Settings, User } from "@/components/ui/icons";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useLocale } from "@/hooks/useLocale";
import { entitlementPlanName } from "@/lib/pricing";
import { applyLocale, getExplicitLocalePreference } from "@/lib/theme";

/**
 * SidebarUserPanel — shows the current user's avatar, plan, and actions.
 *
 * User data comes from the root AuthUserProvider, which shares one backend
 * /api/auth/user request and one browser auth listener across the whole app.
 */
export function SidebarUserPanel() {
  const router = useRouter();
  const locale = useLocale();
  const { ready, user, refresh } = useAuthUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const profileLocale = user?.locale;
    if (
      (profileLocale === "en" || profileLocale === "zh")
      && !getExplicitLocalePreference()
    ) {
      applyLocale(profileLocale);
    }
  }, [user?.locale]);

  async function logout() {
    try {
      // Route through backend API to keep secret key server-side
      await fetch("/api/auth/logout", { method: "POST" });
      await refresh();
      router.push("/login");
    } catch {
      // ignore
    }
  }

  if (!mounted) return null;

  if (!ready) {
    return (
      <div aria-label={locale === "en" ? "Loading account" : "正在加载账户"} className="mb-1 border-b border-hairline px-3 pb-4">
        <div className="h-[58px] animate-pulse rounded-xl border border-hairline bg-surface-2" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="border-b border-hairline px-3 pb-4 mb-1">
        <Link
          href="/login"
          className="focus-ring flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 text-sm font-semibold text-fg-muted transition-colors hover:border-action/40 hover:text-fg"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-hairline text-fg-muted">
            <User className="h-4 w-4" />
          </span>
          <span className="flex-1 leading-none">
            <span className="block text-xs font-semibold text-fg">
              {locale === "en" ? "Log in / Sign up" : "登录 / 注册"}
            </span>
            <span className="mt-0.5 block text-[11px] text-fg-muted">
              {locale === "en" ? "Save kits, unlock all features" : "保存内容包、解锁完整功能"}
            </span>
          </span>
          <LogIn className="h-4 w-4 shrink-0 text-action-strong dark:text-action" />
        </Link>
      </div>
    );
  }

  const initial = (user.email[0] ?? "?").toUpperCase();
  const planName = entitlementPlanName(user.plan, locale);

  return (
    <div className="border-b border-hairline px-3 pb-4 mb-1 space-y-1">
      {/* User row */}
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <UserAvatar
          avatarUrl={user.avatarUrl}
          fallback={initial}
          alt={user.email}
          className="h-8 w-8 text-sm shadow-glow-action"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-fg">{user.email}</p>
          <p className="mt-0.5 text-[11px] font-medium text-fg-muted">
            {planName}
          </p>
        </div>
      </div>

      {/* Action row */}
      <div className="grid grid-cols-3 gap-1.5">
        <Link
          href="/billing"
          className="focus-ring flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-2 text-[11px] font-semibold text-fg-muted transition-colors hover:border-action/40 hover:text-fg"
        >
          <CreditCard className="h-3.5 w-3.5" />
          {locale === "en" ? "Plan" : "订阅"}
        </Link>
        <Link
          href="/settings"
          className="focus-ring flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-2 text-[11px] font-semibold text-fg-muted transition-colors hover:border-action/40 hover:text-fg"
        >
          <Settings className="h-3.5 w-3.5" />
          {locale === "en" ? "Settings" : "设置"}
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="focus-ring flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-2 text-[11px] font-semibold text-fg-muted transition-colors hover:border-risk/40 hover:text-risk"
        >
          <LogOut className="h-3.5 w-3.5" />
          {locale === "en" ? "Log out" : "退出"}
        </button>
      </div>
    </div>
  );
}
