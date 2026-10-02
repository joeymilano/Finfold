import { NextResponse } from "next/server";
import {
  isValidReferralCode,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE
} from "@/lib/referrals";
import { captureServerEvent } from "@/lib/posthog-server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";


type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: RouteContext) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "referrals:landing",
    limit: 120,
    windowMs: 60 * 60 * 1000
  });
  if (rateLimited) return rateLimited;

  const { code } = await context.params;
  const url = new URL(request.url);
  if (!(await isValidReferralCode(code))) {
    return NextResponse.redirect(new URL("/signup?referral=invalid", url.origin));
  }

  const response = NextResponse.redirect(new URL("/signup?referral=1", url.origin));
  response.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE
  });
  await captureServerEvent(`referral:${code}`, "referral_landing_viewed");
  return response;
}
