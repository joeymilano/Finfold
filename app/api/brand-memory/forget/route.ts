import { NextResponse } from "next/server";
import { z } from "zod";
import { feedbackReasonSchema, type FeedbackReason } from "@/lib/output-feedback";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const forgetItemSchema = z.object({
  kind: z.enum(["style_rule", "approved_example", "feedback_rule"]),
  source: z.enum(["edit", "feedback", "publish"]),
  value: z.string().trim().min(1).max(1000),
  outputId: z.string().uuid(),
  reasonCode: feedbackReasonSchema.optional()
}).superRefine((item, context) => {
  if (item.kind === "feedback_rule" && !item.reasonCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCode"],
      message: "A feedback reason is required to forget this rule."
    });
  }
});

const forgetRequestSchema = z.object({
  items: z.array(forgetItemSchema).min(1).max(3)
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = forgetRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Brand Memory is not available in this environment." }, { status: 503 });
    }

    const outputIds = [...new Set(input.items.map((item) => item.outputId))];
    const { data: ownedOutputs, error: ownershipError } = await admin
      .from("kit_outputs")
      .select("id")
      .eq("user_id", userId)
      .in("id", outputIds);
    if (ownershipError) throw ownershipError;
    if ((ownedOutputs ?? []).length !== outputIds.length) {
      return NextResponse.json({ error: "The memory source could not be verified." }, { status: 404 });
    }

    const { data: brain, error: brainError } = await admin
      .from("brand_brains")
      .select("learned_style, learned_negative, approved_examples")
      .eq("user_id", userId)
      .maybeSingle();
    if (brainError) throw brainError;
    if (!brain) return NextResponse.json({ forgotten: true, count: input.items.length });

    // Feedback rules are derived from output_feedback. Remove their source
    // reasons first, otherwise a later vote would reconstruct a memory the
    // user explicitly asked Finfold to forget.
    const feedbackItems = input.items.filter((item) => item.kind === "feedback_rule");
    if (feedbackItems.length > 0) {
      const feedbackOutputIds = [...new Set(feedbackItems.map((item) => item.outputId))];
      const { data: feedbackRows, error: feedbackError } = await admin
        .from("output_feedback")
        .select("output_id, reason_codes")
        .eq("user_id", userId)
        .in("output_id", feedbackOutputIds);
      if (feedbackError) throw feedbackError;

      for (const row of feedbackRows ?? []) {
        const reasonsToForget = new Set<FeedbackReason>(
          feedbackItems
            .filter((item) => item.outputId === row.output_id)
            .map((item) => item.reasonCode)
            .filter((reason): reason is FeedbackReason => Boolean(reason))
        );
        const nextReasons = ((row.reason_codes ?? []) as FeedbackReason[]).filter((reason) => !reasonsToForget.has(reason));

        const result = nextReasons.length === 0
          ? await admin.from("output_feedback").delete().eq("user_id", userId).eq("output_id", row.output_id)
          : await admin.from("output_feedback").update({ reason_codes: nextReasons, updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("output_id", row.output_id);
        if (result.error) throw result.error;
      }
    }

    const styleValues = input.items.filter((item) => item.kind === "style_rule").map((item) => item.value);
    const negativeValues = input.items.filter((item) => item.kind === "feedback_rule").map((item) => item.value);
    const exampleValues = input.items.filter((item) => item.kind === "approved_example").map((item) => item.value);

    const { error: updateError } = await admin.from("brand_brains").update({
      learned_style: removeExact(brain.learned_style, styleValues),
      learned_negative: removeExact(brain.learned_negative, negativeValues),
      approved_examples: removeExact(brain.approved_examples, exampleValues),
      updated_at: new Date().toISOString()
    }).eq("user_id", userId);
    if (updateError) throw updateError;

    // The ledger mirrors active memory. Remove the matching source events so
    // a future memory-history UI cannot present a forgotten rule as active.
    await Promise.all(input.items.map(async (item) => {
      const { error } = await admin
        .from("brand_memory_events")
        .delete()
        .eq("user_id", userId)
        .eq("event_type", item.kind)
        .eq("rule_text", item.value)
        .eq("source_output_id", item.outputId);
      if (error) console.error("[brand-memory/forget] ledger cleanup failed:", JSON.stringify(error));
    }));

    return NextResponse.json({ forgotten: true, count: input.items.length });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to change Brand Memory." }, { status: 401 });
    }
    console.error("[brand-memory/forget] request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to forget this memory." },
      { status: 400 }
    );
  }
}

function removeExact(value: unknown, removals: string[]): string[] {
  const normalized = new Set(removals.map((item) => item.trim().toLocaleLowerCase()));
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => (
    typeof item === "string" && !normalized.has(item.trim().toLocaleLowerCase())
  ));
}
