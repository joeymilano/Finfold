import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { extensionAuthEnabled, extensionPaidActionsEnabled } from "@/lib/extension/usage";
import { replyDraftEnabled, replyDraftRequestSchema } from "@/lib/extension/reply-contracts";
import { runReplyDraft } from "@/lib/extension/reply-service";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  const fail = (code: string, status: number) => extensionJson(request, { error: { code } }, { status });
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) return fail("ORIGIN_NOT_ALLOWED", 403);
  if (!extensionAuthEnabled() || !extensionPaidActionsEnabled()) return fail("FEATURE_DISABLED", 503);
  const session = await authenticateExtensionRequest(request);
  if (!session?.scope.includes("extension:generate")) return fail("UNAUTHORIZED", 401);
  if (!replyDraftEnabled(session.userId)) return fail("PILOT_NOT_AVAILABLE", 403);
  // A compressed comment screenshot stays well under 1.5 MB of base64; the
  // 2.5 MB ceiling (same as the locate endpoint) rejects oversized images
  // before JSON parsing or model/billing work.
  if (Number(request.headers.get("content-length")) > 2_500_000) return fail("BAD_REQUEST", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2_500_000) return fail("BAD_REQUEST", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return fail("BAD_REQUEST", 400); }
  const parsed = replyDraftRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_REQUEST", 400);
  try {
    return extensionJson(request, { requestId: parsed.data.requestId, ...await runReplyDraft(session.userId, parsed.data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GENERATION_FAILED";
    const codes: Record<string, number> = {
      INSUFFICIENT_CREDITS: 402, REQUEST_CONFLICT: 409, REQUEST_ALREADY_FAILED: 409,
      REQUEST_IN_PROGRESS: 409, RESULT_EXPIRED: 410, FREE_POOL_UNAVAILABLE: 503,
      REPLY_DAILY_LIMIT_REACHED: 429, VISION_UNAVAILABLE: 503, SERVICE_UNAVAILABLE: 503, FEATURE_DISABLED: 503
    };
    return fail(code in codes ? code : "GENERATION_FAILED", codes[code] ?? 502);
  }
}
