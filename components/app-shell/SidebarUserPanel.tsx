"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreditCard, LogIn, LogOut, Settings, User } from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";
import { entitlementPlanName } from "@/lib/pricing";

// Throttle profile re-fetches so the panel doesn't hit /api/auth/user on
// every window focus / visibilitychange. Auth state changes and Settings-
// page avatar uploads force-bypass the throttle. Module-scoped so it
// survives re-renders across the whole dashboard session.
const USER_FETCH_TTL_MS = 30_000;
let lastUserFetchAt = 0;

type UserState = {
  email: string;
  plan: string;
  avatarUrl: string | null;
} | null;

/**
 * SidebarUserPanel — shows the current user's avatar, plan, and actions.
 *
 * User data is fetched from the backend /api/auth/user route so that
 * the secret service-role key is never exposed to the browser.
 * Auth state changes are still detected via the Supabase browser client
 * (using the publishable key only) for real-time reactivity.
 */
export function SidebarUserPanel() {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<UserState>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    let cleanup: (() => void) | undefined;

    async function loadUser(force = false) {
      if (!force && Date.now() - lastUserFetchAt < USER_FETCH_TTL_MS) return;
      lastUserFetchAt = Date.now();
      try {
        const res = await fetch("/api/auth/user", { cache: "no-store" });
        const data = await res.json();
        if (!data.user) {
          setUser(null);
          return;
        }
        setUser({
          email: data.user.email ?? "",
          plan: data.user.plan ?? "free",
          avatarUrl: data.user.avatarUrl ?? null,
        });
        // Sync locale preference from profile to localStorage on login
        if (data.user.locale === "en" || data.user.locale === "zh") {
          const { applyLocale } = await import("@/lib/theme");
          applyLocale(data.user.locale);
        }
      } catch {
        setUser(null);
      }
    }

    void loadUser();

    // Use the Supabase browser client (publishable key only) to listen
    // for auth state changes and trigger a re-fetch from the backend.
    import("@/lib/supabase-client").then(({ createSupabaseBrowserClient }) => {
      const supabase = createSupabaseBrowserClient();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        // Auth state changed (sign-in/out) — bypass throttle, always refresh.
        void loadUser(true);
      });

      // Refresh avatar when Settings page fires this event
      function onAvatarChange() { void loadUser(true); }
      function onVisibilityChange() {
        if (document.visibilityState === "visible") {
          void loadUser(); // throttled (30s)
        }
      }
      function onWindowFocus() { void loadUser(); } // throttled (30s)
      window.addEventListener("finfold-avatar-change", onAvatarChange);
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("focus", onWindowFocus);

      cleanup = () => {
        subscription.unsubscribe();
        window.removeEventListener("finfold-avatar-change", onAvatarChange);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", onWindowFocus);
      };
    });

    return () => {
      cleanup?.();
    };
  }, []);


  async function logout() {
    try {
      // Route through backend API to keep secret key server-side
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/login");
    } catch {
      // ignore
    }
  }

  if (!mounted) return null;

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
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action text-sm font-bold text-on-action shadow-glow-action">
          {user.avatarUrl
            ? <Image src={user.avatarUrl} alt="avatar" fill sizes="32px" className="object-cover" priority unoptimized />
            : initial}
        </span>
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
