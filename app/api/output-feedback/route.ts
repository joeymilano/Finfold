
import { NextResponse } from "next/server";
import {
  feedbackRule,
  mergeApprovedExample,
  mergeFeedbackRules,
  outputFeedbackRequestSchema
} from "@/lib/output-feedback";
import { getPlatform } from "@/lib/platforms";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { logMemoryEvent } from "@/lib/memory-events";
import type { MemoryReceiptItem } from "@/lib/memory-receipt";
import type { PlatformId } from "@/lib/platforms";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const kitId = new URL(request.url).searchParams.get("kitId");
    if (!kitId) return NextResponse.json({ error: "kitId is required." }, { status: 400 });

    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Feedback is not available in this environment." }, { status: 503 });

    const { data, error } = await admin
      .from("output_feedback")
      .select("output_id, rating, reason_codes, note, updated_at")
      .eq("kit_id", kitId)
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({
      feedback: (data ?? []).map((row) => ({
        outputId: row.output_id,
        rating: row.rating,
        reasonCodes: row.reason_codes ?? [],
        note: row.note ?? "",
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    return feedbackError(error, "Failed to load output feedback.");
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = outputFeedbackRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Feedback is not available in this environment." }, { status: 503 });

    const { data: output, error: outputError } = await admin
      .from("kit_outputs")
      .select("id, kit_id, user_id, platform, body, final_body")
      .eq("id", input.outputId)
      .eq("kit_id", input.kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (outputError) throw outputError;
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    const now = new Date().toISOString();
    const { error: feedbackError } = await admin.from("output_feedback").upsert({
      output_id: output.id,
      kit_id: output.kit_id,
      user_id: userId,
      platform: output.platform,
      rating: input.rating,
      reason_codes: input.rating === "helpful" ? [] : input.reasonCodes,
      note: input.note || null,
      updated_at: now
    }, { onConflict: "output_id,user_id" });
    if (feedbackError) throw feedbackError;

    const { data: brain, error: brainError } = await admin
      .from("brand_brains")
      .select("approved_examples, learned_negative")
      .eq("user_id", userId)
      .maybeSingle();
    if (brainError) throw brainError;

    // Rebuild explicit-feedback rules from the current feedback table each
    // time. This makes changing a vote reversible: stale reasons disappear
    // instead of permanently contaminating the user's prompt memory.
    const { data: allFeedback, error: allFeedbackError } = await admin
      .from("output_feedback")
      .select("platform, rating, reason_codes")
      .eq("user_id", userId);
    if (allFeedbackError) throw allFeedbackError;

    const retainedNegative = (Array.isArray(brain?.learned_negative) ? brain.learned_negative : [])
      .filter((rule: string) => !rule.startsWith("[Explicit feedback]"));
    const explicitRules = (allFeedback ?? []).flatMap((item) => item.rating === "unhelpful"
      ? (item.reason_codes ?? []).map((reason: Parameters<typeof feedbackRule>[1]) => feedbackRule(getPlatform(item.platform).label, reason))
      : []);
    const learnedNegative = mergeFeedbackRules(retainedNegative, explicitRules);

    const currentExample = String(output.final_body || output.body).trim().slice(0, 500);
    const existingExamples: string[] = Array.isArray(brain?.approved_examples) ? brain.approved_examples : [];
    const approvedExamples = input.rating === "helpful"
      ? mergeApprovedExample(existingExamples, currentExample)
      : existingExamples.filter((example) => example.trim().toLocaleLowerCase() !== currentExample.toLocaleLowerCase());

    const { error: learningError } = await admin.from("brand_brains").upsert({
      user_id: userId,
      approved_examples: approvedExamples,
      learned_negative: learnedNegative,
      updated_at: now
    }, { onConflict: "user_id" });
    if (learningError) throw learningError;

    // learnedNegative is fully recomputed from all feedback rows every
    // call (not appended), so only log rules that weren't already present
    // before this write — otherwise every vote change would re-log every
    // standing explicit rule as a "new" memory event.
    const previousNegative = new Set(Array.isArray(brain?.learned_negative) ? brain.learned_negative : []);
    const newlyLearnedNegative = learnedNegative.filter((rule) => !previousNegative.has(rule));
    await Promise.all(newlyLearnedNegative.map((rule) => logMemoryEvent(userId, "feedback_rule", rule, { kitId: output.kit_id, outputId: output.id })));

    const memoryReceipt: MemoryReceiptItem[] = [];
    const addedApprovedExample = input.rating === "helpful"
      && !existingExamples.some((example) => example.trim().toLocaleLowerCase() === currentExample.toLocaleLowerCase())
      && approvedExamples.includes(currentExample);

    if (addedApprovedExample) {
      await logMemoryEvent(userId, "approved_example", currentExample, { kitId: output.kit_id, outputId: output.id });
      memoryReceipt.push({
        kind: "approved_example",
        source: "feedback",
        value: currentExample,
        outputId: output.id,
        platform: output.platform as PlatformId
      });
    }

    if (input.rating === "unhelpful") {
      const platformLabel = getPlatform(output.platform).label;
      for (const reasonCode of input.reasonCodes) {
        const rule = feedbackRule(platformLabel, reasonCode);
        if (!newlyLearnedNegative.includes(rule)) continue;
        memoryReceipt.push({
          kind: "feedback_rule",
          source: "feedback",
          value: rule,
          outputId: output.id,
          platform: output.platform as PlatformId,
          reasonCode
        });
      }
    }

    return NextResponse.json({
      feedback: {
        outputId: output.id,
        rating: input.rating,
        reasonCodes: input.rating === "helpful" ? [] : input.reasonCodes,
        note: input.note ?? "",
        updatedAt: now
      },
      learned: memoryReceipt.length > 0,
      memoryReceipt
    });
  } catch (error) {
    return feedbackError(error, "Failed to save output feedback.");
  }
}

function feedbackError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Please log in to share feedback." }, { status: 401 });
  }
  console.error("[output-feedback] request failed:", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}
