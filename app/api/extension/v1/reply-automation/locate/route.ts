import { checkRateLimit } from "@/lib/rate-limit";
import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { extensionAuthEnabled, extensionPaidActionsEnabled } from "@/lib/extension/usage";
import { replyDraftEnabled } from "@/lib/extension/reply-contracts";
import { locateReplyControls, visionLocateRequestSchema } from "@/lib/extension/reply-automation";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  const fail = (code: string, status: number) => extensionJson(request, { error: { code } }, { status });
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) return fail("ORIGIN_NOT_ALLOWED", 403);
  if (!extensionAuthEnabled() || !extensionPaidActionsEnabled()) return fail("FEATURE_DISABLED", 503);
  const session = await authenticateExtensionRequest(request);
  if (!session?.scope.includes("extension:generate")) return fail("UNAUTHORIZED", 401);
  if (!replyDraftEnabled(session.userId)) return fail("PILOT_NOT_AVAILABLE", 403);
  // A jpeg screenshot of a retina tab is well under 1 MB; 2.5 MB of body is
  // the hard ceiling so an oversized image is rejected before JSON parsing.
  if (Number(request.headers.get("content-length")) > 2_500_000) return fail("BAD_REQUEST", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2_500_000) return fail("BAD_REQUEST", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return fail("BAD_REQUEST", 400); }
  const parsed = visionLocateRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_REQUEST", 400);
  // Locating is free but not unmetered: one visual pass per reply action.
  if (!checkRateLimit(`ext-vision-locate:${session.userId}`, 30, 3_600_000)) return fail("RATE_LIMITED", 429);
  try {
    return extensionJson(request, await locateReplyControls(parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "VISION_FAILED";
    const codes: Record<string, number> = {
      VISION_UNAVAILABLE: 503, VISION_FAILED: 502, VISION_INVALID_RESPONSE: 502, SERVICE_UNAVAILABLE: 503
    };
    return fail(code in codes ? code : "VISION_FAILED", codes[code] ?? 502);
  }
}
