
import { NextResponse } from "next/server";
import { sendRawPrompt } from "@/lib/llm";
import { getPlatform } from "@/lib/platforms";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";

function buildPolishPrompt(platformLabel: string, body: string): string {
  return `You are a copy editor polishing an already-good social media post for ${platformLabel}. Improve clarity, rhythm, and punch WITHOUT changing the meaning, facts, structure, or length category. Keep the same language (Chinese stays Chinese, English stays English). Do not add hashtags, emojis, or a CTA that isn't already there. Return ONLY the polished body text — no commentary, no markdown fences, no quotes around it.

=== ORIGINAL ===
${body}`;
}

/**
 * One-click LLM polish pass on a single output's body (Pro+ feature — see
 * plan §4/§5). This is the "real LLM feature" that makes the quality-score
 * panel's rule-based checks feel less like a toy: instead of just flagging
 * issues, Polish actually asks a model to fix them, cheaply (~$0.002/call).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Polish is not available in this environment." }, { status: 503 });
    }

    const [{ data: profile }, { data: subscriptions }] = await Promise.all([
      admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      admin
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

    if (!getPlanFeatures(effectivePlan).polish) {
      return NextResponse.json(
        { error: "Polish 需要 Pro 及以上套餐。(Polish requires the Pro plan or above.)" },
        { status: 403 }
      );
    }

    const { data: existing, error: fetchError } = await admin
      .from("kit_outputs")
      .select("id, platform, body, final_body")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[outputs/polish] fetch failed:", JSON.stringify(fetchError));
      throw new Error("Failed to load the output to polish.");
    }
    if (!existing) {
      return NextResponse.json({ error: "Output not found." }, { status: 404 });
    }

    const currentBody = existing.final_body ?? existing.body;
    const platform = getPlatform(existing.platform);
    await ensurePlanCredits(userId, effectivePlan);
    const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
    const billing = createAiUsageBilling({
      operationKey: `output-polish:${userId}:${outputId}:${requestId}`,
      userId,
      action: "aiScoreOptimize",
      cost: ACTION_CREDITS.aiScoreOptimize,
      source: "output_polish",
      detail: {
        kitId,
        outputId,
        requestId,
        inputFingerprint: await hashGenerationRequest({ kitId, outputId, currentBody })
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This polish request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    let outputPersisted = false;
    try {
      const polished = (await sendRawPrompt(buildPolishPrompt(platform.label, currentBody))).trim();
      if (!polished) {
        throw new Error("Polish returned an empty result.");
      }

      const { error: updateError } = await admin
        .from("kit_outputs")
        .update({ final_body: polished, user_edited: true, updated_at: new Date().toISOString() })
        .eq("id", outputId)
        .eq("kit_id", kitId)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[outputs/polish] update failed:", JSON.stringify(updateError));
        throw new Error("Failed to save the polished text.");
      }

      await admin.from("output_edits").insert({
        output_id: outputId,
        user_id: userId,
        field: "body",
        before_text: currentBody,
        after_text: polished
      });

      outputPersisted = true;
      await billing.settle();
      return NextResponse.json({ finalBody: polished });
    } catch (error) {
      if (!outputPersisted) await billing.refund("output_polish_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to use Polish." }, { status: 401 });
    }

    console.error("[outputs/polish] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to polish this output." },
      { status: 400 }
    );
  }
}
