import type { ContentKit } from "@/lib/content-schema";
import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { claimRequestSchema, type ExtensionErrorCode } from "@/lib/extension/contracts";
import { resultHash, verifyClaimReceipt } from "@/lib/extension/crypto";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { createSupabaseAdminClient } from "@/lib/supabase";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function POST(request: Request) {
  if (!isAllowedExtensionRequestOrigin(request.headers.get("origin"))) return fail(request, "ORIGIN_NOT_ALLOWED", 403);
  if (!extensionAuthEnabled()) return fail(request, "FEATURE_DISABLED", 503);
  const session = await authenticateExtensionRequest(request);
  if (!session || !session.scope.includes("extension:save")) return fail(request, "UNAUTHORIZED", 401);
  const parsed = claimRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(request, "BAD_REQUEST", 400);

  const receipt = await verifyClaimReceipt(parsed.data.receipt).catch(() => null);
  if (!receipt || receipt.platform !== parsed.data.result.platform) return fail(request, "INVALID_CLAIM", 400);
  if (receipt.exp <= Math.floor(Date.now() / 1_000)) return fail(request, "CLAIM_EXPIRED", 410);
  if (receipt.resultHash !== await resultHash(parsed.data.result)) return fail(request, "INVALID_CLAIM", 400);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return fail(request, "GENERATION_FAILED", 503);
  const { data: action } = await supabase
    .from("extension_anonymous_actions")
    .select("id, status, claimed_by, claimed_kit_id")
    .eq("id", receipt.actionId)
    .maybeSingle();
  if (!action || action.status !== "succeeded") return fail(request, "INVALID_CLAIM", 400);
  if (action.claimed_by && action.claimed_by !== session.userId) return fail(request, "CLAIM_ALREADY_USED", 409);
  if (action.claimed_by === session.userId && action.claimed_kit_id) {
    return extensionJson(request, { saved: true, kitId: action.claimed_kit_id, chargedCredits: 0 });
  }

  const { data: existingKit } = await supabase
    .from("content_kits")
    .select("id, user_id")
    .eq("id", receipt.actionId)
    .maybeSingle();
  if (existingKit && existingKit.user_id !== session.userId) return fail(request, "CLAIM_ALREADY_USED", 409);

  if (!existingKit) {
    const kit: ContentKit = {
      id: receipt.actionId,
      ideaText: "Saved from Finfold for Chrome",
      goal: "audience-growth",
      persona: "global-team",
      platforms: [parsed.data.result.platform],
      mediaAssets: [],
      outputs: [{
        ...parsed.data.result,
        id: crypto.randomUUID(),
        locked: false,
        publishStatus: "draft",
        userEdited: false
      }],
      status: "saved",
      createdAt: new Date().toISOString()
    };
    try {
      await persistGeneratedKit(session.userId, kit);
    } catch {
      const { data: racedKit } = await supabase
        .from("content_kits")
        .select("user_id")
        .eq("id", receipt.actionId)
        .maybeSingle();
      if (!racedKit || racedKit.user_id !== session.userId) return fail(request, "GENERATION_FAILED", 503);
    }
  }

  const { data: claimed, error } = await supabase
    .from("extension_anonymous_actions")
    .update({
      claimed_by: session.userId,
      claimed_kit_id: receipt.actionId,
      claimed_at: new Date().toISOString()
    })
    .eq("id", receipt.actionId)
    .or(`claimed_by.is.null,claimed_by.eq.${session.userId}`)
    .select("id")
    .maybeSingle();
  if (error || !claimed) return fail(request, "CLAIM_ALREADY_USED", 409);
  return extensionJson(request, { saved: true, kitId: receipt.actionId, chargedCredits: 0 });
}

function fail(request: Request, code: ExtensionErrorCode, status: number) {
  return extensionJson(request, { error: { code } }, { status });
}
