import { mapBrandBrainFromRow, BRAND_BRAIN_COLUMNS } from "@/lib/brand-brain-persistence";
import type { ContentKit } from "@/lib/content-schema";
import type { AuthenticatedActionRequest, ExtensionResult } from "@/lib/extension/contracts";
import { generateExtensionResults } from "@/lib/extension/generation";
import type { ModelAttemptAudit } from "@/lib/llm";
import { resolveLLMProviders } from "@/lib/llm-providers";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, computeKitCost, ensurePlanCredits, getAvailableCredits, PLAN_CREDITS } from "@/lib/payment";
import type { PlanId } from "@/lib/payment/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { extensionReviewExpiry, isExtensionReviewUser } from "@/lib/payment/extension-review";

export type ExtensionEntitlement = {
  plan: PlanId | "free";
  available: number;
  providerPolicy: "free_only" | "all";
};

export function extensionActionCost(platformCount: 1 | 4): number {
  return platformCount === 1
    ? ACTION_CREDITS.singlePlatformCopy
    : computeKitCost(platformCount);
}

export async function getExtensionEntitlement(userId: string): Promise<ExtensionEntitlement> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold extension billing is not configured.");
  if (isExtensionReviewUser(userId)) {
    await ensurePlanCredits(userId, "free");
    return {
      plan: "free",
      available: await getAvailableCredits(userId),
      providerPolicy: extensionReviewExpiry(userId) ? "all" : "free_only"
    };
  }
  const [{ data: profile }, { data: subscriptions }, { data: purchased }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, payment_provider")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("credit_balances")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "purchase")
      .gt("remaining", 0)
      .limit(1)
  ]);
  const active = getActiveSubscription((subscriptions ?? []).map((item) => ({
    status: String(item.status ?? ""),
    currentPeriodEnd: item.current_period_end,
    provider: item.payment_provider
  })));
  const plan = resolveEffectivePlan(profile?.plan, active);
  await ensurePlanCredits(userId, plan);
  return {
    plan,
    available: await getAvailableCredits(userId),
    providerPolicy: plan !== "free" || Boolean(purchased?.length) ? "all" : "free_only"
  };
}

export async function runAuthenticatedExtensionAction(input: {
  userId: string;
  sessionId: string;
  request: AuthenticatedActionRequest;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold extension is not configured.");
  const entitlement = await getExtensionEntitlement(input.userId);
  const platformCount = input.request.platforms.length as 1 | 4;
  const cost = extensionActionCost(platformCount);
  const billing = createAiUsageBilling({
    operationKey: `extension:${input.sessionId}:${input.request.requestId}`,
    userId: input.userId,
    action: platformCount === 1 ? "singlePlatformCopy" : "contentKitBase",
    cost,
    source: "chrome_extension",
    detail: { platformCount, requestId: input.request.requestId }
  });
  const reservation = await billing.reserveAndStart();
  if (reservation.outcome === "insufficient_credits") {
    return { outcome: "insufficient_credits" as const, available: reservation.available, cost };
  }
  if (reservation.outcome === "existing") {
    if (reservation.status === "settled") {
      const existing = await loadExistingResult(input.userId, input.request.requestId);
      return existing
        ? { outcome: "completed" as const, ...existing, cost }
        : { outcome: "existing" as const, status: reservation.status, cost };
    }
    return { outcome: "existing" as const, status: reservation.status, cost };
  }

  let kitPersisted = false;
  try {
    const { data: brainRow } = await supabase
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", input.userId)
      .maybeSingle();
    const brandBrain = mapBrandBrainFromRow(brainRow);
    const audits: ModelAttemptAudit[] = [];
    const results = await generateExtensionResults({
      page: input.request.page,
      platforms: input.request.platforms,
      language: input.request.language,
      providerPolicy: entitlement.providerPolicy,
      maxTokens: platformCount === 1 ? 900 : 3_200,
      maxAttemptsPerProvider: entitlement.providerPolicy === "free_only" ? 1 : 2,
      brandBrain,
      telemetry: { requestId: input.request.requestId, userId: input.userId },
      onModelAttempt: async (audit) => { audits.push(audit); }
    });
    const providerCost = new Map(resolveLLMProviders().map((provider) => [provider.name, provider.costClass]));
    if (
      entitlement.providerPolicy === "free_only" &&
      audits.some((audit) => providerCost.get(audit.provider) !== "free_pool")
    ) {
      throw new Error("FREE_POOL_UNAVAILABLE");
    }
    if (audits.length > 0) {
      const { error: usageError } = await supabase.from("extension_model_usage").insert(
        audits.map((audit) => ({
          request_id: input.request.requestId,
          user_id: input.userId,
          provider_name: audit.provider,
          model_name: audit.model,
          provider_cost_class: providerCost.get(audit.provider) ?? "paid",
          input_tokens: audit.inputTokens,
          output_tokens: audit.outputTokens,
          total_tokens: audit.totalTokens,
          estimated_cost_usd: audit.estimatedCostUsd,
          credit_cost: cost
        }))
      );
      if (usageError) console.error("[extension] could not persist model cost audit");
    }
    const kit = buildKit(input.request, results);
    await persistGeneratedKit(input.userId, kit, brandBrain);
    kitPersisted = true;
    const { error: actionResultError } = await supabase.from("extension_action_results").upsert({
      request_id: input.request.requestId,
      user_id: input.userId,
      kit_id: kit.id,
      platform_count: platformCount,
      credit_cost: cost
    }, { onConflict: "user_id,request_id" });
    if (actionResultError) {
      // The generated kit is durable, so leave the Credits operation held for
      // reconciliation instead of issuing a refund for value already created.
      throw new Error("Extension action result could not be finalized.");
    }
    await billing.settle();
    return {
      outcome: "completed" as const,
      results,
      kitId: kit.id,
      available: reservation.available,
      plan: entitlement.plan,
      limit: PLAN_CREDITS[entitlement.plan],
      cost
    };
  } catch (error) {
    if (!kitPersisted) await billing.refund("chrome_extension_generation_failed").catch(() => undefined);
    throw error;
  }
}

export function buildKit(
  request: AuthenticatedActionRequest,
  results: ExtensionResult[],
  id = crypto.randomUUID()
): ContentKit {
  return {
    id,
    ideaText: request.page.title,
    goal: "audience-growth",
    persona: "global-team",
    platforms: request.platforms,
    mediaAssets: [],
    outputs: results.map((result) => ({
      ...result,
      id: crypto.randomUUID(),
      locked: false,
      publishStatus: "draft",
      userEdited: false
    })),
    status: "saved",
    createdAt: new Date().toISOString()
  };
}

async function loadExistingResult(userId: string, requestId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data: action } = await supabase
    .from("extension_action_results")
    .select("kit_id")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (!action) return null;
  const [{ data: outputs }, available] = await Promise.all([
    supabase
      .from("kit_outputs")
      .select("platform, title, body, summary, cta, notes, strategy")
      .eq("user_id", userId)
      .eq("kit_id", action.kit_id)
      .order("created_at", { ascending: true }),
    getAvailableCredits(userId)
  ]);
  return { kitId: action.kit_id, results: (outputs ?? []) as ExtensionResult[], available };
}
