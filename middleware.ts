import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders, evaluateRequestSecurity } from "@/lib/security";
import { resolveRequestId } from "@/lib/observability";
import { isEnglishPathname } from "@/lib/locale-routing";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function applyResponseHeaders(headers: Headers, requestId: string) {
  applySecurityHeaders(headers, requestId);
  // This deployment flag is injected by the staging build and Worker config.
  // Keep crawlers able to fetch pages and observe the exclusion directive.
  if (process.env.FINFOLD_DEPLOYMENT_ENV === "staging") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
}

function applyContentLanguage(headers: Headers, pathname: string) {
  headers.set("Content-Language", isEnglishPathname(pathname) ? "en" : "zh-CN");
}

/**
 * Chinese public marketing pages that have a mirrored /en route. Only these
 * paths qualify for locale negotiation — dashboard and API routes must never
 * be redirected based on language.
 */
const PUBLIC_PAGES_WITH_ENGLISH_ALTERNATE = ["/blog", "/tools", "/use-cases", "/guide"];

function hasEnglishAlternate(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PAGES_WITH_ENGLISH_ALTERNATE.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Priority mirrors the client-side locale-init script: an explicit
 * `finfold-locale` cookie wins (the user toggled the language manually);
 * otherwise fall back to the request's primary Accept-Language tag.
 * Crawlers (Googlebot, Baiduspider) send no Accept-Language and therefore
 * always keep the Chinese origin URL, so SEO indexing is unaffected.
 */
function requestPrefersEnglish(request: NextRequest): boolean {
  const saved = request.cookies.get("finfold-locale")?.value;
  if (saved === "zh") return false;
  if (saved === "en") return true;
  const primary =
    (request.headers.get("accept-language") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return primary.startsWith("en");
}

/**
 * Locale negotiation for link previews and international visitors.
 *
 * Chat clients (Teams, Slack, LinkedIn) render their link cards from the og
 * tags of the exact URL pasted — they ignore hreflang and the viewer's UI
 * language. The root URL is statically pre-rendered in Chinese, so pasting
 * finfold.app anywhere shows a Chinese card even for English users. Redirecting
 * English-preferring requests to the /en mirror makes those fetchers land on
 * the English og tags. A 307 (temporary) is intentional: one URL serves
 * different languages by request, so search engines must not fold the variants.
 */
function negotiateEnglishRedirect(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const pathname = request.nextUrl.pathname;
  if (isEnglishPathname(pathname) || !hasEnglishAlternate(pathname)) return null;
  if (!requestPrefersEnglish(request)) return null;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  return NextResponse.redirect(url, 307);
}

/**
 * Session-refresh middleware (REQUIRED by @supabase/ssr).
 *
 * The Supabase access token expires (~1h). Without this middleware the
 * browser keeps a stale cookie, so server components and API routes that
 * verify the session see no valid user — the user appears
 * logged out even right after signing in.
 *
 * On every matched request we:
 *  1. Read the auth cookies from the incoming request.
 *  2. Call getClaims(), which refreshes when necessary and verifies modern
 *     asymmetric JWTs locally after the signing key has been cached.
 *  3. Write any refreshed cookies onto BOTH the request (so downstream
 *     handlers in this same pass see them) and the response (so the
 *     browser stores them).
 *
 * Pattern follows the official Supabase Next.js SSR guide.
 */
export async function middleware(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  // Server layouts do not receive the current pathname directly. Forward it
  // as an internal request header so the dashboard route group can keep the
  // public workbench trial open without exposing any other private route.
  requestHeaders.set("x-finfold-pathname", request.nextUrl.pathname);
  requestHeaders.set(
    "x-finfold-request-target",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  const securityDecision = evaluateRequestSecurity(request);
  if (!securityDecision.allowed) {
    const blocked = NextResponse.json(
      { error: securityDecision.message, requestId },
      { status: securityDecision.status }
    );
    applyResponseHeaders(blocked.headers, requestId);
    return blocked;
  }

  // Locale negotiation runs before the Supabase session pass: link-preview
  // fetchers never carry auth state, and a browser that gets redirected simply
  // refreshes its session on the /en hop instead. Redirect responses still get
  // the standard security headers and English Content-Language below.
  const localeRedirect = negotiateEnglishRedirect(request);
  if (localeRedirect) {
    applyContentLanguage(localeRedirect.headers, "/en");
    applyResponseHeaders(localeRedirect.headers, requestId);
    return localeRedirect;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured, do nothing — the app degrades to showcase.
  if (!url || !anonKey) {
    applyContentLanguage(response.headers, request.nextUrl.pathname);
    applyResponseHeaders(response.headers, requestId);
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const refreshedCookieHeader = request.headers.get("cookie");
        if (refreshedCookieHeader) {
          requestHeaders.set("cookie", refreshedCookieHeader);
        }
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: this refreshes the session when necessary and rewrites cookies.
  // Unlike getUser(), getClaims() avoids a remote Auth request on every route
  // when the project uses asymmetric signing keys (Finfold production does).
  await supabase.auth.getClaims();

  applyContentLanguage(response.headers, request.nextUrl.pathname);
  applyResponseHeaders(response.headers, requestId);
  return response;
}

export const config = {
  /**
   * Run on all routes except static assets and image files. Auth API routes
   * and pages all need a fresh session, so they stay matched.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
