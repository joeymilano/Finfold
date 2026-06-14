"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

type UserState = { email: string } | null;

/**
 * UserMenu — compact user menu shown in the top bar.
 *
 * User data is fetched from the backend /api/auth/user route so that
 * the secret service-role key is never exposed to the browser.
 * Auth state changes are still detected via the Supabase browser client
 * (using the publishable key only) for real-time reactivity.
 */
export function UserMenu() {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<UserState>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    async function loadUser() {
      try {
        const res = await fetch("/api/auth/user", { cache: "no-store" });
        const data = await res.json();
        setUser(data.user ? { email: data.user.email ?? "" } : null);
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
        void loadUser();
      });

      // Also re-fetch on visibility change and window focus
      function onVisibilityChange() {
        if (document.visibilityState === "visible") {
          void loadUser();
        }
      }

      function onWindowFocus() {
        void loadUser();
      }

      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("focus", onWindowFocus);

      return () => {
        subscription.unsubscribe();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", onWindowFocus);
      };
    });
  }, []);

  async function logout() {
    try {
      // Route through backend API to keep secret key server-side
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/dashboard");
    } catch {
      // ignore
    }
  }

  if (!mounted) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
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
