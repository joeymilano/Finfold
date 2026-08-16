
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { logMemoryEvent } from "@/lib/memory-events";

const MAX_PERFORMANCE_RULES = 5;

const adoptRequestSchema = z.object({
  reportId: z.string(),
  actionText: z.string().min(1).max(200)
});

/**
 * Lets a user turn one nextAction from an iteration report (lib/iteration-
 * report.ts / app/api/iterate/route.ts) into a standing brand_brains rule
 * that future generations read back (lib/brand-brain.ts
 * buildBrainPromptSection's "Performance Rules" section). Deliberately
 * human-in-the-loop, unlike learned_style/learned_negative which are
 * fully automatic — a report's nextAction is a suggestion, and the user
 * decides whether it's actually worth encoding as a rule.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { reportId, actionText } = adoptRequestSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Adopting rules is not available in this environment." }, { status: 503 });
    }

    const { data: report, error: reportError } = await supabase
      .from("iteration_reports")
      .select("id, user_id, kit_id, next_actions")
      .eq("id", reportId)
      .eq("user_id", userId)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    // The action text must actually be one of this report's own
    // nextActions — otherwise a crafted request could inject arbitrary
    // text into the generation prompt via performance_rules.
    const validActions: string[] = Array.isArray(report.next_actions) ? report.next_actions : [];
    if (!validActions.includes(actionText)) {
      return NextResponse.json({ error: "That action does not belong to this report." }, { status: 400 });
    }

    const { data: brain } = await supabase
      .from("brand_brains")
      .select("performance_rules")
      .eq("user_id", userId)
      .maybeSingle();

    const existingRules: string[] = Array.isArray(brain?.performance_rules) ? brain.performance_rules : [];
    const withoutDuplicate = existingRules.filter((rule) => rule.toLowerCase() !== actionText.toLowerCase());
    const merged = [...withoutDuplicate, actionText].slice(-MAX_PERFORMANCE_RULES);

    const { error: upsertError } = await supabase
      .from("brand_brains")
      .upsert({ user_id: userId, performance_rules: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    await logMemoryEvent(userId, "performance_rule", actionText, { kitId: report.kit_id ?? undefined });

    return NextResponse.json({ performanceRules: merged });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to adopt this rule." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to adopt this rule." },
      { status: 400 }
    );
  }
}
