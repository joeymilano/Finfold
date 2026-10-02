import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  syncTrendSources,
  TrendCollectionUnavailableError
} from "@/lib/trends/service";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_TREND_SECRET || process.env.CRON_WATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Trend synchronization is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const report = await syncTrendSources(admin, undefined, { trigger: "scheduled" });
    return NextResponse.json({ report });
  } catch (error) {
    console.error("[opportunity-radar] trend sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trend synchronization failed." },
      { status: error instanceof TrendCollectionUnavailableError ? 503 : 500 }
    );
  }
}
