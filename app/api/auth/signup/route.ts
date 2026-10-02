
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { analyzePassword } from "@/lib/password-policy";
import { attributeReferral, readReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";
import { mapSignupError } from "@/lib/signup-error";
import {
  NATIVE_VISITOR_COOKIE,
  recordNativeSignupOutcome
} from "@/lib/native-outcome-attribution";

/**
 * POST /api/auth/signup
 *
 * Register a new user with email and password.
 * The Supabase server client handles session cookie management,
 * so the secret key is never exposed to the browser.
 *
 * Expected body: { email: string, password: string }
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, { scope: "auth:signup", limit: 5, windowMs: 60 * 60 * 1000 });
  if (rateLimited) return NextResponse.json(
    { error: "Too many signup attempts. Please wait or use Google / GitHub.", code: "auth_request_rate_limited", retryAfter: Number(rateLimited.headers.get("Retry-After") ?? 3600) },
    { status: 429, headers: { "Retry-After": rateLimited.headers.get("Retry-After") ?? "3600" } }
  );

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    intent?: "resend";
    email?: string;
    password?: string;
    next?: string;
    signupFlowId?: string;
    trafficClass?: "production" | "qa";
  };

  const isResend = body.intent === "resend";
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!email || (!isResend && !password)) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  // 密码强度硬校验（与前端共享同一策略，防绕过）
  const pwdResult = analyzePassword(password ?? "");
  if (!isResend && !pwdResult.valid) {
    return NextResponse.json(
      { error: pwdResult.messageEn || "Password does not meet requirements." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  if (isResend) {
    const { error } = await supabase.auth.resend({
      type: "signup", email,
      options: { emailRedirectTo: getAuthCallbackUrl(request, undefined, body.next, {
        mode: "signup", method: "email", signupFlowId: body.signupFlowId, trafficClass: body.trafficClass
      }) }
    });
    if (error) return signupErrorResponse(error);
    // Same response for known and unknown addresses; never reveal account existence.
    return NextResponse.json({ needsConfirmation: true, retryAfter: 60 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: password!,
    options: {
      emailRedirectTo: getAuthCallbackUrl(request, undefined, body.next, {
        mode: "signup",
        method: "email",
        signupFlowId: body.signupFlowId,
        trafficClass: body.trafficClass
      }),
      data: {
        plan: "free",
      },
    },
  });

  if (error) {
    return signupErrorResponse(error);
  }

  // Check if email confirmation is required
  const needsConfirmation = !data.session && data.user && !data.user.confirmed_at;

  let clearNativeVisitorCookie = false;
  if (data.user) {
    await attributeReferral({
      code: readReferralCode(request),
      referredUserId: data.user.id,
      userCreatedAt: data.user.created_at,
      request
    }).catch((referralError) =>
      console.error("[signup] referral attribution failed", referralError)
    );

    // Supabase deliberately returns an obfuscated user with no identities for
    // duplicate email signups. Do not turn that anti-enumeration response into
    // a second commercial signup outcome.
    const createdNewEmailUser = data.user.identities?.length !== 0;
    if (createdNewEmailUser && !needsConfirmation && body.trafficClass !== "qa") {
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
          // Account creation must not fail because attribution is temporarily
          // unavailable. Keeping the cookie lets the confirmation callback retry.
          console.error("[signup] native outcome attribution failed", outcomeError);
        }
      }
    }
  }

  const response = NextResponse.json({
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
    session: data.session
      ? {
          access_token: data.session.access_token,
        }
      : null,
    needsConfirmation,
  });
  response.cookies.delete(REFERRAL_COOKIE);
  if (clearNativeVisitorCookie) response.cookies.delete(NATIVE_VISITOR_COOKIE);
  return response;
}

function signupErrorResponse(error: { message?: string; code?: string }) {
  const mapped = mapSignupError(error);
  // Provider quotas are distinct from invalid input. Do not log email/password.
  console.warn("[auth:signup] request rejected", { code: mapped.code ?? "signup_rejected", provider_code: error.code ?? "unknown", status: mapped.status });
  return NextResponse.json(
    { error: mapped.error, code: mapped.code, ...(mapped.status === 429 ? { retryAfter: 60 } : {}) },
    { status: mapped.status, ...(mapped.status === 429 ? { headers: { "Retry-After": "60" } } : {}) }
  );
}
