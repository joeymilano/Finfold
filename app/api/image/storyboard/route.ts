
import { NextResponse } from "next/server";
import { sendRawPrompt } from "@/lib/llm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import {
  buildVisualStoryPrompt,
  parseVisualStoryResponse,
  visualStoryRequestSchema
} from "@/lib/visual-story";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: "Please log in to generate a visual story." }, { status: 401 });
  }

  const rateLimitKey = `visual-story:${userId}:${getClientIp(request)}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many visual-story requests. Please try again later." }, { status: 429 });
  }

  try {
    const input = visualStoryRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Visual story generation is not available in this environment." }, { status: 503 });
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
      operationKey: `visual-story:${userId}:${requestId}`,
      userId,
      action: "aiScoreOptimize",
      cost: ACTION_CREDITS.aiScoreOptimize,
      source: "visual_story",
      detail: {
        requestId,
        pageCount: input.pageCount,
        inputFingerprint: await hashGenerationRequest(input)
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This visual-story request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    let storyReady = false;
    try {
      const raw = await sendRawPrompt(buildVisualStoryPrompt(input));
      const story = parseVisualStoryResponse(raw, input.pageCount);
      storyReady = true;
      await billing.settle();
      return NextResponse.json({ story });
    } catch (error) {
      if (!storyReady) await billing.refund("visual_story_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate the visual story.";
    // sendRawPrompt races two 60s-per-provider AbortSignal.timeout calls
    // (see lib/llm.ts), so a full failover can take ~2 minutes before
    // surfacing here as a DOMException. Give it a distinct status so the
    // client shows "timed out, retry" instead of a raw provider message.
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    const status = isTimeout
      ? 504
      : message.includes("not configured") || message.includes("未配置")
        ? 503
        : 400;
    console.error("[visual-story] generation failed:", message);
    return NextResponse.json(
      { error: isTimeout ? "Visual story generation timed out." : message },
      { status }
    );
  }
}
