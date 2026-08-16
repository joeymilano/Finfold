import { isPaidPublicPlanKey, type PaidPublicPlanKey } from "@/lib/pricing";

const FALLBACK_RETURN_TO = "/dashboard";
const INTERNAL_ORIGIN = "https://finfold.internal";

/**
 * Accept only a same-origin product path for post-auth navigation. This value
 * crosses marketing, auth, OAuth callback, and dashboard boundaries, so it
 * must never become an open redirect or point back into the auth loop.
 */
export function sanitizeInternalReturnTo(
  value: string | null | undefined,
  fallback = FALLBACK_RETURN_TO
): string {
  const candidate = value?.trim();
  if (
    !candidate
    || candidate.length > 2_048
    || !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
    if (
      parsed.pathname === "/login"
      || parsed.pathname === "/signup"
      || parsed.pathname.startsWith("/auth/")
      || parsed.pathname.startsWith("/api/")
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
export function buildAuthHref(route: "/login" | "/signup", returnTo?: string | null): string {
  const safeReturnTo = sanitizeInternalReturnTo(returnTo);
  const params = new URLSearchParams({ next: safeReturnTo });
  return `${route}?${params.toString()}`;
}

export function getPlanIntentFromReturnTo(returnTo: string | null | undefined): PaidPublicPlanKey | null {
  const safeReturnTo = sanitizeInternalReturnTo(returnTo);
  const plan = new URL(safeReturnTo, INTERNAL_ORIGIN).searchParams.get("plan");
  return isPaidPublicPlanKey(plan) ? plan : null;
}
