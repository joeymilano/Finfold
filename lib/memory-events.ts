import { createSupabaseAdminClient } from "@/lib/supabase";

export type MemoryEventType =
  | "style_rule"
  | "negative_rule"
  | "performance_rule"
  | "approved_example"
  | "feedback_rule"
  | "context_field";

/**
 * Appends one row to brand_memory_events (migration 041). This is the
 * write side of the memory ledger: every place that merges a rule into
 * brand_brains' learned_style/learned_negative/performance_rules/
 * approved_examples arrays should also call this so the brand-memory page
 * can render WHEN each rule was learned and WHAT taught it, not just the
 * current array snapshot.
 *
 * Always best-effort: a logging failure must never block the caller's
 * actual save (the merged array write to brand_brains), so this swallows
 * its own errors after logging them.
 */
export async function logMemoryEvent(
  userId: string,
  eventType: MemoryEventType,
  ruleText: string,
  source?: { kitId?: string; outputId?: string }
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) return;

    const { error } = await admin.from("brand_memory_events").insert({
      user_id: userId,
      event_type: eventType,
      rule_text: ruleText,
      source_kit_id: source?.kitId ?? null,
      source_output_id: source?.outputId ?? null
    });
    if (error) {
      console.error("[memory-events] insert failed:", JSON.stringify(error));
    }
  } catch (error) {
    console.error("[memory-events] insert threw:", error);
  }
}
