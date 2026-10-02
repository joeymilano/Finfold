"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuthUser } from "@/components/auth/AuthUserProvider";
import type { Locale } from "@/lib/i18n";

export type PublicAuthUser = { email: string; avatarUrl: string | null };

/**
 * Signed-in identity for statically pre-rendered public pages. Resolved on the
 * client by the root auth provider so the header, app shell, settings and
 * analytics all share one /api/auth/user request.
 */
export function usePublicAuthUser(): { ready: boolean; user: PublicAuthUser | null } {
  const { ready, user } = useAuthUser();
  return {
    ready,
    user: user ? { email: user.email, avatarUrl: user.avatarUrl } : null,
  };
}

/**
 * Signed-in avatar for the public site header. The avatar mirrors the in-app
 * SidebarUserPanel: uploaded avatar image or the email initial on a solid
 * action-colored circle. Guests keep "Log in".
 */
export function LandingUserAvatar({ locale }: { locale: Locale }) {
  const { ready, user } = usePublicAuthUser();

  if (!ready) {
    return <span aria-hidden="true" className="inline-block h-8 w-8 animate-pulse rounded-full bg-fg/10" />;
  }

  if (!user) {
    return (
      <span className="hidden sm:block">
        <Link href="/login" className="btn-ghost focus-ring px-3 py-1.5 text-sm">
          {locale === "en" ? "Log in" : "登录"}
        </Link>
      </span>
    );
  }

  const dashboardLabel = locale === "en" ? "Open dashboard" : "进入工作台";
  return (
    <Link
      href="/dashboard"
      title={user.email}
      aria-label={`${dashboardLabel}（${user.email}）`}
      className="focus-ring flex h-8 w-8 shrink-0 rounded-full shadow-glow-action transition-transform hover:scale-105"
    >
      <UserAvatar
        avatarUrl={user.avatarUrl}
        fallback={(user.email[0] ?? "?").toUpperCase()}
        alt={user.email}
        className="h-8 w-8 text-sm"
      />
    </Link>
  );
}
