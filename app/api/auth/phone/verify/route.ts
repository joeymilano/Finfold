
import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { attributeReferral, readReferralCode, REFERRAL_COOKIE } from "@/lib/referrals";

/**
 * POST /api/auth/phone/verify
 *
 * Verify the SMS one-time password and establish a session.
 * Calls Supabase `verifyOtp({ phone, token, type: "sms" })`; on success the
 * server client writes the session cookie, so the secret key is never exposed
 * to the browser — consistent with the email login/signup routes.
 *
 * Expected body: { phone: string, token: string }
 */
const E164 = /^\+[1-9]\d{6,14}$/;

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "auth:phone-verify",
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimited) return rateLimited;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    token?: string;
  };

  const phone = body.phone?.trim();
  const token = body.token?.trim();

  if (!phone || !E164.test(phone) || !token) {
    return NextResponse.json(
      { error: "Phone number and verification code are required." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid") || message.includes("expired") || message.includes("token") || message.includes("code")) {
      return NextResponse.json(
        { error: "Invalid or expired verification code." },
        { status: 401 },
      );
    }
    if (message.includes("too many")) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Verification failed." },
      { status: 400 },
    );
  }

  if (data.user) {
    await attributeReferral({
      code: readReferralCode(request),
      referredUserId: data.user.id,
      userCreatedAt: data.user.created_at,
      request
    }).catch((referralError) =>
      console.error("[phone-verify] referral attribution failed", referralError)
    );
  }

  const response = NextResponse.json({
    user: data.user
      ? {
          id: data.user.id,
          phone: data.user.phone,
        }
      : null,
  });
  response.cookies.delete(REFERRAL_COOKIE);
  return response;
}
