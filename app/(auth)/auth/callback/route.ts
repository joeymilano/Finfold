
import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { sendFounderWelcome, type FounderLocale } from "@/lib/founder-email";
import { attributeReferral, readReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";
import { buildAuthHref, sanitizeInternalReturnTo } from "@/lib/auth-return";
import { captureServerEvent } from "@/lib/posthog-server";
import { normalizeSignupFlowId, normalizeTrafficClass } from "@/lib/auth-callback-url";
import {
  NATIVE_VISITOR_COOKIE,
  recordNativeSignupOutcome
} from "@/lib/native-outcome-attribution";

/**
 * GET /auth/callback
 *
 * Completes the email-confirmation AND OAuth (Google) flow: exchanges the
 * `?code=` returned by Supabase for a session cookie, then redirects into the
 * app.
 *
 * Side effect: on the user's FIRST successful confirmation/login we send the
 * "founder welcome email" (see lib/founder-email.ts). Repeat visits are skipped
 * via profiles.founder_email_sent_at, so OAuth re-logins never re-trigger it.
 *
 * WHY we read the user from exchangeCodeForSession()'s return value instead of
 * calling getUser() again: the session cookie written by the code exchange is
 * meant for the browser's NEXT request. Within this same request a second
 * getUser() reads the (still-empty) request cookie and returns null, silently
 * skipping the founder email. exchangeCodeForSession already hands us the
 * authenticated user, so we pass it through directly and do all DB work with
 * the service-role (admin) client — independent of the request's cookie state.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeInternalReturnTo(url.searchParams.get("next"));
  const authMode = url.searchParams.get("auth_mode") === "signup" ? "signup" : "login";
  const rawAuthMethod = url.searchParams.get("auth_method") ?? "unknown";
  const authMethod = /^[a-z0-9_-]{1,32}$/i.test(rawAuthMethod) ? rawAuthMethod.toLowerCase() : "unknown";
  const signupFlowId = normalizeSignupFlowId(url.searchParams.get("signup_flow_id"));
  const trafficClass = normalizeTrafficClass(url.searchParams.get("traffic_class"));

  // Recovery links ask the callback to land on /reset-password; flag it so the
  // failure redirect and side effects below stay password-recovery-specific.
  const isPasswordRecovery = next.startsWith("/reset-password");

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
        // First confirmation/login → send the founder welcome email.
        // Internal 8s cap inside sendFounderWelcome; never blocks the redirect.
        // Password recovery is never a "first login": skip it outright so a
        // user who never received the welcome can't get it mid-reset.
        if (!isPasswordRecovery) {
          await maybeSendFounderWelcome(request, data.user.id, data.user.email).catch((e) =>
            console.error("[callback] founder email error", e),
          );
        }
        const analyticsProperties = {
          auth_mode: authMode,
          auth_method: authMethod,
          return_to: next,
          completion_stage: "callback",
          account_was_new: authMethod === "email" || wasRecentlyCreated(data.user.created_at),
          ...(signupFlowId ? { signup_flow_id: signupFlowId } : {}),
          ...(trafficClass
            ? {
                traffic_class: trafficClass,
                is_test_traffic: trafficClass === "qa" ? "true" : "false"
              }
            : {})
        };
        const completedNewSignup = authMode === "signup" && analyticsProperties.account_was_new;
        await Promise.all([
          captureServerEvent(data.user.id, "auth_callback_completed", analyticsProperties),
          ...(completedNewSignup
            ? [captureServerEvent(data.user.id, "signup_completed", analyticsProperties)]
            : authMode === "signup"
              ? [captureServerEvent(data.user.id, "signup_existing_account_resumed", analyticsProperties)]
              : [])
        ]);
        let clearNativeVisitorCookie = false;
        if (completedNewSignup && trafficClass !== "qa") {
          const admin = createSupabaseAdminClient();
          if (admin) {
            try {
              await recordNativeSignupOutcome(admin, {
                request,
                subjectUserId: data.user.id,
                occurredAt: data.user.created_at
              });
              clearNativeVisitorCookie = true;
            } catch (outcomeError) {
              console.error("[callback] native outcome attribution failed", outcomeError);
            }
          }
        }
        const response = NextResponse.redirect(new URL(next, url.origin));
        response.cookies.delete(REFERRAL_COOKIE);
        if (clearNativeVisitorCookie) response.cookies.delete(NATIVE_VISITOR_COOKIE);
        return response;
      }
    }
  }

  // Anything went wrong → let the user retry without losing the original
  // product or ChatGPT authorization request they were completing. A failed
  // recovery exchange (expired / already-used link) retries from the email
  // request form instead — those users cannot sign in with the old password.
  const retryUrl = isPasswordRecovery
    ? new URL("/forgot-password", url.origin)
    : new URL(buildAuthHref("/login", next), url.origin);
  retryUrl.searchParams.set("error", isPasswordRecovery ? "expired" : "oauth");
  return NextResponse.redirect(retryUrl);
}

function wasRecentlyCreated(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= 10 * 60 * 1000;
}

/**
 * Send the founder welcome email iff this user has never received it.
 *
 * Takes userId + email straight from exchangeCodeForSession (no second
 * getUser() / cookie read). All lookups use the service-role admin client,
 * so this is fully independent of the request's session cookie state.
 *
 * De-dupe: profiles.founder_email_sent_at non-null → skip.
 * Locale resolution priority: profiles.locale → finfold-locale cookie → "zh".
 */
async function maybeSendFounderWelcome(
  request: Request,
  userId: string,
  email: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("locale, founder_email_sent_at")
    .eq("id", userId)
    .maybeSingle();

  // Already sent → never re-send (covers OAuth re-logins, repeated callback hits).
  if (profile?.founder_email_sent_at) return;

  const cookieLocale = readLocaleCookie(request);
  const locale: FounderLocale =
    profile?.locale === "en" ? "en" : profile?.locale === "zh" ? "zh" : cookieLocale;

  const ok = await sendFounderWelcome({ to: email, locale });
  if (ok) {
    await admin
      .from("profiles")
      .update({ founder_email_sent_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

function readLocaleCookie(request: Request): FounderLocale {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)finfold-locale=(zh|en)/);
  return match?.[1] === "en" ? "en" : "zh";
}
