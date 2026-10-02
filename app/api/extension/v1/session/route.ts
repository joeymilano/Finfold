import { authenticateExtensionRequest } from "@/lib/extension/auth";
import { extensionJson, extensionPreflight, isAllowedExtensionRequestOrigin } from "@/lib/extension/cors";
import { getExtensionEntitlement } from "@/lib/extension/service";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { replyDraftEnabled, replyDailyLimit } from "@/lib/extension/reply-contracts";
import { countReplyDraftsToday } from "@/lib/extension/reply-service";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";

export function OPTIONS(request: Request) { return extensionPreflight(request); }

export async function GET(request: Request) {
  // Host-permitted extension GETs may omit Origin, and Chrome 153+ may send
  // the opaque origin "null". This endpoint authenticates exclusively via an
  // extension Bearer token (never ambient web cookies). Reject any explicit
  // unapproved origin; missing Origin is not authentication.
  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedExtensionRequestOrigin(origin)) {
    return extensionJson(request, { error: { code: "ORIGIN_NOT_ALLOWED" } }, { status: 403 });
  }
  if (!extensionAuthEnabled()) {
    return extensionJson(request, { error: { code: "FEATURE_DISABLED" } }, { status: 503 });
  }
  const session = await authenticateExtensionRequest(request);
  if (!session) return extensionJson(request, { error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const admin = createSupabaseAdminClient()!;
  const replyDraftsOn = replyDraftEnabled(session.userId);
  const [entitlement, brain, account, replyUsedToday] = await Promise.all([
    getExtensionEntitlement(session.userId),
    admin.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", session.userId).maybeSingle(),
    admin.auth.admin.getUserById(session.userId),
    replyDraftsOn ? countReplyDraftsToday(admin, session.userId) : Promise.resolve(null)
  ]);
  return extensionJson(request, {
    authenticated: true,
    userId: session.userId,
    accountEmail: account.data?.user?.email ?? "",
    replyDraftsEnabled: replyDraftsOn,
    // Null when disabled or unreadable; the extension treats it as informational only.
    replyDraftsRemainingToday: replyUsedToday === null ? null : Math.max(0, replyDailyLimit() - replyUsedToday),
    brandName: mapBrandBrainFromRow(brain.data)?.brandName || "",
    plan: entitlement.plan,
    availableCredits: entitlement.available,
    freePoolOnly: entitlement.providerPolicy === "free_only"
  });
}
