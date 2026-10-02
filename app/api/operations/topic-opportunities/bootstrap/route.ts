import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import {
  syncTrendSources,
  TrendCollectionUnavailableError
} from "@/lib/trends/service";

const RATE_LIMIT = {
  scope: "opportunity-radar:bootstrap",
  limit: 3,
  windowMs: 30 * 60_000
};

export const maxDuration = 60;

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, RATE_LIMIT);
  if (rateLimited) return rateLimited;

  const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "zh";
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({
        error: locale === "en" ? "Live collection is not configured." : "真实信号采集尚未配置。"
      }, { status: 503 });
    }

    const report = await syncTrendSources(admin, undefined, {
      trigger: "bootstrap",
      requestedBy: userId,
      minIntervalMs: 5 * 60_000
    });
    return NextResponse.json({ report }, {
      status: report.skipped === "in_progress" ? 202 : 200
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({
        error: locale === "en" ? "Log in to collect live signals." : "登录后才能采集真实信号。"
      }, { status: 401 });
    }
    if (isMissingCollectionSchema(error)) {
      return NextResponse.json({
        error: locale === "en" ? "Live collection requires database migration 098." : "真实信号采集需要先应用数据库迁移 098。"
      }, { status: 503 });
    }
    if (error instanceof TrendCollectionUnavailableError) {
      return NextResponse.json({
        error: locale === "en"
          ? "Live signal sources are temporarily unavailable. Try again shortly."
          : "真实信号来源暂时不可用，请稍后重新采集。"
      }, { status: 503 });
    }
    console.error("[opportunity-radar] bootstrap failed:", error);
    return NextResponse.json({
      error: locale === "en" ? "Live collection failed. Try again." : "真实信号采集失败，请重试。"
    }, { status: 500 });
  }
}

function isMissingCollectionSchema(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ["42P01", "PGRST202", "PGRST205"].includes(String((error as { code: unknown }).code));
}
