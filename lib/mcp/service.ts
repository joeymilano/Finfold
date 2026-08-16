import { z } from "zod";
import type { BrandBrain } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import type { ContentKit, GenerateRequest, KitOutput } from "@/lib/content-schema";
import { customGuardrailsSchema, type GuardrailRule } from "@/lib/guardrails";
import { industryPackIdSchema, type IndustryPackId } from "@/lib/industry-rules/types";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { getActiveSubscription, getPlanModelTier, getPlanPlatformLimit, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { PLAN_CREDITS, computeKitCost, ensurePlanCredits, getPlanBatchUsed, type ModelTier } from "@/lib/payment";
import type { PlanId } from "@/lib/payment/types";
import { platforms } from "@/lib/platforms";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { McpGenerateInput } from "@/lib/mcp/types";
import { createMcpGenerationBilling } from "@/lib/mcp/generation-billing";
import { hashGenerationRequest } from "@/lib/generation-runs";

type UserContext = { brain: BrandBrain; rules: GuardrailRule[]; industryPackIds: IndustryPackId[] };
type PlanLimit = { limit: number; plan: PlanId | "free"; platformLimit: number; modelTier: ModelTier };

export async function getMcpBrandContext(userId: string): Promise<UserContext> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");

  const [{ data: brainRow, error: brainError }, { data: guardrailsRow, error: guardrailsError }] = await Promise.all([
    supabase.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase.from("custom_guardrails").select("rules, enabled_packs").eq("user_id", userId).maybeSingle()
  ]);
  if (brainError || guardrailsError) throw new Error("Could not load the Finfold brand context. Please try again.");

  return {
    brain: mapBrandBrainFromRow(brainRow),
    rules: customGuardrailsSchema.parse(guardrailsRow?.rules ?? []),
    industryPackIds: z.array(industryPackIdSchema).catch([]).parse(guardrailsRow?.enabled_packs ?? [])
  };
}

export function getMcpPlatformRules(platformIds?: string[]) {
  const selected = platformIds?.length ? platforms.filter((platform) => platformIds.includes(platform.id)) : platforms;
  return selected.map((platform) => ({
    id: platform.id,
    name: platform.label,
    best_for: platform.bestFor,
    voice: platform.voice,
    constraints: platform.constraints,
    avoid: platform.avoidList,
    character_limit: platform.charLimit,
    tag_strategy: platform.tagStrategy
  }));
}

export async function generateMcpKit(
  userId: string,
  input: McpGenerateInput,
  request: { tokenId: string; idempotencyKey: string }
): Promise<{ kit: ContentKit; plan: string; used: number; limit: number; available: number; cost: number }> {
  const context = await getMcpBrandContext(userId);
  const planLimit = await getPlanLimit(userId);
  if (input.platforms.length > planLimit.platformLimit) {
    throw new Error(`Your plan supports up to ${planLimit.platformLimit} platforms per generation. Choose fewer platforms or upgrade in Finfold.`);
  }

  // Same credits model as the app: grant the cycle's plan allowance if missing,
  // then reserve exactly what this generation costs (not a flat "1 kit").
  await ensurePlanCredits(userId, planLimit.plan);
  const moderation = moderateInput(input.brief);
  if (moderation.flagged) throw new Error(moderation.reason);

  const cost = computeKitCost(input.platforms.length);
  const billing = createMcpGenerationBilling({
    userId,
    tokenId: request.tokenId,
    idempotencyKey: request.idempotencyKey,
    cost,
    platformCount: input.platforms.length,
    inputFingerprint: await hashGenerationRequest(input)
  });
  const reservation = await billing.reserveAndStart();
  if (reservation.outcome === "insufficient_credits") {
    throw new Error("This Finfold workspace is out of AI Credits for this cycle. Upgrade or top up to continue generating.");
  }
  if (reservation.outcome === "existing") {
    throw new Error(existingMcpGenerationMessage(reservation.status));
  }

  let kitPersisted = false;
  try {
    const generationInput: GenerateRequest = {
      ideaText: input.brief,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: [],
      language: input.language,
      brandBrain: context.brain,
      customRules: context.rules.map((rule) => `${rule.type}: ${rule.detail}`),
      industryPackIds: context.industryPackIds
    };
    const outputs = await generateKitOutputs(generationInput, { modelTier: planLimit.modelTier });
    const kit: ContentKit = {
      id: crypto.randomUUID(),
      ideaText: input.brief,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: [],
      outputs: outputs.map((output: KitOutput) => ({
        ...output,
        id: crypto.randomUUID(),
        locked: false,
        publishStatus: "draft"
      })),
      status: "saved",
      createdAt: new Date().toISOString()
    };
    await persistGeneratedKit(userId, kit, context.brain, undefined, context.industryPackIds);
    kitPersisted = true;
    await billing.settle();

    const used = await getPlanBatchUsed(userId);
    return { kit, plan: planLimit.plan, used, limit: planLimit.limit, available: reservation.available, cost };
  } catch (error) {
    // A persisted kit may have produced a valid result even if its settlement
    // acknowledgement timed out. Keep that started operation for review rather
    // than later auto-refunding a real provider invocation.
    if (!kitPersisted) await billing.refundFailedGeneration().catch(() => undefined);
    throw error;
  }
}

function existingMcpGenerationMessage(status: "reserved" | "started" | "settled" | "refunded"): string {
  if (status === "settled") {
    return "This MCP generation request already completed. Open the saved content kit in Finfold instead of charging it again.";
  }
  if (status === "refunded") {
    return "This MCP generation request already failed and its Credits were refunded. Send a new Idempotency-Key to try again.";
  }
  return "This MCP generation request is already being processed. Retry later with the same Idempotency-Key.";
}

async function getPlanLimit(userId: string): Promise<PlanLimit> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase.from("subscriptions").select("status, current_period_end").eq("user_id", userId).eq("payment_provider", "creem").order("updated_at", { ascending: false })
  ]);
  const activeSubscription = getActiveSubscription((subscriptions ?? []).map((item) => ({ status: String(item.status ?? ""), currentPeriodEnd: item.current_period_end })));
  const plan = resolveEffectivePlan(profile?.plan, activeSubscription);
  return {
    limit: PLAN_CREDITS[plan],
    plan,
    platformLimit: getPlanPlatformLimit(plan),
    modelTier: getPlanModelTier(plan)
  };
}
