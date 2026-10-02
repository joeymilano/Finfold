
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest } from "@/lib/generation-runs";
import { distillStyleRule, mergeLearnedStyle } from "@/lib/style-learning";
import { logMemoryEvent } from "@/lib/memory-events";
import { markGrowthMissionPosted } from "@/lib/agent/growth-missions";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import type { PlatformId } from "@/lib/platforms";
import { mergeApprovedExample } from "@/lib/output-feedback";
import type { MemoryReceiptItem } from "@/lib/memory-receipt";
import {
  resolvePerformanceBackfillPlan,
  type PerformanceBackfillPlan
} from "@/lib/performance-backfill-plan";
import { isAllowedPlatformUrl, isPollablePlatform } from "@/lib/performance-platforms";
import { operatingPlatformSchema } from "@/lib/operations/program";
import { reconcileOperatingTaskAfterPublication } from "@/lib/operations/weekly-tasks";
import { outputImageSourceSchema, requiresImageRightsConfirmation } from "@/lib/source-image";

const editRequestSchema = z.object({
  body: z.string().min(1).optional(),
  summary: z.string().max(240).optional(),
  title: z.string().min(1).optional(),
  cta: z.string().min(1).optional(),
  publishStatus: z.enum(["draft", "planned", "posted", "measured", "iterated"]).optional(),
  publishedUrl: z.string().url().optional().or(z.literal(""))
});

/**
 * Edits a single generated output. Outputs were previously read-only —
 * copy the AI draft verbatim or discard it — so this is what makes a kit a
 * living draft instead of a one-shot artifact (plan §2 item 4).
 *
 * Every changed field is also appended to `output_edits` (migration 015) as
 * a before/after pair — raw material for a future style-learning loop, not
 * consumed by anything yet.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;

    const body = await request.json();
    const input = editRequestSchema.parse(body);

    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Editing is not available in this environment." }, { status: 503 });
    }

    // Fetch the current row first: (a) to scope-check it belongs to this
    // user + kit before writing anything, and (b) to diff before/after
    // text for the output_edits log.
    const { data: existing, error: fetchError } = await supabase
      .from("kit_outputs")
      .select("id, kit_id, user_id, platform, title, body, summary, cta, final_body, publish_status, published_url, image_source")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[kits/outputs] fetch failed:", JSON.stringify(fetchError));
      throw new Error("Failed to load the output to edit.");
    }
    if (!existing) {
      return NextResponse.json({ error: "Output not found." }, { status: 404 });
    }
    const existingImageSource = outputImageSourceSchema.safeParse(existing.image_source);
    if (input.publishStatus === "posted" && existingImageSource.success && requiresImageRightsConfirmation(existingImageSource.data)) {
      return NextResponse.json({
        error: "Confirm that you have the right to use the selected source image before publishing.",
        code: "image_rights_confirmation_required"
      }, { status: 409 });
    }
    if (
      input.publishedUrl
      && isPollablePlatform(existing.platform)
      && !isAllowedPlatformUrl(existing.platform, input.publishedUrl)
    ) {
      return NextResponse.json(
        { error: "The published URL does not match this platform." },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const editLogRows: Array<{ output_id: string; user_id: string; field: string; before_text: string; after_text: string }> = [];

    if (input.body !== undefined && input.body !== (existing.final_body ?? existing.body)) {
      editLogRows.push({
        output_id: outputId,
        user_id: userId,
        field: "body",
        before_text: existing.final_body ?? existing.body,
        after_text: input.body
      });
      update.final_body = input.body;
      update.user_edited = true;
    }
    if (input.title !== undefined && input.title !== existing.title) {
      editLogRows.push({ output_id: outputId, user_id: userId, field: "title", before_text: existing.title, after_text: input.title });
      update.title = input.title;
      update.user_edited = true;
    }
    if (input.cta !== undefined && input.cta !== existing.cta) {
      editLogRows.push({ output_id: outputId, user_id: userId, field: "cta", before_text: existing.cta, after_text: input.cta });
      update.cta = input.cta;
      update.user_edited = true;
    }
    if (input.summary !== undefined && input.summary !== (existing.summary ?? "")) {
      update.summary = input.summary || null;
      update.user_edited = true;
    }
    if (input.publishStatus !== undefined) {
      update.publish_status = input.publishStatus;
      if (input.publishStatus === "posted") {
        update.published_at = new Date().toISOString();
      }
    }
    if (input.publishedUrl !== undefined) {
      update.published_url = input.publishedUrl || null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("kit_outputs")
      .update(update)
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .select("id, platform, title, body, summary, cta, notes, strategy, locked, publish_status, image_url, image_source, image_prompt, final_body, user_edited, published_url, published_at, updated_at")
      .maybeSingle();

    if (updateError) {
      console.error("[kits/outputs] update failed:", JSON.stringify(updateError));
      throw new Error("Failed to save your edit. Please try again.");
    }
    if (!updated) {
      return NextResponse.json({ error: "Output was not updated. Please reload and try again." }, { status: 409 });
    }

    if (editLogRows.length > 0) {
      const { error: logError } = await supabase.from("output_edits").insert(editLogRows);
      if (logError) {
        // Non-critical — the edit itself is saved; just log it.
        console.error("[kits/outputs] output_edits insert failed:", JSON.stringify(logError));
      }
    }

    const approvedContentChanged = editLogRows.length > 0 || Object.hasOwn(update, "summary");
    if (approvedContentChanged) {
      const { error: invalidateError } = await supabase
        .from("wechat_publication_jobs")
        .update({
          status: "needs_reapproval",
          lease_token: null,
          lease_expires_at: null,
          error_code: "content_changed_after_approval",
          error_message: "The approved output changed and must be confirmed again.",
          updated_at: new Date().toISOString()
        })
        .eq("output_id", outputId)
        .eq("user_id", userId)
        .eq("mode", "scheduled_publish")
        .in("status", ["scheduled", "preparing", "draft_ready"]);
      if (invalidateError && !/wechat_publication_jobs|schema cache/i.test(invalidateError.message ?? "")) {
        console.error("[kits/outputs] WeChat publication invalidation failed:", JSON.stringify(invalidateError));
      }
    }

    // Distill the body edit into a persistent style rule (Growth+ only —
    // see plan §4 "编辑回路"). This runs AFTER the edit is already saved
    // above, so a distillation failure never blocks or errors the save
    // the user is actually waiting on.
    const memoryReceipt: MemoryReceiptItem[] = [];
    const bodyEdit = editLogRows.find((row) => row.field === "body");
    if (bodyEdit) {
      const learnedStyle = await maybeDistillStyle(supabase, userId, bodyEdit.before_text, bodyEdit.after_text, { kitId, outputId });
      if (learnedStyle) memoryReceipt.push(learnedStyle);
    }

    let growthMissionId: string | null = null;
    if (input.publishStatus === "posted") {
      if (!new Set(["posted", "measured", "iterated"]).has(existing.publish_status ?? "draft")) {
        const publishedMemory = await maybeLearnPublishedExample(supabase, userId, {
          kitId,
          outputId,
          platform: updated.platform as PlatformId,
          content: String(updated.final_body || updated.body)
        });
        if (publishedMemory) memoryReceipt.push(publishedMemory);
      }

      try {
        const { data: kit } = await supabase
          .from("content_kits")
          .select("growth_mission_id")
          .eq("id", kitId)
          .eq("user_id", userId)
          .maybeSingle();
        growthMissionId = kit?.growth_mission_id ?? null;
        if (kit?.growth_mission_id) {
          await markGrowthMissionPosted(
            supabase,
            userId,
            kit.growth_mission_id,
            updated.platform as PlatformId
          );
        }
      } catch (error) {
        // Publishing the output remains successful. The mission keeps its
        // content_kits link and can be reconciled when metrics arrive.
        console.error("[kits/outputs] Growth Mission publish transition failed:", error);
      }

      const operatingPlatform = operatingPlatformSchema.safeParse(updated.platform);
      if (operatingPlatform.success) {
        try {
          await reconcileOperatingTaskAfterPublication(
            supabase,
            userId,
            operatingPlatform.data,
            outputId,
            new Date(updated.published_at ?? Date.now())
          );
        } catch (error) {
          // The publication is already durable and remains the source of
          // truth. The queue endpoint and scheduled patrol reconcile this
          // idempotently instead of asking the user to mark a task complete.
          console.error("[kits/outputs] Operating cadence reconciliation failed:", error);
        }
      }

      try {
        await advancePatrolAfterEvent(supabase, userId, {
          type: "output_posted",
          kitId,
          outputId,
          platform: String(updated.platform),
          publishedAt: updated.published_at ?? undefined,
          missionId: growthMissionId
        });
      } catch (error) {
        console.error("[kits/outputs] Agent patrol advancement failed:", error);
      }
    }

    let performanceBackfill: PerformanceBackfillPlan | null = null;
    const isPublishedNow = new Set(["posted", "measured", "iterated"]).has(
      String(updated.publish_status ?? "draft")
    );
    if (isPublishedNow && (input.publishStatus === "posted" || input.publishedUrl !== undefined)) {
      try {
        performanceBackfill = await resolvePerformanceBackfillPlan(
          supabase,
          userId,
          updated.platform as PlatformId,
          updated.published_url
        );
      } catch (error) {
        console.error("[kits/outputs] Performance backfill status failed:", error);
        performanceBackfill = { mode: "needs_setup", reason: "status_unavailable" };
      }
    }

    return NextResponse.json({
      output: {
        id: updated.id,
        platform: updated.platform,
        title: updated.title,
        body: updated.body,
        summary: updated.summary ?? undefined,
        cta: updated.cta,
        notes: updated.notes,
        strategy: updated.strategy,
        locked: updated.locked ?? false,
        publishStatus: updated.publish_status ?? "draft",
        imageUrl: updated.image_url ?? "",
        imageSource: outputImageSourceSchema.safeParse(updated.image_source).data,
        imagePrompt: updated.image_prompt ?? "",
        finalBody: updated.final_body ?? undefined,
        userEdited: updated.user_edited ?? false,
        publishedUrl: updated.published_url ?? "",
        publishedAt: updated.published_at ?? undefined,
        updatedAt: updated.updated_at ?? undefined
      },
      memoryReceipt,
      performanceBackfill
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to edit content." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save your edit." },
      { status: 400 }
    );
  }
}

/**
 * Gates on the Growth+ styleLearning feature, runs the LLM distillation
 * pass, and merges the result into brand_brains.learned_style. All
 * failures are logged and swallowed — see the call site's comment for why.
 */
async function maybeDistillStyle(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  before: string,
  after: string,
  source: { kitId: string; outputId: string }
): Promise<MemoryReceiptItem | null> {
  try {
    const [{ data: profile }, { data: subscriptions }] = await Promise.all([
      supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false })
    ]);

    const activeSubscription = getActiveSubscription(
      (subscriptions ?? []).map((subscription) => ({
        status: String(subscription.status ?? ""),
        currentPeriodEnd: subscription.current_period_end
      }))
    );
    const effectivePlan = resolveEffectivePlan(profile?.plan, activeSubscription);
    if (!getPlanFeatures(effectivePlan).styleLearning) {
      return null;
    }

    await ensurePlanCredits(userId, effectivePlan);
    const inputFingerprint = await hashGenerationRequest({ outputId: source.outputId, before, after });
    const billing = createAiUsageBilling({
      operationKey: `style-distill:${userId}:${source.outputId}:${inputFingerprint}`,
      userId,
      action: "brandVoiceAnalysis",
      cost: ACTION_CREDITS.brandVoiceAnalysis,
      source: "style_learning",
      detail: {
        kitId: source.kitId,
        outputId: source.outputId,
        inputFingerprint
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome !== "authorized") return null;

    let resultReady = false;
    let rule: string | null;
    try {
      rule = await distillStyleRule(before, after);
      resultReady = true;
      await billing.settle();
    } catch (error) {
      if (!resultReady) await billing.refund("style_learning_failed").catch(() => undefined);
      throw error;
    }
    if (!rule) {
      return null;
    }

    const { data: brain } = await supabase
      .from("brand_brains")
      .select("learned_style")
      .eq("user_id", userId)
      .maybeSingle();

    const existingRules: string[] = Array.isArray(brain?.learned_style) ? brain.learned_style : [];
    const isNewRule = !existingRules.some((existingRule) => existingRule.toLocaleLowerCase() === rule.toLocaleLowerCase());
    const merged = mergeLearnedStyle(existingRules, rule);

    const { error: upsertError } = await supabase
      .from("brand_brains")
      .upsert({ user_id: userId, learned_style: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upsertError) {
      console.error("[kits/outputs] learned_style upsert failed:", JSON.stringify(upsertError));
      return null;
    }
    if (!isNewRule) return null;

    await logMemoryEvent(userId, "style_rule", rule, { kitId: source.kitId, outputId: source.outputId });
    return { kind: "style_rule", source: "edit", value: rule, outputId: source.outputId };
  } catch (error) {
    console.error("[kits/outputs] style distillation failed:", error);
    return null;
  }
}

async function maybeLearnPublishedExample(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  source: { kitId: string; outputId: string; platform: PlatformId; content: string }
): Promise<MemoryReceiptItem | null> {
  try {
    const currentExample = source.content.trim().slice(0, 500);
    if (!currentExample) return null;

    const { data: brain, error: brainError } = await supabase
      .from("brand_brains")
      .select("approved_examples")
      .eq("user_id", userId)
      .maybeSingle();
    if (brainError) throw brainError;

    const existingExamples: string[] = Array.isArray(brain?.approved_examples) ? brain.approved_examples : [];
    const alreadyLearned = existingExamples.some(
      (example) => example.trim().toLocaleLowerCase() === currentExample.toLocaleLowerCase()
    );
    if (alreadyLearned) return null;

    const approvedExamples = mergeApprovedExample(existingExamples, currentExample);
    const { error: upsertError } = await supabase.from("brand_brains").upsert({
      user_id: userId,
      approved_examples: approvedExamples,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    await logMemoryEvent(userId, "approved_example", currentExample, {
      kitId: source.kitId,
      outputId: source.outputId
    });
    return {
      kind: "approved_example",
      source: "publish",
      value: currentExample,
      outputId: source.outputId,
      platform: source.platform
    };
  } catch (error) {
    // The publish itself is already durable. Memory is an additive layer and
    // must never turn a successful workflow completion into a failure.
    console.error("[kits/outputs] published example learning failed:", error);
    return null;
  }
}
