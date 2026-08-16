"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

/**
 * Client-side authenticated redirect for the landing page.
 *
 * WHY THIS EXISTS
 * The landing page must be STATICALLY pre-rendered so search engines receive
 * the full marketing copy in the initial HTML. This is critical for Baidu,
 * which does not execute JavaScript — a dynamically-rendered landing page
 * leaves crawlers with an empty shell and zero indexable content.
 *
 * Reading cookies or calling Supabase auth on the server would force the page
 * into dynamic rendering (Next.js would emit no index.html). So the auth check
 * is moved here, to the client: after hydration we look up the session, and if
 * the visitor is signed in we send them to the product.
 *
 * TRADE-OFF
 * Signed-out visitors (the overwhelming majority of landing traffic) see the
 * marketing page instantly with no redirect and no extra work. Only signed-in
 * visitors pay a sub-100ms client round-trip before being redirected — an
 * acceptable cost for full SEO pre-rendering.
 *
 * This replaces the previous server-side getUser() + redirect() that lived in
 * app/page.tsx.
 *
 * ESCAPE HATCH
 * The app shell's logo (DashboardShell.tsx, MobileHeader.tsx) links here so a
 * signed-in user can deliberately step out to the marketing page — e.g. to
 * copy a link or re-read the pricing page. Without an escape hatch this
 * redirect would immediately bounce them back to /dashboard, making the
 * logo link a dead click. `?stay=1` marks that intent and skips the auth
 * check entirely for this page load. Read via window.location (not
 * useSearchParams) so this component doesn't force a Suspense boundary on
 * the statically pre-rendered landing page. The param is stripped from the
 * visible URL via history.replaceState (NOT router.replace, which would
 * re-run this effect with the param gone and perform the real redirect
 * anyway) so reloading or sharing the page doesn't carry the bypass forward.
 */
export function AuthenticatedRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("stay") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // Showcase mode (no Supabase configured) — nothing to redirect.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }

    let active = true;
    const supabase = createSupabaseBrowserClient();

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (active && user) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        // Session lookup failed (e.g. network) — just show the landing page.
      });

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
