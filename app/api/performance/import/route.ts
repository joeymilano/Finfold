
import { NextResponse } from "next/server";
import { performanceImportRequestSchema } from "@/lib/content-schema";
import { extractMetricsFromText } from "@/lib/performance-import";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits, type PlanId } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    if (!checkRateLimit(`perf-import:${userId}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many import attempts. Try again later." }, { status: 429 });
    }

    const body = performanceImportRequestSchema.parse(await request.json());
    if (body.kitId === "preview" || body.kitId === "showcase-kit") {
      return NextResponse.json({ error: apiError(request.headers, "示例内容不支持导入。", "Sample content cannot be imported.") }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    let effectivePlan: PlanId | "free" = "free";

    if (supabase) {
      // Same ownership check as /api/performance — this is data-entry
      // assistance for a real kit, not a public utility.
      const { data: kit, error: kitLookupError } = await supabase
        .from("content_kits")
        .select("id")
        .eq("id", body.kitId)
        .eq("user_id", userId)
        .maybeSingle();
      if (kitLookupError) throw kitLookupError;
      if (!kit) {
        return NextResponse.json({ error: "Kit not found." }, { status: 404 });
      }

      const { data: profile } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false });

      const activeSubscription = getActiveSubscription(
        (subscriptions ?? []).map((subscription) => ({
          status: String(subscription.status ?? ""),
          currentPeriodEnd: subscription.current_period_end
        }))
      );
      effectivePlan = resolveEffectivePlan(profile?.plan, activeSubscription);

      // Gated on canAnalyze (starter+), not iterateReport (growth+) — this is
      // data-entry assistance, not premium AI analysis. Gating it to growth+
      // would kneecap the feature for exactly the users manually typing
      // 9 numbers per platform.
      if (!getPlanFeatures(effectivePlan).canAnalyze) {
        return NextResponse.json({ error: "Upgrade required to use paste import." }, { status: 403 });
      }
    }

    const locale = /[一-鿿]/.test(body.pastedText) ? "zh" : "en";
    await ensurePlanCredits(userId, effectivePlan);
    const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
    const billing = createAiUsageBilling({
      operationKey: `performance-import:${userId}:${requestId}`,
      userId,
      action: "aiScoreOptimize",
      cost: ACTION_CREDITS.aiScoreOptimize,
      source: "performance_import",
      detail: {
        requestId,
        platform: body.platform,
        inputFingerprint: await hashGenerationRequest(body)
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This metric import is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    let resultReady = false;
    try {
      const result = await extractMetricsFromText(body.pastedText, body.platform, locale);
      resultReady = true;
      await billing.settle();
      return NextResponse.json(result);
    } catch (error) {
      if (!resultReady) await billing.refund("performance_import_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to use paste import." }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("No recognizable metrics")) {
      return NextResponse.json({ error: apiError(request.headers, "未能从粘贴内容中识别出任何指标，请检查文本或手动填写。", "No metrics were recognized in the pasted content. Check the text or fill them in manually.") }, { status: 422 });
    }
    if (error instanceof Error && error.message.includes("AI 生成未配置")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to import metrics." }, { status: 400 });
  }
}
