import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { getAvailableCredits, settleAiUsageOperation } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { resolveLLMProviders } from "@/lib/llm-providers";
import type { ModelAttemptAudit } from "@/lib/llm";
import { sha256Hex } from "./crypto";
import { extensionActionCost, getExtensionEntitlement } from "./service";
import { generateReplyDraft } from "./reply-generation";
import { replyDailyLimit, replyDraftResultSchema, type ReplyDraftRequest } from "./reply-contracts";
import { triageExtensionReply, type ExtensionAudienceType, type ExtensionReplyTriage } from "./reply-triage";

type ExtensionDb = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

// "Daily" resets at Beijing midnight: the reply pilot's primary platform
// (Xiaohongshu) and its users operate on CST.
export function replyDailyWindowStart(now = Date.now()): string {
  return new Date(Math.floor((now + 8 * 3_600_000) / 86_400_000) * 86_400_000 - 8 * 3_600_000).toISOString();
}

// Counts today's non-refunded reply operations from the durable billing
// ledger (extension_reply_results is only a 24h replay cache). Returns null
// when the count cannot be read: credit billing stays the hard cap, so the
// risk guard fails open rather than blocking paying users.
export async function countReplyDraftsToday(db: ExtensionDb, userId: string): Promise<number | null> {
  const { count, error } = await db.from("ai_usage_operations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("operation_key", `extension-reply:${userId}:%`)
    .neq("status", "refunded")
    .gte("reserved_at", replyDailyWindowStart());
  return error ? null : count ?? 0;
}

export async function runReplyDraft(userId: string, request: ReplyDraftRequest) {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("FEATURE_DISABLED");
  const cost = extensionActionCost(1);
  const inputHash = await sha256Hex(JSON.stringify(request));
  // User-scoped rather than session-scoped: reconnecting cannot charge twice.
  const operationKey = `extension-reply:${userId}:${request.requestId}`;
  const { data: prior, error: priorError } = await db.from("ai_usage_operations")
    .select("id,status,detail").eq("user_id", userId).eq("operation_key", operationKey).maybeSingle();
  if (priorError) throw new Error("SERVICE_UNAVAILABLE");
  if (prior && prior.detail?.inputHash !== inputHash) throw new Error("REQUEST_CONFLICT");

  // New requests only (prior === null): retries of an already-reserved or
  // settled request must still recover their paid result at the limit.
  // Checked before the credit reservation, so a blocked request neither
  // consumes allowance nor starts billing. Best-effort like the locate
  // limiter — credit billing remains the hard cap.
  if (!prior) {
    const usedToday = await countReplyDraftsToday(db, userId);
    if (usedToday !== null && usedToday >= replyDailyLimit()) throw new Error("REPLY_DAILY_LIMIT_REACHED");
  }

  const entitlement = await getExtensionEntitlement(userId);
  const billing = createAiUsageBilling({
    operationKey, userId, action: "singlePlatformCopy", cost, source: "chrome_extension_reply",
    detail: { requestId: request.requestId, inputHash, platform: request.platform }
  });
  const reservation = await billing.reserveAndStart();
  if (reservation.outcome === "insufficient_credits") throw new Error("INSUFFICIENT_CREDITS");
  if (reservation.outcome === "existing") {
    if (reservation.status === "refunded") throw new Error("REQUEST_ALREADY_FAILED");
    const { data, error } = await db.from("extension_reply_results").select("result,expires_at,triage")
      .eq("user_id", userId).eq("request_id", request.requestId).maybeSingle();
    if (error) throw new Error("SERVICE_UNAVAILABLE");
    if (!data) throw new Error(reservation.status === "settled" ? "RESULT_EXPIRED" : "REQUEST_IN_PROGRESS");
    if (Date.parse(data.expires_at) <= Date.now()) throw new Error("RESULT_EXPIRED");
    if (reservation.status !== "settled") {
      const { data: operation } = await db.from("ai_usage_operations").select("id")
        .eq("user_id", userId).eq("operation_key", operationKey).maybeSingle();
      if (!operation || await settleAiUsageOperation(userId, operation.id) !== "settled") throw new Error("REQUEST_IN_PROGRESS");
    }
    const replayed = cachedTriage(data.triage);
    return { result: replyDraftResultSchema.parse(data.result), cost, availableCredits: await getAvailableCredits(userId),
      ...(replayed ? { triage: replayed } : {}) };
  }

  let persisted = false;
  try {
    const { data: brain, error: brainError } = await db.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", userId).maybeSingle();
    if (brainError) throw new Error("SERVICE_UNAVAILABLE");
    const brandBrain = mapBrandBrainFromRow(brain);
    const brandDigest = [brandBrain?.brandName, brandBrain?.productDescription, brandBrain?.positioningStatement]
      .filter(Boolean).join(" — ") || null;
    // Pure tone optimization: null (disabled / outage / screenshot-only) drafts as before.
    const triage = await triageExtensionReply(request, brandDigest, { userId });
    const audits: ModelAttemptAudit[] = [];
    const result = await generateReplyDraft({
      request, brandBrain, triage, providerPolicy: entitlement.providerPolicy,
      telemetry: { userId, requestId: request.requestId },
      onModelAttempt: async (audit) => { audits.push(audit); }
    }).finally(async () => {
      // Invalid model output still consumes provider tokens; retain its cost evidence.
      const providers = new Map(resolveLLMProviders().map((provider) => [provider.name, provider.costClass]));
      if (audits.length) {
        const { error } = await db.from("extension_model_usage").insert(audits.map((audit) => ({
          request_id: request.requestId, user_id: userId, provider_name: audit.provider, model_name: audit.model,
          provider_cost_class: providers.get(audit.provider) ?? "paid", input_tokens: audit.inputTokens,
          output_tokens: audit.outputTokens, total_tokens: audit.totalTokens, estimated_cost_usd: audit.estimatedCostUsd,
          credit_cost: cost
        })));
        if (error) throw new Error("SERVICE_UNAVAILABLE");
      }
      if (entitlement.providerPolicy === "free_only" && audits.some((audit) => providers.get(audit.provider) !== "free_pool")) {
        throw new Error("FREE_POOL_UNAVAILABLE");
      }
    });
    const { error } = await db.from("extension_reply_results").insert({
      user_id: userId, request_id: request.requestId, result,
      ...(triage ? { triage } : {}),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    if (error) throw new Error("SERVICE_UNAVAILABLE");
    persisted = true;
    await billing.settle();
    return { result, cost, availableCredits: reservation.available, ...(triage ? { triage } : {}) };
  } catch (error) {
    if (persisted) throw new Error("REQUEST_IN_PROGRESS");
    try { await billing.refund("chrome_extension_reply_failed"); }
    catch { throw new Error("REQUEST_IN_PROGRESS"); }
    throw error;
  }
}

/** Guards the cached triage summary on replay; anything malformed is absent. */
function cachedTriage(value: unknown): ExtensionReplyTriage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.audienceType !== "string" || typeof record.worthReplying !== "number") return null;
  return { audienceType: record.audienceType as ExtensionAudienceType, worthReplying: record.worthReplying };
}
