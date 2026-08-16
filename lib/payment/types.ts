// Shared payment types — provider-agnostic
// Replaces PlanId / PLAN_MONTHLY_LIMITS previously in lib/stripe.ts

/**
 * Existing subscribers keep the original ids. Pricing V2 writes versioned
 * ids so a displayed price is never used to infer an entitlement or silently
 * reprice a legacy subscription.
 */
export type LegacyPlanId = "starter" | "pro" | "growth" | "employee";
export type V2PlanId = "starter_v2" | "creator_v2" | "growth_v2" | "digital_employee_v2";
export type PlanId = LegacyPlanId | V2PlanId;
export type PaymentProviderId = "creem" | "wechat" | "alipay";
export type Region = "CN" | "INTL";

/** LLM strength tier a plan generates with — see lib/llm.ts for the model
 * handles each tier maps to. Pricing (lib/brand.ts §5 of the plan) is
 * anchored on this: haiku kits cost cents, opus+research kits cost real
 * money, so the tier a plan gets must match what it pays. */
export type ModelTier = "haiku" | "sonnet" | "opus";

export const PLAN_MONTHLY_LIMITS: Record<PlanId | "free", number> = {
  // The free plan is a complete proof cycle, not a blurred product demo.
  // One usable kit is enough to generate, publish, record performance, and
  // decide whether the repeatable workflow is worth paying for.
  free: 1,
  starter: 30,
  pro: 100,
  growth: 250,
  // "Unlimited (fair use)" per the pricing plan — modeled as a very high
  // number rather than a magic -1 sentinel so all limit-comparison code
  // (reserve_generation_credit, UsageMeter progress bars) works unchanged.
  employee: 100_000,
  starter_v2: 20,
  creator_v2: 100,
  growth_v2: 250,
  digital_employee_v2: 100_000
};

/**
 * Credits granted per billing cycle per plan. This is the PRIMARY billing
 * unit — different AI actions consume different amounts (see ACTION_CREDITS),
 * so a one-line rewrite (1 credit) and a full multi-platform campaign with
 * research (30-100 credits) are no longer priced the same.
 *
 * Mapping from the legacy per-kit allowance: 1 content kit ≈ 30 credits
 * (CREDITS_PER_KIT), because a full kit costs 15-30 credits depending on
 * platform breadth and research depth. Paid tiers preserve the strict ratio
 * (30:100:250 kits → 900:3,000:7,500 credits). Free is intentionally lifted
 * above the strict 1×30 mapping (30 → 150) so a new user can finish a whole
 * proof cycle — multi-platform draft + research + scoring — not a single kit.
 *
 * Employee stays "fair use": a high ceiling rather than infinite, so the
 * UsageMeter progress bar and limit checks keep working without special cases.
 *
 * Free was lowered from 150 to 50 (2026-08-07): 150 let a free user run
 * ~7 full 3-platform kits/cycle (21 credits each via computeKitCost), far
 * past the "one complete proof cycle" this comment already described. 50
 * covers exactly that proof cycle — one 3-platform kit (21) + AI score/
 * optimize (2) + quick research (5) — with a buffer, not a repeatable free
 * workflow.
 */
export const PLAN_CREDITS: Record<PlanId | "free", number> = {
  free: 50,
  starter: 900,
  pro: 3_000,
  growth: 7_500,
  employee: 50_000,
  starter_v2: 600,
  creator_v2: 3_000,
  growth_v2: 7_500,
  digital_employee_v2: 50_000
};

/** How many credits one legacy content kit is worth. Kept as a constant so
 *  any code that still reasons in "kits" can convert. Paid tiers satisfy
 *  PLAN_CREDITS[p] === PLAN_MONTHLY_LIMITS[p] * CREDITS_PER_KIT. */
export const CREDITS_PER_KIT = 30;

// ---- Credit top-up packs (§10.4) -----------------------------------------
// One-off purchases of long-lived credits, sold separately from any
// subscription. Plan credits expire at cycle end; top-up credits never
// expire and are spent ONLY after plan credits run out — reserve_credits
// (044) orders batches `expires_at ASC NULLS LAST`, so the no-expiry purchase
// batches are consumed last (§10.4 "优先消耗即将过期的套餐额度").
//
// Top-up pricing is supplemental to subscription value: packs add durable
// credits but never grant higher-tier models, learning, reports, or automation.
// Smaller packs carry a flexibility premium and larger packs a volume discount.
// CNY and USD pack prices are explicit localized values rather than runtime FX.
//
// Each pack maps 1:1 to a Creem one-time product (CREEM_CREDIT_PACK_* in
// constants.ts). The webhook fulfills a purchase by reading credits back out
// of the credit_purchases row, so a tampered payload can never grant more
// than was actually paid for.

export type CreditPackId = "starter_pack" | "standard_pack" | "plus_pack" | "pro_pack";

export type CreditPack = {
  id: CreditPackId;
  name: string;
  nameCN: string;
  /** Credits granted. */
  credits: number;
  /** CNY price in yuan (not cents). amount_cents = round(priceCNY * 100). */
  priceCNY: number;
  /** USD price in dollars, mirroring the CNY→USD ratio used elsewhere. */
  priceUSD: number;
  /** Optional "best value" badge, displayed on the card. */
  badge?: { en: string; zh: string };
};

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "starter_pack",
    name: "Starter Pack",
    nameCN: "入门包",
    credits: 500,
    priceCNY: 49,
    priceUSD: 7
  },
  {
    id: "standard_pack",
    name: "Standard Pack",
    nameCN: "标准包",
    credits: 1_500,
    priceCNY: 129,
    priceUSD: 18
  },
  {
    id: "plus_pack",
    name: "Plus Pack",
    nameCN: "进阶包",
    credits: 4_000,
    priceCNY: 299,
    priceUSD: 42
  },
  {
    id: "pro_pack",
    name: "Pro Pack",
    nameCN: "专业包",
    credits: 10_000,
    priceCNY: 599,
    priceUSD: 84,
    badge: { en: "Best value", zh: "最划算" }
  }
];

/** Look up a pack by id (returns undefined for unknown ids — caller validates). */
export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/**
 * Per-action credit cost. This is what users see as the "price" of an
 * operation — the underlying token cost is NEVER exposed. Tune here when
 * model costs shift and the user-facing numbers stay stable, which is the
 * whole point of the credits abstraction (see billing-redesign §2).
 *
 * A full content kit is contentKitBase + perPlatformCopy × (platforms - 1),
 * optionally + quickResearch/deepResearch + standardImage/premiumVisual per
 * generated visual. Agent runs accumulate agentStep per executed step.
 */
export const ACTION_CREDITS = {
  /** Rewrite a single title or headline. */
  rewriteTitle: 1,
  /** Generate copy for one platform. */
  singlePlatformCopy: 3,
  /** Extra platform beyond the first in a kit. */
  perPlatformCopy: 3,
  /** Base cost of a full multi-platform content kit (covers strategy + draft). */
  contentKitBase: 15,
  /** AI quality scoring + one optimization pass. */
  aiScoreOptimize: 2,
  /** Analyze brand voice / tone from reference material. */
  brandVoiceAnalysis: 5,
  /** Quick web research (a few sources, light synthesis). */
  quickResearch: 5,
  /** Deep research with citations (many sources, structured synthesis). */
  deepResearch: 15,
  /** Generate one standard image. */
  standardImage: 8,
  /** Generate one high-quality marketing visual. */
  premiumVisual: 20,
  /** One executed step inside an Agent / automation run. */
  agentStep: 1
} as const;

export type ActionKey = keyof typeof ACTION_CREDITS;

/**
 * Cost of a full content-kit generation in credits — a pure function of
 * platform count and optional add-ons. Shared by the SERVER (reserve the exact
 * amount in reserve_credits) and the CLIENT (show a pre-generation estimate on
 * the Generate button), which is why it lives here in the dependency-free
 * types module instead of credits.ts (credits.ts pulls in the Supabase client
 * and must never end up in a client bundle).
 */
export function computeKitCost(
  platformCount: number,
  opts?: { research?: "quick" | "deep"; images?: number; premiumVisuals?: number }
): number {
  const base = ACTION_CREDITS.contentKitBase;
  const extraPlatforms = Math.max(0, platformCount - 1) * ACTION_CREDITS.perPlatformCopy;
  const research =
    opts?.research === "deep" ? ACTION_CREDITS.deepResearch
      : opts?.research === "quick" ? ACTION_CREDITS.quickResearch
        : 0;
  const images = (opts?.images ?? 0) * ACTION_CREDITS.standardImage;
  const premium = (opts?.premiumVisuals ?? 0) * ACTION_CREDITS.premiumVisual;
  return base + extraPlatforms + research + images + premium;
}

// ---- Spend breakdown (§10.2 "explain your credits") ----------------------
// The ledger records consumption under fine-grained ACTION_CREDITS keys
// (rewriteTitle, deepResearch, premiumVisual…). Showing all 11 keys raw is too
// noisy for a billing page, so we roll them up into a few user-facing
// categories: "内容生成 / 联网研究 / 视觉生成 / 质量与品牌 / Agent 自动化".
// Both the rollup map and the aggregation function live here in the
// dependency-free module so the client CreditSpendBreakdown component can
// import them without dragging the Supabase client into its bundle.

export type SpendCategoryKey = "generation" | "research" | "visuals" | "quality" | "agent" | "other";

/** Maps a raw transaction `action` (an ACTION_CREDITS key, or grant/refund/etc.)
 *  onto a user-facing spend category. Unknown actions fall into "other". */
export const ACTION_CATEGORY_OF: Record<string, SpendCategoryKey> = {
  rewriteTitle: "generation",
  singlePlatformCopy: "generation",
  perPlatformCopy: "generation",
  contentKitBase: "generation",
  aiScoreOptimize: "quality",
  brandVoiceAnalysis: "quality",
  quickResearch: "research",
  deepResearch: "research",
  standardImage: "visuals",
  premiumVisual: "visuals",
  agentStep: "agent"
};

/** Display order + localized labels for each spend category. "other" is last
 *  because it only catches future/unknown actions a user shouldn't usually see. */
export const SPEND_CATEGORIES: Record<SpendCategoryKey, { label: string; labelCN: string }> = {
  generation: { label: "Content generation", labelCN: "内容生成" },
  research: { label: "Research", labelCN: "联网研究" },
  visuals: { label: "Visuals", labelCN: "视觉生成" },
  quality: { label: "Quality & brand", labelCN: "质量与品牌" },
  agent: { label: "Agent automation", labelCN: "Agent 自动化" },
  other: { label: "Other", labelCN: "其他" }
};

/** Friendly labels for the raw action keys, shown when the user expands a
 *  category to see its line items. Falls back to the raw key for unknowns. */
export const ACTION_LABEL: Record<string, { label: string; labelCN: string }> = {
  rewriteTitle: { label: "Title rewrite", labelCN: "改写标题" },
  singlePlatformCopy: { label: "Single-platform copy", labelCN: "单平台文案" },
  perPlatformCopy: { label: "Extra platform copy", labelCN: "多平台文案" },
  contentKitBase: { label: "Content kit — strategy + draft", labelCN: "内容包（策略 + 草稿）" },
  aiScoreOptimize: { label: "AI scoring & optimize", labelCN: "AI 评分与优化" },
  brandVoiceAnalysis: { label: "Brand voice analysis", labelCN: "品牌语气分析" },
  quickResearch: { label: "Quick research", labelCN: "快速研究" },
  deepResearch: { label: "Deep research", labelCN: "深度研究" },
  standardImage: { label: "Standard image", labelCN: "普通图片" },
  premiumVisual: { label: "Premium visual", labelCN: "高质量视觉" },
  agentStep: { label: "Agent step", labelCN: "Agent 单步" }
};

export type SpendRow = { action: string; credits: number };

/** One cycle's ledger-derived billing presentation. Category rows remain gross
 *  so users can see which actions were attempted; refunds and the actual net
 *  charge are explicit totals instead of silently rewriting that history. */
export type CreditSpendSummary = {
  items: SpendRow[];
  grossReserved: number;
  refunded: number;
  netCharged: number;
  /** Operator-added Credits, separate from user actions and refunds. */
  manualCredits: number;
  /** Operator-removed Credits, separate from user actions and charges. */
  manualDebits: number;
  /** Unused expired Credits, separate from user actions and charges. */
  expiredCredits: number;
};

export type SpendCategoryRow = {
  category: SpendCategoryKey;
  credits: number;
  items: Array<SpendRow>;
};

/**
 * Rolls raw {action, credits} rows up into category buckets (sorted by credits
 * desc within the SPEND_CATEGORIES display order), dropping zero-credit
 * buckets. Pure — shared by the server (no double-aggregation needed) and the
 * client component, which is why it lives here rather than credits.ts.
 */
export function aggregateSpendByCategory(rows: ReadonlyArray<SpendRow>): Array<SpendCategoryRow> {
  const buckets = new Map<SpendCategoryKey, SpendCategoryRow>();
  for (const row of rows) {
    if (!row || row.credits <= 0) continue;
    const key = ACTION_CATEGORY_OF[row.action] ?? "other";
    const bucket = buckets.get(key) ?? { category: key, credits: 0, items: [] };
    bucket.credits += row.credits;
    bucket.items.push({ action: row.action, credits: row.credits });
    buckets.set(key, bucket);
  }
  // Sort each bucket's items by credits desc so the heaviest line item shows first.
  for (const bucket of buckets.values()) {
    bucket.items.sort((a, b) => b.credits - a.credits);
  }
  // Order buckets by the canonical SPEND_CATEGORIES order, then keep the
  // result stable. "other" naturally lands last.
  const order: SpendCategoryKey[] = ["generation", "research", "visuals", "quality", "agent", "other"];
  return order
    .map((k) => buckets.get(k))
    .filter((b): b is SpendCategoryRow => b != null && b.credits > 0);
}

/** How many platforms a single kit can target on each plan. */
export const PLAN_PLATFORM_LIMITS: Record<PlanId | "free", number> = {
  free: 3,
  starter: 6,
  pro: 14,
  growth: 14,
  employee: 14,
  starter_v2: 14,
  creator_v2: 14,
  growth_v2: 14,
  digital_employee_v2: 14
};

export const PLAN_MODEL_TIER: Record<PlanId | "free", ModelTier> = {
  free: "haiku",
  starter: "haiku",
  pro: "haiku",
  growth: "sonnet",
  employee: "opus",
  starter_v2: "haiku",
  creator_v2: "haiku",
  growth_v2: "sonnet",
  digital_employee_v2: "opus"
};

export type PlanFeatures = {
  /** Copy/export/save outputs instead of the blurred free preview. */
  canUseOutputs: boolean;
  /** Record performance metrics + get iteration suggestions. */
  canAnalyze: boolean;
  /** Brand Memory can be bootstrapped from a product URL instead of manual entry. */
  urlBootstrap: boolean;
  /** One-click LLM polish pass on a generated output. */
  polish: boolean;
  /** Edits distill into persistent style rules that feed future generations. */
  styleLearning: boolean;
  /** Full LLM-authored iteration report (vs. the free heuristic score). */
  iterateReport: boolean;
  /** Update-monitoring auto-draft + competitor tracking (the "digital employee" tier). */
  proactiveMonitoring: boolean;
  /** Agent chat can call tools that write guardrails/brand-brain/industry
   * packs, run style-learning, and run the Xiaohongshu diagnosis — not just
   * chat. Free users can still talk to the agent; tool calls are gated. */
  agentTools: boolean;
};

export const PLAN_FEATURES: Record<PlanId | "free", PlanFeatures> = {
  free: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: false,
    polish: false,
    styleLearning: false,
    iterateReport: false,
    proactiveMonitoring: false,
    agentTools: false
  },
  starter: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: false,
    polish: false,
    styleLearning: false,
    iterateReport: false,
    proactiveMonitoring: false,
    agentTools: true
  },
  pro: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: false,
    iterateReport: false,
    proactiveMonitoring: false,
    agentTools: true
  },
  growth: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: true,
    iterateReport: true,
    proactiveMonitoring: false,
    agentTools: true
  },
  employee: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: true,
    iterateReport: true,
    proactiveMonitoring: true,
    agentTools: true
  },
  starter_v2: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: false,
    polish: false,
    styleLearning: false,
    iterateReport: false,
    proactiveMonitoring: false,
    agentTools: true
  },
  creator_v2: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: false,
    iterateReport: false,
    proactiveMonitoring: false,
    agentTools: true
  },
  growth_v2: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: true,
    iterateReport: true,
    proactiveMonitoring: false,
    agentTools: true
  },
  digital_employee_v2: {
    canUseOutputs: true,
    canAnalyze: true,
    urlBootstrap: true,
    polish: true,
    styleLearning: true,
    iterateReport: true,
    proactiveMonitoring: true,
    agentTools: true
  }
};

/** Parameters for creating a checkout session */
export interface CreateCheckoutParams {
  plan: PlanId;
  /** Public Pricing V2 key, kept separate from the capability-tier id. */
  publicPlan?: "starter" | "creator" | "growth" | "digital_employee";
  /** Finfold UI language. Creem receives this as metadata for analytics;
   * hosted checkout chrome still follows the buyer's browser preference. */
  locale?: "zh" | "en";
  market?: "cn" | "global";
  currency?: "CNY" | "USD";
  price?: number;
  userId: string;
  email?: string;
  successUrl: string;
  cancelUrl: string;
  /** Routes checkout to the founding-member presale product (same "employee"
   * plan tier, locked-in discounted price) instead of the standard product
   * for `plan`. Only meaningful when plan === "employee". */
  foundingMember?: boolean;
}

/** Result returned after creating a checkout session */
export interface CheckoutResult {
  /** URL to redirect the user to complete payment */
  url: string;
  /** Which provider handled the checkout */
  provider: PaymentProviderId;
}

/** Interface every payment provider must implement */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Returns true if the provider has all required env vars configured */
  isConfigured(): boolean;
  /** Create a checkout session and return a redirect URL */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;
}
