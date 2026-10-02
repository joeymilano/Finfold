import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getReferralSummary } from "@/lib/referrals";
import { getCurrentUserId } from "@/lib/supabase";


export async function GET(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "referrals:me",
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    return NextResponse.json(await getReferralSummary(userId, appUrl));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录。", "Please log in.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法加载推荐信息。", "Could not load referrals.") },
      { status: 500 }
    );
  }
}
