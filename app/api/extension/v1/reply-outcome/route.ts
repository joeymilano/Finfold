import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { replyDraftEnabled, replyOutcomeRequestSchema } from "@/lib/extension/reply-contracts";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { captureServerEvent } from "@/lib/posthog-server";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

// Fire-and-forget telemetry from the extension's tiered send. The outcome is
// accepted only for a request the user actually generated, so the rollout
// readout's reliability numbers cannot be polluted by arbitrary clients.
export async function POST(request: Request) {
  const fail = (code: string, status: number) => extensionJson(request, { error: { code } }, { status });
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) return fail("ORIGIN_NOT_ALLOWED", 403);
  if (!extensionAuthEnabled()) return fail("FEATURE_DISABLED", 503);
  const session = await authenticateExtensionRequest(request);
  if (!session?.scope.includes("extension:generate")) return fail("UNAUTHORIZED", 401);
  if (!replyDraftEnabled(session.userId)) return fail("PILOT_NOT_AVAILABLE", 403);
  let body: unknown;
  try { body = JSON.parse(await request.text()); } catch { return fail("BAD_REQUEST", 400); }
  const parsed = replyOutcomeRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_REQUEST", 400);
  const db = createSupabaseAdminClient();
  if (!db) return fail("FEATURE_DISABLED", 503);
  const { data: prior } = await db.from("ai_usage_operations").select("id")
    .eq("user_id", session.userId)
    .eq("operation_key", `extension-reply:${session.userId}:${parsed.data.requestId}`)
    .maybeSingle();
  if (!prior) return fail("BAD_REQUEST", 400);
  const { error } = await db.from("extension_reply_send_outcomes").upsert({
    user_id: session.userId,
    request_id: parsed.data.requestId,
    platform: parsed.data.platform,
    outcome: parsed.data.outcome
  }, { onConflict: "user_id,request_id" });
  if (error) return fail("SERVICE_UNAVAILABLE", 503);
  void captureServerEvent(session.userId, "extension_reply_send_outcome", {
    platform: parsed.data.platform,
    outcome: parsed.data.outcome,
    request_id: parsed.data.requestId
  });
  return extensionJson(request, { recorded: true });
}
