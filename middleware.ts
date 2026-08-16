import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders, evaluateRequestSecurity } from "@/lib/security";
import { resolveRequestId } from "@/lib/observability";
import { isEnglishPathname } from "@/lib/locale-routing";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function applyContentLanguage(headers: Headers, pathname: string) {
  headers.set("Content-Language", isEnglishPathname(pathname) ? "en" : "zh-CN");
}

/**
 * Session-refresh middleware (REQUIRED by @supabase/ssr).
 *
 * The Supabase access token expires (~1h). Without this middleware the
 * browser keeps a stale cookie, so server components and API routes that
 * call `supabase.auth.getUser()` see no valid session — the user appears
 * logged out even right after signing in.
 *
 * On every matched request we:
 *  1. Read the auth cookies from the incoming request.
 *  2. Call getUser(), which silently refreshes an expired token.
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
    applySecurityHeaders(blocked.headers, requestId);
    return blocked;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured, do nothing — the app degrades to showcase.
  if (!url || !anonKey) {
    applyContentLanguage(response.headers, request.nextUrl.pathname);
    applySecurityHeaders(response.headers, requestId);
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

  // IMPORTANT: this refreshes the session and rewrites cookies if needed.
  // Do not run code between createServerClient and getUser().
  await supabase.auth.getUser();

  applyContentLanguage(response.headers, request.nextUrl.pathname);
  applySecurityHeaders(response.headers, requestId);
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
