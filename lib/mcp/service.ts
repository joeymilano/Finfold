import { z } from "zod";
import { brandBrainSchema, getBrainCompleteness, type BrandBrain } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { loadGrowthBriefing, type GrowthBriefing, type GrowthBriefingLocale } from "@/lib/agent/growth-briefing";
import type { ContentKit, GenerateRequest, KitOutput } from "@/lib/content-schema";
import { platformIdSchema } from "@/lib/content-schema";
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
import {
  createMcpGenerationBilling,
  deriveMcpContentKitId,
  recoverExistingMcpGeneration
} from "@/lib/mcp/generation-billing";
import { hashGenerationRequest } from "@/lib/generation-runs";
import { resolveMcpAttachments } from "@/lib/mcp/attachments";
import { attachVisualAssets, KIT_SELECT_FIELDS, LEGACY_KIT_SELECT_FIELDS, mapContentKitRow } from "@/lib/kit-record";

type UserContext = { brain: BrandBrain; rules: GuardrailRule[]; industryPackIds: IndustryPackId[] };
type PlanLimit = { limit: number; plan: PlanId | "free"; platformLimit: number; modelTier: ModelTier };
export type McpContentKitSummary = {
  kitId: string;
  title: string;
  briefExcerpt: string;
  platforms: string[];
  status: string;
  createdAt: string;
};

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
): Promise<{ kit: ContentKit; plan: string; used: number; limit: number; available: number; cost: number; hasBrandMemory: boolean }> {
  const [context, planLimit, attachmentEvidence] = await Promise.all([
    getMcpBrandContext(userId),
    getPlanLimit(userId),
    resolveMcpAttachments(input.attachments)
  ]);
  if (input.platforms.length > planLimit.platformLimit) {
    throw new Error(`Your plan supports up to ${planLimit.platformLimit} platforms per generation. Choose fewer platforms or upgrade in Finfold.`);
  }

  // Same credits model as the app: grant the cycle's plan allowance if missing,
  // then reserve exactly what this generation costs (not a flat "1 kit").
  await ensurePlanCredits(userId, planLimit.plan);
  const brief = input.brief.trim().length >= 20
    ? input.brief.trim()
    : defaultMcpAttachmentBrief(attachmentEvidence.names);
  const effectiveBrief = attachmentEvidence.context
    ? `${brief}\n\n${attachmentEvidence.context}`
    : brief;
  const moderation = moderateInput(effectiveBrief);
  if (moderation.flagged) throw new Error(moderation.reason);

  const cost = computeKitCost(input.platforms.length);
  const contentKitId = await deriveMcpContentKitId(
    userId,
    request.tokenId,
    request.idempotencyKey
  );
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
    const kit = await recoverExistingMcpGeneration({
      reservation,
      userId,
      contentKitId,
      loadKit: (kitId) => getMcpContentKit(userId, kitId)
    });
    if (kit) {
      const used = await getPlanBatchUsed(userId);
      return {
        kit,
        plan: planLimit.plan,
        used,
        limit: planLimit.limit,
        available: reservation.available,
        cost,
        hasBrandMemory: getBrainCompleteness(context.brain) > 0
      };
    }
    throw new Error(existingMcpGenerationMessage(reservation.status));
  }

  let kitPersisted = false;
  try {
    const generationInput: GenerateRequest = {
      ideaText: effectiveBrief,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: attachmentEvidence.mediaAssets,
      language: input.language,
      brandBrain: context.brain,
      customRules: context.rules.map((rule) => `${rule.type}: ${rule.detail}`),
      industryPackIds: context.industryPackIds
    };
    const outputs = await generateKitOutputs(generationInput, { modelTier: planLimit.modelTier });
    const kit: ContentKit = {
      id: contentKitId,
      ideaText: brief,
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
    return {
      kit,
      plan: planLimit.plan,
      used,
      limit: planLimit.limit,
      available: reservation.available,
      cost,
      hasBrandMemory: getBrainCompleteness(context.brain) > 0
    };
  } catch (error) {
    // A persisted kit may have produced a valid result even if its settlement
    // acknowledgement timed out. Keep that started operation for review rather
    // than later auto-refunding a real provider invocation.
    if (!kitPersisted) await billing.refundFailedGeneration().catch(() => undefined);
    throw error;
  }
}

export async function getMcpContentKit(userId: string, kitId: string): Promise<ContentKit | null> {  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");

  let result = await supabase
    .from("content_kits")
    .select(KIT_SELECT_FIELDS)
    .eq("id", kitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error && /xhs_workflow_id|xhs_artifact_version_ids|schema cache/i.test(result.error.message ?? "")) {
    result = await supabase
      .from("content_kits")
      .select(LEGACY_KIT_SELECT_FIELDS)
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
  }
  if (result.error) throw new Error("Could not load the Finfold content kit. Please try again.");
  if (!result.data) return null;

  const [kit] = await attachVisualAssets(supabase, [mapContentKitRow(result.data)]);
  return kit;
}

export async function listMcpContentKits(
  userId: string,
  limit: number
): Promise<{ kits: McpContentKitSummary[]; hasMore: boolean }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");

  const result = await supabase
    .from("content_kits")
    .select("id, idea_text, platforms, status, created_at, kit_outputs(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (result.error) throw new Error("Could not load the recent Finfold content kits. Please try again.");

  const rows = (result.data ?? []) as Array<{
    id: unknown;
    idea_text?: unknown;
    platforms?: unknown;
    status?: unknown;
    created_at?: unknown;
    kit_outputs?: Array<{ title?: unknown }> | null;
  }>;
  return {
    hasMore: rows.length > limit,
    kits: rows.slice(0, limit).map((row) => {
      const idea = String(row.idea_text ?? "").trim();
      const firstOutputTitle = row.kit_outputs?.find((output) => String(output.title ?? "").trim())?.title;
      const title = String(firstOutputTitle ?? "").trim() || idea.slice(0, 80) || "Finfold content kit";
      return {
        kitId: String(row.id),
        title,
        briefExcerpt: idea.slice(0, 240),
        platforms: Array.isArray(row.platforms) ? row.platforms.map(String) : [],
        status: String(row.status ?? "saved"),
        createdAt: String(row.created_at ?? "")
      };
    })
  };
}

export type McpBrandMemoryPatch = {
  identity_type?: "personal" | "brand" | "hybrid";
  brand_name?: string;
  product_description?: string;
  target_audience?: string;
  positioning_statement?: string;
  tone_keywords?: string[];
  banned_phrases?: string[];
  competitors?: string[];
};

export async function getMcpBrandMemory(
  userId: string
): Promise<{
  identity_type: BrandBrain["identityType"];
  brand_name: string;
  product_description: string;
  target_audience: string;
  positioning_statement: string;
  tone_keywords: string[];
  banned_phrases: string[];
  approved_examples: string[];
  competitors: string[];
  learned_style: string[];
  learned_negative: string[];
  completeness: number;
  has_brand_memory: boolean;
}> {
  const { brain } = await getMcpBrandContext(userId);
  const completeness = getBrainCompleteness(brain);
  return {
    identity_type: brain.identityType,
    brand_name: brain.brandName,
    product_description: brain.productDescription,
    target_audience: brain.targetAudience,
    positioning_statement: brain.positioningStatement,
    tone_keywords: brain.toneKeywords,
    banned_phrases: brain.bannedPhrases,
    approved_examples: brain.approvedExamples,
    competitors: brain.competitors,
    learned_style: brain.learnedStyle,
    learned_negative: brain.learnedNegative,
    completeness,
    has_brand_memory: completeness > 0
  };
}

export async function updateMcpBrandMemory(
  userId: string,
  patch: McpBrandMemoryPatch
): Promise<{
  updated: true;
  brand_name: string;
  changed_fields: string[];
  completeness: number;
}> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");

  const { data: existing } = await supabase.from("brand_brains").select(BRAND_BRAIN_COLUMNS).eq("user_id", userId).maybeSingle();
  const current = mapBrandBrainFromRow(existing);

  // Mirror the merge semantics of the in-app Agent's update_brand_brain tool:
  // scalar fields replace, list fields append with de-duplication and schema
  // caps, so an external agent can enrich memory without wiping it.
  const dedupeAppend = (base: string[], extra?: string[]) =>
    extra?.length ? Array.from(new Set([...base, ...extra.map((item) => item.trim()).filter(Boolean)])) : base;
  const changedFields: string[] = [];
  // An absent field keeps the stored value; only a field the caller actually
  // sent may replace it — otherwise a partial patch would wipe every other
  // scalar back to the empty string.
  const scalarIfChanged = (next: string | undefined, before: string, field: string, apply: (value: string) => string) => {
    if (next === undefined || next === before) return before;
    changedFields.push(field);
    return apply(next);
  };

  const next = brandBrainSchema.parse({
    ...current,
    identityType: patch.identity_type && patch.identity_type !== current.identityType
      ? (changedFields.push("identity_type"), patch.identity_type)
      : current.identityType,
    brandName: scalarIfChanged(patch.brand_name, current.brandName, "brand_name", (value) => value.trim().slice(0, 60)),
    productDescription: scalarIfChanged(patch.product_description, current.productDescription, "product_description", (value) => value.trim().slice(0, 500)),
    targetAudience: scalarIfChanged(patch.target_audience, current.targetAudience, "target_audience", (value) => value.trim().slice(0, 300)),
    positioningStatement: scalarIfChanged(patch.positioning_statement, current.positioningStatement, "positioning_statement", (value) => value.trim().slice(0, 300)),
    toneKeywords: dedupeAppend(current.toneKeywords, patch.tone_keywords).slice(0, 10),
    bannedPhrases: dedupeAppend(current.bannedPhrases, patch.banned_phrases).slice(0, 20),
    competitors: dedupeAppend(current.competitors, patch.competitors).slice(0, 10)
  });
  if (patch.tone_keywords?.length && next.toneKeywords.length !== current.toneKeywords.length) changedFields.push("tone_keywords");
  if (patch.banned_phrases?.length && next.bannedPhrases.length !== current.bannedPhrases.length) changedFields.push("banned_phrases");
  if (patch.competitors?.length && next.competitors.length !== current.competitors.length) changedFields.push("competitors");
  if (changedFields.length === 0) {
    return { updated: true as const, brand_name: current.brandName, changed_fields: [], completeness: getBrainCompleteness(current) };
  }

  const row = mapBrandBrainToRow(next);
  // learnedStyle/learnedNegative/performanceRules are system-managed and must
  // survive an external merge exactly like app/api/brand-brain PUT does.
  row.learned_style = current.learnedStyle;
  row.learned_negative = current.learnedNegative;
  row.performance_rules = current.performanceRules;

  const { error } = await supabase
    .from("brand_brains")
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("Could not save the Brand Memory update. Please try again.");

  return {
    updated: true as const,
    brand_name: next.brandName,
    changed_fields: Array.from(new Set(changedFields)),
    completeness: getBrainCompleteness(next)
  };
}

function toPublicGrowthBriefing(briefing: GrowthBriefing) {
  return {
    platform: briefing.platform,
    sample_size: briefing.sampleSize,
    headline: briefing.headline,
    summary: briefing.summary,
    north_star: briefing.northStar,
    funnel: briefing.funnel,
    priorities: briefing.priorities,
    experiment: briefing.experiment
      ? {
          name: briefing.experiment.name,
          hypothesis: briefing.experiment.hypothesis,
          primary_metric: briefing.experiment.primaryMetric,
          platform: briefing.experiment.platform,
          variants: briefing.experiment.variants.map((variant) => ({
            name: variant.name,
            angle: variant.angle,
            hook_instruction: variant.hookInstruction,
            format: variant.format
          }))
        }
      : null,
    missing_data: briefing.missingData,
    daily_impressions: briefing.dailyImpressions ?? [],
    funnel_totals: briefing.funnelTotals ?? null
  };
}

export async function getMcpGrowthBriefing(
  userId: string,
  locale: GrowthBriefingLocale,
  platform?: string
): Promise<ReturnType<typeof toPublicGrowthBriefing>> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Finfold MCP is not configured. Ask the workspace owner to configure Supabase.");
  const parsed = platform ? platformIdSchema.safeParse(platform) : null;
  if (platform && !parsed?.success) {
    throw new Error("That platform is not supported by Finfold growth analytics.");
  }
  const briefing = await loadGrowthBriefing(supabase, userId, locale, parsed?.success ? parsed.data : undefined);
  return toPublicGrowthBriefing(briefing);
}

function defaultMcpAttachmentBrief(names: string[]): string {
  return `Analyze the attached source files (${names.slice(0, 6).join(", ")}), identify the product, audience, evidence, differentiators, and constraints, then create specific platform-native content grounded in those files.`;
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
