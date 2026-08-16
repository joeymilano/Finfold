
import { NextResponse } from "next/server";
import { platformIdSchema } from "@/lib/content-schema";
import { loadGrowthBriefing } from "@/lib/agent/growth-briefing";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Growth briefing requires Supabase to be configured." }, { status: 503 });
    }

    const params = new URL(request.url).searchParams;
    const locale = params.get("locale") === "en" ? "en" : "zh";
    const platformValue = params.get("platform");
    const parsedPlatform = platformValue ? platformIdSchema.safeParse(platformValue) : null;

    const briefing = await loadGrowthBriefing(
      admin,
      userId,
      locale,
      parsedPlatform?.success ? parsedPlatform.data : undefined
    );

    return NextResponse.json({ briefing });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view your growth briefing." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build growth briefing." },
      { status: 400 }
    );
  }
}
