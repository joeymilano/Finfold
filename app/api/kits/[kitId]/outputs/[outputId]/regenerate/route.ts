
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateKitOutputs } from "@/lib/llm";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { getActiveSubscription, getPlanModelTier, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import type { GenerateRequest } from "@/lib/content-schema";
import type { PlatformId } from "@/lib/platforms";

const regenerateRequestSchema = z.object({
  direction: z.string().max(300).optional(),
  mode: z.enum(["regenerate", "improve"]).default("regenerate")
});

/**
 * Regenerate ONE platform's output in place (P0-3). Unlike a full kit
 * generation, this rebuilds a single-platform GenerateRequest from the saved
 * kit + brand brain and calls generateKitOutputs with just that platform, so
 * the result keeps the same platform-rule + brand-voice quality as the first
 * generation while charging only a single-platform Credit action.
 *
 * Rate-limited independently (regenerate:${userId}) and operation-backed so
 * retried requests cannot spend Credits twice. The previous body is appended
 * to output_edits so the client can offer "recent versions" switching.
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
      return NextResponse.json({ error: "Regenerate is not available in this environment." }, { status: 503 });
    }

    // 独立限流防滥用；Credits 由下方的持久操作精确扣除。
    if (!checkRateLimit(`regenerate:${userId}`, 20, 60_000)) {
      return NextResponse.json(
        { error: "重新生成过于频繁，请稍后再试。(Regenerating too fast — please wait a moment.)" },
        { status: 429 }
      );
    }

    // 目标 output（scope check：属于该 user + kit）。
    const { data: outputRow, error: outputError } = await admin
      .from("kit_outputs")
      .select("id, platform, title, body, final_body, cta")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (outputError) throw new Error("Failed to load the output.");
    if (!outputRow) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    // kit 上下文（重建 GenerateRequest 用）。
    const { data: kitRow } = await admin
      .from("content_kits")
      .select("idea_text, goal, persona, media_assets")
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!kitRow) return NextResponse.json({ error: "Kit not found." }, { status: 404 });

    // brand brain（可选，失败/无则 undefined → 通用生成）。
    const { data: brainRow } = await admin
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    // plan → modelTier，和首次生成保持同一质量档位。
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
    const modelTier = getPlanModelTier(effectivePlan);

    // 可选方向提示（"再毒舌一点" 之类）→ 注入为一条 customRule。
    const body = await request.json().catch(() => ({}));
    const input = regenerateRequestSchema.parse(body);
    const direction = input.direction?.trim();
    const currentBody = String(outputRow.final_body ?? outputRow.body);
    const customRules = input.mode === "improve"
      ? [
          `Revise the current draft instead of creating an unrelated alternative. Fix this quality issue: ${direction || "strengthen the weakest pre-publish signal"}`,
          "Preserve the original topic, all verified facts, and the author's voice. Never invent data, cases, quotes, screenshots, or evidence.",
          `Current draft to improve:\nTITLE: ${String(outputRow.title)}\nBODY:\n${currentBody}\nCTA: ${String(outputRow.cta)}`
        ]
      : direction
        ? [`Direction for this regeneration: ${direction}`]
        : undefined;

    // 重建单平台 GenerateRequest。
    const genInput: GenerateRequest = {
      ideaText: String(kitRow.idea_text ?? ""),
      goal: (kitRow.goal as GenerateRequest["goal"]) ?? "lead-gen",
      persona: (kitRow.persona as GenerateRequest["persona"]) ?? "indie-builder",
      platforms: [outputRow.platform as PlatformId],
      mediaAssets: (kitRow.media_assets ?? []) as GenerateRequest["mediaAssets"],
      language: "auto",
      customRules,
      brandBrain: brainRow ? mapBrandBrainFromRow(brainRow) : undefined
    };

    const previousBody = currentBody;
    const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
    await ensurePlanCredits(userId, effectivePlan);
    const billing = createAiUsageBilling({
      operationKey: `output-regeneration:${userId}:${outputId}:${requestId}`,
      userId,
      action: "singlePlatformCopy",
      cost: ACTION_CREDITS.singlePlatformCopy,
      source: "output_regeneration",
      detail: {
        kitId,
        outputId,
        requestId,
        inputFingerprint: await hashGenerationRequest({ kitId, outputId, input })
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({
        error: reservation.status === "refunded"
          ? "This regeneration request already failed and its Credits were refunded. Send a new Idempotency-Key to try again."
          : "This regeneration request is already being processed or completed. Retry later with the same Idempotency-Key."
      }, { status: 409 });
    }

    let outputPersisted = false;
    try {
      // 单平台重新生成（不走飞轮实验 / industry packs，保持轻量）。
      const regenerated = await generateKitOutputs(genInput, { modelTier });
      const fresh = regenerated[0];
      if (!fresh) throw new Error("Regeneration returned no result.");

      // 旧 body 写入 output_edits（历史版本，前端可读最近 3 条做切换）。
      await admin.from("output_edits").insert({
        output_id: outputId,
        user_id: userId,
        field: "body",
        before_text: previousBody,
        after_text: fresh.body
      });

      // 更新现有行（清掉 final_body 让新 body 生效；保留原 outputId）。
      const { error: updateError } = await admin
        .from("kit_outputs")
        .update({
          title: fresh.title,
          body: fresh.body,
          cta: fresh.cta,
          notes: fresh.notes,
          strategy: fresh.strategy,
          final_body: null,
          user_edited: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", outputId)
        .eq("kit_id", kitId)
        .eq("user_id", userId);
      if (updateError) throw new Error("Failed to save the regenerated output.");

      outputPersisted = true;
      await billing.settle();
      return NextResponse.json({
        output: {
          id: outputId,
          platform: outputRow.platform,
          title: fresh.title,
          body: fresh.body,
          cta: fresh.cta,
          notes: fresh.notes,
          strategy: fresh.strategy,
          locked: false,
          publishStatus: "draft",
          finalBody: undefined,
          userEdited: false
        }
      });
    } catch (error) {
      if (!outputPersisted) await billing.refund("output_regeneration_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to regenerate." }, { status: 401 });
    }
    console.error("[outputs/regenerate] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate this output." },
      { status: 400 }
    );
  }
}
