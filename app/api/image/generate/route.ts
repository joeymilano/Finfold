/**
 * POST /api/image/generate
 *
 * Generate a cover image for a content kit output. Tries Cloudflare
 * Workers AI (flux-2-klein-4b) first while today's free Neuron budget
 * allows it, falling back to the Agnes AI image generation API
 * (OpenAI-compatible) — see lib/image-gen.ts.
 *
 * Expected body: {
 *   prompt: string;
 *   platform?: string;
 *   size?: string;
 * }
 *
 * Returns: { url: string; revisedPrompt: string | null }
 */

import { NextResponse } from "next/server";
import { buildTextFreeVisualPrompt, generateImage, isImageGenConfigured } from "@/lib/image-gen";
import { persistGeneratedImageBytes } from "@/lib/image-persistence";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";


const MAX_PROMPT_LENGTH = 2000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: "Image generation is not configured. Set IMAGE_API_KEY or CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_AI_TOKEN." },
      { status: 503 }
    );
  }

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: "Please log in to generate images." }, { status: 401 });
  }

  const rateLimitKey = `image:${userId}:${getClientIp(request)}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many image generation requests. Please try again later." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      prompt?: string;
      platform?: string;
      size?: string;
      referenceImageUrl?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Missing prompt." },
        { status: 400 }
      );
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters).` },
        { status: 422 }
      );
    }

    // Validate size parameter
    const allowedSizes = ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"];
    const size = body.size && allowedSizes.includes(body.size) ? body.size : "1024x1024";

    const referenceImageUrl = parseReferenceImageUrl(body.referenceImageUrl);
    const visualPrompt = buildTextFreeVisualPrompt(prompt, body.platform ?? "social");
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Image generation is not available in this environment." }, { status: 503 });
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
      operationKey: `image-generation:${userId}:${requestId}`,
      userId,
      action: "standardImage",
      cost: ACTION_CREDITS.standardImage,
      source: "image_generation",
      detail: {
        requestId,
        size,
        inputFingerprint: await hashGenerationRequest({ prompt, platform: body.platform, size, referenceImageUrl })
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This image request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    let imageReady = false;
    try {
      const outcome = await generateImage(visualPrompt, size, referenceImageUrl);
      let url: string;
      if (outcome.kind === "url") {
        url = outcome.url;
      } else {
        const persistedUrl = await persistGeneratedImageBytes(userId, outcome.bytes, outcome.contentType);
        if (!persistedUrl) {
          throw new Error("Generated image could not be persisted.");
        }
        url = persistedUrl;
      }
      imageReady = true;
      await billing.settle();
      return NextResponse.json({
        url,
        revisedPrompt: outcome.revisedPrompt ?? visualPrompt,
      });
    } catch (error) {
      if (!imageReady) await billing.refund("image_generation_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[Image API] Generation failed:", detail);
    return NextResponse.json(
      { error: `Image generation failed: ${detail}` },
      { status: 500 }
    );
  }
}

function parseReferenceImageUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid reference image URL.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Reference image must use http(s).");
  return url.toString();
}
