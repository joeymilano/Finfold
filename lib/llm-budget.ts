import type { TokenUsage } from "@/lib/observability";

/**
 * Imported lazily from lib/supabase-admin (which never touches
 * next/headers), so the webpack module graph of client-reachable
 * importers stays legal in every compile target. Every budget call runs
 * server-side at request time; the dynamic import preserves that while
 * keeping the eager module graph small.
 */
async function supabaseAdmin() {
  const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
  return createSupabaseAdminClient();
}

/**
 * Hard monthly CNY cap for paid direct-LLM providers that declare
 * `monthlyBudgetCny` in LLM_PROVIDERS (see wrangler.toml). Mirrors
 * lib/workers-ai-budget.ts: every attempt reserves a fixed conservative
 * estimate through an atomic Supabase RPC, a failed attempt refunds it, and
 * a successful attempt settles the real token usage (refunding the unused
 * difference). Fails CLOSED: if the ledger is unreachable the provider is
 * treated as over budget and the chain moves on, so a broken check can
 * never turn into an unbudgeted paid spend.
 */

const PRICING_ENV = "LLM_PRICING_CNY_PER_1M";
const RESERVE_ENV = "LLM_BUDGET_RESERVE_CNY";
/**
 * Conservative per-attempt reservation. A typical chat turn (≈8k input +
 * ≈4k output on qwen3.8-flash list prices) costs ≈¥0.018, so ¥0.05 covers
 * it with headroom; concurrent attempts only over-reserve within this
 * window and successful calls refund the difference immediately.
 */
const DEFAULT_RESERVE_CNY = 0.05;

/**
 * DashScope list prices (CNY per 1M tokens), verified 2026-09 against the
 * official model pricing page. Deployments can override or extend via
 * LLM_PRICING_CNY_PER_1M using "provider:model" (specific) or bare "model"
 * keys, mirroring LLM_PRICING_USD_PER_1M.
 */
const DEFAULT_PRICING_CNY: Record<string, { input: number; output: number }> = {
  "qwen-token-plan:qwen3.8-flash": { input: 0.8, output: 2.7 },
  "qwen3.8-flash": { input: 0.8, output: 2.7 }
};

/** Calendar month (YYYY-MM) in Asia/Shanghai, the DashScope billing zone. */
export function currentBudgetMonth(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  }).format(now);
}

export function llmBudgetReserveCny(): number {
  const configured = Number(process.env[RESERVE_ENV]);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RESERVE_CNY;
}

/**
 * Estimates a call's real cost in CNY from token usage. Returns null when
 * the model has no known price — callers must then keep the full reserve
 * (never under-count an unpriced paid call).
 */
export function estimateModelCostCny(
  provider: string,
  model: string,
  usage: TokenUsage,
  rawPricing = process.env[PRICING_ENV]
): number | null {
  let pricing: Record<string, { input?: unknown; output?: unknown }> = DEFAULT_PRICING_CNY;
  if (rawPricing) {
    try {
      pricing = { ...DEFAULT_PRICING_CNY, ...(JSON.parse(rawPricing) as typeof pricing) };
    } catch {
      // Fall back to the built-in table rather than silently unpricing.
    }
  }
  const entry = pricing[`${provider}:${model}`] ?? pricing[model];
  if (
    !entry ||
    typeof entry.input !== "number" || !Number.isFinite(entry.input) || entry.input < 0 ||
    typeof entry.output !== "number" || !Number.isFinite(entry.output) || entry.output < 0
  ) {
    return null;
  }
  const cost = (usage.inputTokens * entry.input + usage.outputTokens * entry.output) / 1_000_000;
  return Number(cost.toFixed(6));
}

/**
 * Resolves which providers carry a monthly budget. Memoized per raw
 * LLM_PROVIDERS string so tests that stub the env var re-parse correctly.
 */
let budgetedCacheRaw: string | undefined;
let budgetedCache: Map<string, number> | undefined;

export function budgetedProviderNames(rawProviders = process.env.LLM_PROVIDERS): Map<string, number> {
  if (budgetedCacheRaw === rawProviders && budgetedCache) return budgetedCache;
  const result = new Map<string, number>();
  if (rawProviders) {
    try {
      for (const entry of JSON.parse(rawProviders) as Array<{ name?: string; monthlyBudgetCny?: unknown }>) {
        if (
          entry && typeof entry.name === "string" && entry.name &&
          typeof entry.monthlyBudgetCny === "number" &&
          Number.isFinite(entry.monthlyBudgetCny) && entry.monthlyBudgetCny > 0
        ) {
          result.set(entry.name, entry.monthlyBudgetCny);
        }
      }
    } catch {
      // A malformed chain has no budgeted providers; resolution elsewhere
      // already logs the parse failure.
    }
  }
  budgetedCacheRaw = rawProviders;
  budgetedCache = result;
  return result;
}

/**
 * Atomically reserves one attempt's estimate against the provider's monthly
 * cap. Fails closed on any ledger error (missing Supabase config, RPC
 * failure, network issue) so the failover chain continues to the next
 * provider instead of risking an unbudgeted spend.
 */
export async function reserveLLMBudget(providerName: string, budgetCny: number): Promise<boolean> {
  const admin = await supabaseAdmin();
  if (!admin) return false;
  try {
    const { data, error } = await admin
      .rpc("consume_llm_monthly_budget", {
        p_provider: providerName,
        p_month: currentBudgetMonth(),
        p_amount_cny: llmBudgetReserveCny(),
        p_budget_cny: budgetCny
      })
      .single();
    if (error || !data) return false;
    return (data as { allowed: boolean }).allowed === true;
  } catch {
    return false;
  }
}

/**
 * After a successful attempt, settles the real usage: the fixed reserve is
 * refunded down to the estimated actual cost (or kept whole when the model
 * is unpriced). Best-effort — a failure only leaves the budget slightly
 * over-counted, never over-spent.
 */
export async function settleLLMBudget(
  provider: string,
  model: string,
  usage: TokenUsage
): Promise<void> {
  const budget = budgetedProviderNames().get(provider);
  if (budget === undefined) return;
  const actual = estimateModelCostCny(provider, model, usage);
  const refund = actual === null ? llmBudgetReserveCny() : Math.max(0, llmBudgetReserveCny() - actual);
  if (refund <= 0) return;
  await releaseBudgetCny(provider, refund);
}

/** Returns the full attempt reserve after a failed paid attempt. */
export async function refundLLMBudget(provider: string): Promise<void> {
  if (!budgetedProviderNames().has(provider)) return;
  await releaseBudgetCny(provider, llmBudgetReserveCny());
}

async function releaseBudgetCny(provider: string, amountCny: number): Promise<void> {
  const admin = await supabaseAdmin();
  if (!admin) return;
  try {
    await admin.rpc("release_llm_monthly_budget", {
      p_provider: provider,
      p_month: currentBudgetMonth(),
      p_amount_cny: amountCny
    });
  } catch (error) {
    console.warn("[llm-budget] failed to adjust monthly budget:", error instanceof Error ? error.message : error);
  }
}
