"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, Settings, User } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

type UserState = {
  email: string;
  plan: string;
  avatarUrl: string | null;
} | null;

export function SidebarUserPanel() {
  const router = useRouter();
  const locale = useLocale();
  const [user, setUser] = useState<UserState>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    let supabase: ReturnType<typeof import("@/lib/supabase-client").createSupabaseBrowserClient>;
    let cleanup: (() => void) | undefined;

    import("@/lib/supabase-client").then(({ createSupabaseBrowserClient }) => {
      supabase = createSupabaseBrowserClient();

      async function loadUser() {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { setUser(null); return; }
        const plan = await fetchPlan();
        const avatarUrl = (data.user.user_metadata?.avatar_url as string | undefined) ?? null;
        setUser({ email: data.user.email ?? "", plan, avatarUrl });
      }

      void loadUser();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
        if (!session?.user) { setUser(null); return; }
        const plan = await fetchPlan();
        const avatarUrl = (session.user.user_metadata?.avatar_url as string | undefined) ?? null;
        setUser({ email: session.user.email ?? "", plan, avatarUrl });
      });

      // Refresh avatar when Settings page fires this event
      function onAvatarChange() { void loadUser(); }
      function onVisibilityChange() {
        if (document.visibilityState === "visible") {
          void loadUser();
        }
      }
      function onWindowFocus() { void loadUser(); }
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

  async function fetchPlan(): Promise<string> {
    try {
      const res = await fetch("/api/entitlements/check", { method: "POST", cache: "no-store" });
      const data = (await res.json()) as { plan?: string; locale?: string };
      // Sync locale preference from profile to localStorage on login
      if (data.locale === "en" || data.locale === "zh") {
        const { applyLocale } = await import("@/lib/theme");
        applyLocale(data.locale);
      }
      return data.plan ?? "free";
    } catch {
      return "free";
    }
  }

  async function logout() {
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase-client");
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
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
          className="focus-ring flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 text-sm font-semibold text-fg-muted transition-colors hover:border-brand/40 hover:text-fg"
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
          <LogIn className="h-4 w-4 shrink-0 text-brand" />
        </Link>
      </div>
    );
  }

  const initial = (user.email[0] ?? "?").toUpperCase();
  const planLabel: Record<string, { zh: string; en: string }> = {
    free: { zh: "免费版", en: "Free" },
    starter: { zh: "Starter", en: "Starter" },
    creator: { zh: "Creator", en: "Creator" },
    pro: { zh: "Pro", en: "Pro" },
    team: { zh: "Team", en: "Team" },
    trial: { zh: "试用", en: "Trial" },
    local: { zh: "本地", en: "Local" },
  };

  const planName = planLabel[user.plan]
    ? planLabel[user.plan][locale]
    : user.plan;

  return (
    <div className="border-b border-hairline px-3 pb-4 mb-1 space-y-1">
      {/* User row */}
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-sm font-bold text-white shadow-glow-brand">
          {user.avatarUrl
            ? <Image src={user.avatarUrl} alt="avatar" fill className="object-cover" unoptimized />
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
      <div className="flex gap-1.5">
        <Link
          href="/settings"
          className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-2 text-xs font-semibold text-fg-muted transition-colors hover:border-brand/40 hover:text-fg"
        >
          <Settings className="h-3.5 w-3.5" />
          {locale === "en" ? "Settings" : "设置"}
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-2 text-xs font-semibold text-fg-muted transition-colors hover:border-risk/40 hover:text-risk"
        >
          <LogOut className="h-3.5 w-3.5" />
          {locale === "en" ? "Log out" : "退出登录"}
        </button>
      </div>
    </div>
  );
}
