
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPublishCadence } from "@/lib/publish-cadence";
import { platformIdSchema } from "@/lib/content-schema";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode } from "@/lib/runtime-mode";

const querySchema = z.object({ platform: platformIdSchema });

/**
 * Advisory-only check: would marking a new post on this platform right now
 * exceed the platform's safe posting cadence (lib/publish-cadence.ts)? Read
 * before the "mark published" action in the workbench so a user sees the
 * risk BEFORE tripping a platform's own spam/风控 detector, not after.
 *
 * Looks at this user's own kit_outputs.published_at history for the
 * platform — the same timestamps PerformancePanel/OutputBoard already
 * write when marking an output posted, so no new tracking is introduced.
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { platform } = querySchema.parse({
      platform: new URL(request.url).searchParams.get("platform") ?? undefined
    });

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ warning: null });
      return NextResponse.json({ warning: null });
    }

    const { data, error } = await supabase
      .from("kit_outputs")
      .select("published_at")
      .eq("user_id", userId)
      .eq("platform", platform)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const timestamps = (data ?? [])
      .map((row) => row.published_at as string | null)
      .filter((value): value is string => Boolean(value));

    const warning = checkPublishCadence(platform, timestamps);
    return NextResponse.json({ warning });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ warning: null });
    }
    // Advisory feature — a lookup failure should never block the publish
    // flow, so degrade to "no warning" instead of surfacing an error.
    console.error("[publish-cadence] check failed:", error);
    return NextResponse.json({ warning: null });
  }
}
