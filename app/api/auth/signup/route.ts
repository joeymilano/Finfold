
import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { analyzePassword } from "@/lib/password-policy";
import { attributeReferral, readReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";
import { getAuthCallbackUrl } from "@/lib/auth-callback-url";
import { mapSignupError } from "@/lib/signup-error";

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
  if (rateLimited) return rateLimited;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    next?: string;
  };

  const email = body.email?.trim();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  // 密码强度硬校验（与前端共享同一策略，防绕过）
  const pwdResult = analyzePassword(password);
  if (!pwdResult.valid) {
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthCallbackUrl(request, undefined, body.next),
      data: {
        plan: "free",
      },
    },
  });

  if (error) {
    const mapped = mapSignupError(error);
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: mapped.status }
    );
  }

  // Check if email confirmation is required
  const needsConfirmation = !data.session && data.user && !data.user.confirmed_at;

  if (data.user) {
    await attributeReferral({
      code: readReferralCode(request),
      referredUserId: data.user.id,
      userCreatedAt: data.user.created_at,
      request
    }).catch((referralError) =>
      console.error("[signup] referral attribution failed", referralError)
    );
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
  return response;
}
