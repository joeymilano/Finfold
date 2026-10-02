"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/components/auth/AuthUserProvider";

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
 * marketing page instantly. Signed-in visitors reuse the root account lookup
 * before being redirected, preserving full SEO pre-rendering without a second
 * Supabase request.
 *
 * This replaces the previous server-side getUser() + redirect() that lived in
 * app/page.tsx.
 *
 * ESCAPE HATCH
 * The app shell's logo (DashboardShell.tsx, MobileHeader.tsx) links here so a
 * signed-in user can deliberately step out to the marketing page — e.g. to
 * copy a link or re-read the pricing page. Without an escape hatch this
 * redirect would immediately bounce them back to /dashboard, making the
 * logo link a dead click. `#stay` marks that intent and skips the auth check
 * entirely for this page load. A fragment is not sent to the server, so
 * crawlers do not discover a duplicate query-string URL. The fragment is
 * stripped from the visible URL via history.replaceState (NOT
 * router.replace, which would re-run this effect with the marker gone and
 * perform the real redirect anyway).
 */
export function AuthenticatedRedirect() {
  const router = useRouter();
  const { ready, user } = useAuthUser();
  const bypassRef = useRef(false);

  useEffect(() => {
    if (bypassRef.current) return;
    if (window.location.hash === "#stay") {
      bypassRef.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    if (!ready) return;
    if (user) {
      router.replace("/dashboard");
      return;
    }

    // Keep signed-out visitors on the language URL they requested. Redirecting
    // by browser language makes the self-canonical Chinese homepage resolve to
    // /en during rendering and sends conflicting signals to search engines.
    // The public language menu links explicitly between the two versions.
  }, [ready, router, user]);

  return null;
}
