
import { NextResponse } from "next/server";
import { platformIdSchema } from "@/lib/content-schema";
import { loadWeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Weekly growth reporting requires Supabase." }, { status: 503 });
    }
    const searchParams = new URL(request.url).searchParams;
    const locale = searchParams.get("locale") === "en" ? "en" : "zh";
    const platformInput = searchParams.get("platform");
    const platform = platformInput
      ? platformIdSchema.safeParse(platformInput)
      : null;
    if (platformInput && !platform?.success) {
      return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });
    }
    const report = await loadWeeklyGrowthReport(
      admin,
      userId,
      locale,
      platform?.success ? platform.data : undefined
    );
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view the weekly growth report." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build the weekly growth report." },
      { status: 400 }
    );
  }
}
