import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

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
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured, do nothing — the app degrades to showcase.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: this refreshes the session and rewrites cookies if needed.
  // Do not run code between createServerClient and getUser().
  await supabase.auth.getUser();

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
