
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  HTML_CONTENT_TYPES,
  validateExternalHttpUrl,
  safeExternalFetch,
  readTextWithLimit
} from "@/lib/safe-url";
import { stripHtmlToText } from "@/lib/html-strip";
import { fetchLatestFeedEntry } from "@/lib/feed-parser";
import { sendUntrustedContentPrompt } from "@/lib/llm";
import { buildCaptureExtractionPrompt } from "@/lib/external-content-prompts";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";

const captureRequestSchema = z.object({
  url: z.string().url()
});

const MAX_HTML_BYTES = 200_000;
const MAX_TEXT_CHARS = 6000;
const captureExtractionSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  keyPoints: z.array(z.string().trim().min(1).max(300)).min(3).max(6)
});

/**
 * 素材收集箱（P1-1）的 URL 抓取端点：粘一个产品官网 / GitHub Release / changelog
 * 链接 → SSRF 校验 → 抓正文（feed 走 feed-parser，网页走 html-strip）→ LLM 抽成
 * summary + 3-6 条 keyPoints，回填到 IdeaInput。复用 safe-url 的 SSRF 防护，
 * 抓取失败明确报错不静默降级。
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const input = captureRequestSchema.parse(body);

    // SSRF 防护：拒绝内网/localhost/非 http(s)。
    validateExternalHttpUrl(input.url);

    if (!checkRateLimit(`capture:${userId}`, 15, 60_000)) {
      return NextResponse.json(
        { error: "抓取过于频繁，请稍后再试。(Too many captures — please slow down.)" },
        { status: 429 }
      );
    }

    const isFeed = /github\.com\/.*\/releases|\/feed|\/rss|\/atom/i.test(input.url);
    let title: string;
    let rawText: string;

    if (isFeed) {
      const entry = await fetchLatestFeedEntry(input.url);
      if (!entry) {
        return NextResponse.json(
          { error: "无法读取该 feed，请确认链接。(Could not read this feed — check the URL.)" },
          { status: 422 }
        );
      }
      title = entry.title;
      rawText = stripHtmlToText(entry.summary ?? "", MAX_TEXT_CHARS);
    } else {
      const response = await safeExternalFetch(
        input.url,
        { headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" } },
        {
          allowedContentTypes: HTML_CONTENT_TYPES,
          timeoutMs: 10_000,
          auditPurpose: "capture_page"
        }
      );
      if (!response.ok) {
        return NextResponse.json(
          { error: `页面抓取失败（HTTP ${response.status}）。(The page could not be fetched.)` },
          { status: 422 }
        );
      }
      const html = await readTextWithLimit(response, MAX_HTML_BYTES);
      title = extractHtmlTitle(html) ?? input.url;
      rawText = stripHtmlToText(html, MAX_TEXT_CHARS);
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "抓到的页面没有可用正文。(Captured page has no usable text.)" },
        { status: 422 }
      );
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "URL capture is not available in this environment." }, { status: 503 });
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
      operationKey: `content-capture:${userId}:${requestId}`,
      userId,
      action: "quickResearch",
      cost: ACTION_CREDITS.quickResearch,
      source: "content_capture",
      detail: {
        requestId,
        inputFingerprint: await hashGenerationRequest(input)
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json({ error: "This Finfold workspace is out of AI Credits for this cycle." }, { status: 402 });
    }
    if (reservation.outcome === "existing") {
      return NextResponse.json({ error: "This capture request is already being processed or completed. Retry later with the same Idempotency-Key." }, { status: 409 });
    }

    let resultReady = false;
    try {
      const llmResult = (await sendUntrustedContentPrompt(
        buildCaptureExtractionPrompt(title, rawText, input.url)
      )).trim();
      const parsed = parseJsonLoose(llmResult);
      resultReady = true;
      await billing.settle();
      return NextResponse.json({
        title,
        summary: parsed?.summary ?? rawText.slice(0, 200).trim(),
        keyPoints: parsed?.keyPoints ?? []
      });
    } catch (error) {
      if (!resultReady) await billing.refund("content_capture_failed").catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to capture a URL." }, { status: 401 });
    }
    console.error("[capture] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to capture this URL." },
      { status: 400 }
    );
  }
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim().slice(0, 200) : null;
}

/** 容错解析 LLM 返回的 JSON（去 markdown fence、截取首个 {...}）。失败返回 null。 */
function parseJsonLoose(text: string): { summary: string; keyPoints: string[] } | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = captureExtractionSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    /* fall through */
  }
  return null;
}
