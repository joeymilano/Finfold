"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

type UserState = { email: string } | null;

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

    let supabase: ReturnType<typeof import("@/lib/supabase-client").createSupabaseBrowserClient>;
    try {
      // dynamic import to avoid SSR issues
      import("@/lib/supabase-client").then(({ createSupabaseBrowserClient }) => {
        supabase = createSupabaseBrowserClient();
        supabase.auth.getUser().then(({ data }) => {
          setUser(data.user ? { email: data.user.email ?? "" } : null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ? { email: session.user.email ?? "" } : null);
        });
        return () => subscription.unsubscribe();
      });
    } catch {
      // Supabase not configured
    }
  }, []);

  async function logout() {
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase-client");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
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
