
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { attributeReferral, readReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";
import { sanitizeInternalReturnTo } from "@/lib/auth-return";

/**
 * GET /auth/callback
 *
 * Completes the email-confirmation AND OAuth (Google) flow: exchanges the
 * `?code=` returned by Supabase for a session cookie, then redirects into the
 * app.
 *
 * WHY we read the user from exchangeCodeForSession()'s return value instead of
 * calling getUser() again: the session cookie written by the code exchange is
 * meant for the browser's NEXT request. Within this same request a second
 * getUser() reads the (still-empty) request cookie and returns null, silently
 * treating the request as unauthenticated. We pass the exchange result through
 * directly and do all DB work with the service-role (admin) client —
 * independent of the request's cookie state.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeInternalReturnTo(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user?.email) {
        await attributeReferral({
          code: readReferralCode(request),
          referredUserId: data.user.id,
          userCreatedAt: data.user.created_at,
          request
        }).catch((referralError) =>
          console.error("[callback] referral attribution failed", referralError)
        );
        const response = NextResponse.redirect(new URL(next, url.origin));
        response.cookies.delete(REFERRAL_COOKIE);
        return response;
      }
    }
  }

  // Anything went wrong → back to login with a flag.
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}

function readLocaleCookie(request: Request): "zh" | "en" {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)finfold-locale=(zh|en)/);
  return match?.[1] === "en" ? "en" : "zh";
}
