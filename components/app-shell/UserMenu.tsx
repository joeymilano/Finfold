"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import { LogIn, LogOut, User } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

/**
 * UserMenu — compact user menu shown in the top bar.
 *
 * User data comes from the root AuthUserProvider, which shares one backend
 * /api/auth/user request and one browser auth listener across the whole app.
 */
export function UserMenu() {
  const router = useRouter();
  const locale = useLocale();
  const { ready, user, refresh } = useAuthUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

  }, []);

  async function logout() {
    try {
      // Route through backend API to keep secret key server-side
      await fetch("/api/auth/logout", { method: "POST" });
      await refresh();
      router.push("/dashboard");
    } catch {
      // ignore
    }
  }

  if (!mounted) return null;

  if (!ready) {
    return <span aria-label={locale === "en" ? "Loading account" : "正在加载账户"} className="h-9 w-9 animate-pulse rounded-lg bg-surface-2" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-action/50 hover:text-fg"
      >
        <LogIn className="h-3.5 w-3.5" />
        {locale === "en" ? "Log in" : "登录"}
      </Link>
    );
  }

  const logoutLabel = locale === "en" ? "Log out" : "退出登录";

  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg-muted sm:inline-flex">
        <User className="h-3.5 w-3.5" />
        {user.email.split("@")[0]}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        aria-label={logoutLabel}
        title={logoutLabel}
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-fg-muted transition-colors hover:border-risk/50 hover:text-risk"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
