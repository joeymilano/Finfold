
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendRawPrompt } from "@/lib/llm";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { getPlatform } from "@/lib/platforms";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { buildBrainPromptSection } from "@/lib/brand-brain";
import { platformIdSchema } from "@/lib/content-schema";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import type { PlatformId } from "@/lib/platforms";
import { apiError } from "@/lib/i18n";

/**
 * Selection-level AI micro-edit (P0-2). The highest-frequency action on the
 * workbench is "select a sentence → tweak it", not regenerate a whole platform
 * or rewrite the whole body. This endpoint rewrites ONLY the selected snippet
 * (casual / shorter / hook / brand-voice), injected with the user's brand
 * voice + banned phrases, and returns any banned-phrase hits so the client can
 * flag them red. Rate-limited independently and charged as a small rewrite
 * operation rather than a full content-kit generation.
 */
const refineRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  platform: platformIdSchema,
  action: z.enum(["casual", "shorter", "hook", "brand-voice"]),
  context: z.string().max(4000).optional()
});

const ACTION_INSTRUCTIONS: Record<z.infer<typeof refineRequestSchema>["action"], string> = {
  casual: "Make it more conversational and casual, like a real person talking directly to the reader.",
  shorter: "Make it tighter and shorter without losing the core meaning. Cut filler.",
  hook: "Rewrite it as a sharper, scroll-stopping opening hook that earns the next line.",
  "brand-voice": "Rewrite it to match the brand voice and tone keywords above."
};

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const input = refineRequestSchema.parse(body);

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Refine is not available in this environment." }, { status: 503 });
    }

    // 独立限流；Credits 由下方的持久操作精确扣除。
    if (!checkRateLimit(`refine:${userId}`, 30, 60_000)) {
      return NextResponse.json(
        { error: apiError(request.headers, "操作过于频繁，请稍后再试。", "Too many refines — please slow down.") },
        { status: 429 }
      );
    }

    // 读 brand brain：注入品牌语气 + 检查禁用词。
    const { data: brainRow } = await admin
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    const brain = brainRow ? mapBrandBrainFromRow(brainRow) : undefined;
    const bannedPhrases = brain?.bannedPhrases ?? [];

    const [{ data: profile }, { data: subscriptions }] = await Promise.all([
      admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      admin
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false })
    ]);
    const effectivePlan = resolveEffectivePlan(
      profile?.plan,
      getActiveSubscription(
        (subscriptions ?? []).map((subscription) => ({
          status: String(subscription.status ?? ""),
          currentPeriodEnd: subscription.current_period_end
        }))
      )
    );
    await ensurePlanCredits(userId, effectivePlan);
    const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
    const billing = createAiUsageBilling({
      operationKey: `selection-refine:${userId}:${requestId}`,
      userId,
      action: "rewriteTitle",
      cost: ACTION_CREDITS.rewriteTitle,
      source: "selection_refine",
      detail: {
        requestId,
        platform: input.platform,
        action: input.action,
        inputFingerprint: await hashGenerationRequest(input)
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This refine request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    const platform = getPlatform(input.platform as PlatformId);
    const brandSection = brain ? buildBrainPromptSection(brain, [input.platform]) : "";

    const prompt = `You are rewriting a SHORT selected snippet of a ${platform.label} post. Keep the same language (Chinese stays Chinese, English stays English). Match the surrounding context's tone and continue it naturally. Return ONLY the rewritten snippet — no quotes, no commentary, no markdown fences.

Action: ${ACTION_INSTRUCTIONS[input.action]}
${brandSection ? `\n${brandSection}\n` : ""}
=== SELECTED SNIPPET (rewrite ONLY this) ===
${input.text}
${input.context ? `\n=== SURROUNDING CONTEXT (for tone/continuity only — do NOT repeat in output) ===\n${input.context}` : ""}`;

    let resultReady = false;
    try {
      const refined = (await sendRawPrompt(prompt)).trim();
      if (!refined) throw new Error("Refine returned an empty result.");

      // 命中禁用词检查（前端标红提示）。
      const lower = refined.toLowerCase();
      const bannedHits = bannedPhrases.filter((phrase) => Boolean(phrase) && lower.includes(String(phrase).toLowerCase()));
      resultReady = true;
      await billing.settle();
      return NextResponse.json({ text: refined, bannedHits });
    } catch (error) {
      if (!resultReady) await billing.refund("selection_refine_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to use Refine." }, { status: 401 });
    }
    console.error("[refine] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refine the selection." },
      { status: 400 }
    );
  }
}
