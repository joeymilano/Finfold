// Credits billing layer — the single place that talks to the credit_*
// Postgres functions added in migration 044. Route handlers and the MCP
// service go through here instead of the legacy reserve_generation_credit
// (migration 008), so a generation now costs a variable number of credits
// depending on what it actually did (ACTION_CREDITS), not a flat "1 kit".
//
// All functions fail open to "allow" in local mock mode (no Supabase) and
// throw a clear persistence-unavailable message otherwise — matching the
// existing pattern in app/api/generate/route.ts.

import {
  PLAN_CREDITS,
  type ActionKey,
  type CreditPack,
  type CreditSpendSummary,
  type PlanId,
} from "@/lib/payment/types";
import type { QrcodePlanId } from "@/lib/payment/qrcode-constants";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { EXTENSION_REVIEW_CREDITS, EXTENSION_REVIEW_PERIOD, extensionReviewExpiry, isExtensionReviewUser } from "@/lib/payment/extension-review";

export type CreditReservation = {
  /** Total credits still spendable after this reservation (all live batches). */
  available: number;
  /** What this call cost. */
  cost: number;
};

export type CreditAllowanceSnapshot = {
  /** Credits consumed from the current plan batch. */
  used: number;
  /** Total spendable credits across all live batches. */
  available: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCreditAllowanceSnapshot(value: unknown): CreditAllowanceSnapshot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["periodKey", "used", "available"]) ||
    typeof value.periodKey !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.periodKey) ||
    !isNonNegativeSafeInteger(value.used) ||
    !isNonNegativeSafeInteger(value.available)
  ) {
    return null;
  }

  return { used: value.used, available: value.available };
}

function parseCreditSpendSummary(value: unknown): CreditSpendSummary | null {
  const keys = [
    "items",
    "grossReserved",
    "refunded",
    "netCharged",
    "manualCredits",
    "manualDebits",
    "expiredCredits"
  ];
  if (!isRecord(value) || !hasExactKeys(value, keys) || !Array.isArray(value.items)) {
    return null;
  }
  if (
    !isNonNegativeSafeInteger(value.grossReserved) ||
    !isNonNegativeSafeInteger(value.refunded) ||
    !isNonNegativeSafeInteger(value.netCharged) ||
    !isNonNegativeSafeInteger(value.manualCredits) ||
    !isNonNegativeSafeInteger(value.manualDebits) ||
    !isNonNegativeSafeInteger(value.expiredCredits) ||
    value.netCharged !== Math.max(0, value.grossReserved - value.refunded)
  ) {
    return null;
  }

  const items: CreditSpendSummary["items"] = [];
  const actions = new Set<string>();
  let itemTotal = 0;
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["action", "credits"]) ||
      typeof item.action !== "string" ||
      item.action.trim().length === 0 ||
      item.action === "adjustment" ||
      item.action === "expire" ||
      !isNonNegativeSafeInteger(item.credits) ||
      item.credits === 0 ||
      actions.has(item.action)
    ) {
      return null;
    }
    itemTotal += item.credits;
    if (!Number.isSafeInteger(itemTotal)) return null;
    actions.add(item.action);
    items.push({ action: item.action, credits: item.credits });
  }
  if (itemTotal !== value.grossReserved) return null;

  return {
    items,
    grossReserved: value.grossReserved,
    refunded: value.refunded,
    netCharged: value.netCharged,
    manualCredits: value.manualCredits,
    manualDebits: value.manualDebits,
    expiredCredits: value.expiredCredits
  };
}

/** "YYYY-MM" for the current UTC billing cycle. */
export function currentPeriodKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ISO timestamp at which a given period_key's plan credits expire (next cycle start, UTC). */
export function periodKeyExpiry(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`;
}

/** ISO timestamp at which a period_key's billing cycle BEGAN (1st day, 00:00 UTC).
 *  Used to scope the spend-summary ledger query to "this cycle only". */
export function periodKeyStart(periodKey: string): string {
  return `${periodKey}-01T00:00:00Z`;
}

/**
 * Lazily grants the plan's monthly credits if no plan batch exists for this
 * cycle yet. Idempotent (grant_plan_credits ON CONFLICT DO NOTHING). Call
 * before reserving and from entitlements/check so the UsageMeter sees the
 * allowance even before the first generation.
 */
export async function ensurePlanCredits(userId: string, plan: PlanId | "free"): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return;
    throw new Error(persistenceUnavailableMessage("Credits grant"));
  }
  // Keep the configured ID after expiry: it must never fall back to monthly grants.
  if (isExtensionReviewUser(userId)) {
    const expiresAt = extensionReviewExpiry(userId);
    if (!expiresAt) return;
    const { error } = await supabase.rpc("grant_plan_credits", {
      p_user_id: userId,
      p_credits: EXTENSION_REVIEW_CREDITS,
      p_period_key: EXTENSION_REVIEW_PERIOD,
      p_expires_at: expiresAt
    });
    if (error) throw new Error("Review allowance could not be verified.");
    return;
  }
  const snapshotAt = new Date();
  const periodKey = currentPeriodKey(snapshotAt);
  await supabase.rpc("grant_plan_credits", {
    p_user_id: userId,
    p_credits: PLAN_CREDITS[plan],
    p_period_key: periodKey,
    p_expires_at: periodKeyExpiry(periodKey)
  });
}

/** Total credits spendable right now (plan + purchase + refund, minus expired). */
export async function getAvailableCredits(userId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return isLocalMockMode() ? 9999 : 0;
  const { data, error } = await supabase.rpc("get_available_credits", { p_user_id: userId });
  if (error) {
    console.error("[credits] get_available_credits failed:", JSON.stringify(error));
    return 0;
  }
  return Number(data ?? 0);
}

/** This cycle's plan-batch `used` value, for the UsageMeter progress bar. */
export async function getPlanBatchUsed(userId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;
  const { data } = await supabase
    .from("credit_balances")
    .select("used")
    .eq("user_id", userId)
    .eq("source", "plan")
    .eq("period_key", currentPeriodKey())
    .maybeSingle();
  return Number(data?.used ?? 0);
}

/**
 * Reads both values used by the post-generation allowance UI as one
 * all-or-nothing snapshot. Unlike the legacy scalar helpers above, this must
 * never turn a failed or malformed authoritative read into a believable zero:
 * callers omit the allowance when the snapshot is unavailable.
 */
export async function getCreditAllowanceSnapshot(
  userId: string
): Promise<CreditAllowanceSnapshot | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return isLocalMockMode() ? { used: 0, available: 9999 } : null;
  }

  try {
    // The SQL RPC aggregates plan usage and all live batches inside one
    // statement. No balance rows cross the PostgREST boundary, so row caps and
    // pagination cannot produce a plausible but incomplete total.
    const { data, error } = await supabase.rpc("get_credit_allowance_snapshot", {
      p_user_id: userId
    });
    if (error) {
      console.error("[credits] allowance snapshot query failed");
      return null;
    }

    const snapshot = parseCreditAllowanceSnapshot(data);
    if (!snapshot) {
      console.error("[credits] allowance snapshot returned an invalid shape");
      return null;
    }
    return snapshot;
  } catch {
    console.error("[credits] allowance snapshot query failed");
    return null;
  }
}

/**
 * Atomic FIFO reservation across the user's live balance batches. Returns the
 * remaining available credits + the cost, or null if the balance is
 * insufficient (nothing is deducted in that case).
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  action: ActionKey | string,
  source = "workbench",
  detail?: Record<string, unknown>
): Promise<CreditReservation | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return { available: 9999, cost: amount };
    throw new Error(persistenceUnavailableMessage("Credits reservation"));
  }
  if (amount <= 0) {
    return { available: await getAvailableCredits(userId), cost: 0 };
  }
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_action: action,
    p_source: source,
    p_detail: detail ?? null
  });
  if (error) {
    console.error("[credits] reserve_credits failed:", JSON.stringify(error));
    throw new Error("Failed to reserve credits. Please try again.");
  }
  const available = Number(data);
  return available < 0 ? null : { available, cost: amount };
}

/** Refund credits after a failed generation (failure must never bill — §10.3). */
export async function refundCredits(
  userId: string,
  amount: number,
  action = "refund",
  detail?: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return;
    throw new Error(persistenceUnavailableMessage("Credits refund"));
  }
  const { error } = await supabase.rpc("refund_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_action: action,
    p_detail: detail ?? null
  });
  if (error) console.error("[credits] refund_credits failed:", JSON.stringify(error));
}

type CreditSpendTransactionRow = {
  action: unknown;
  delta: unknown;
};

/**
 * Pure mirror of the SQL read-model semantics for focused unit coverage.
 * Operator adjustments are balance changes, not user action attempts/refunds.
 */
export function summarizeCreditSpendTransactions(
  rows: ReadonlyArray<CreditSpendTransactionRow>
): CreditSpendSummary | null {
  const creditsByAction = new Map<string, number>();
  let grossReserved = 0;
  let refunded = 0;
  let manualCredits = 0;
  let manualDebits = 0;
  let expiredCredits = 0;

  for (const row of rows) {
    if (typeof row.action !== "string" || row.action.trim().length === 0) return null;
    if (typeof row.delta !== "number" || !Number.isSafeInteger(row.delta)) return null;
    const delta = row.delta;

    if (row.action === "adjustment") {
      if (delta > 0) {
        const nextManualCredits = manualCredits + delta;
        if (!Number.isSafeInteger(nextManualCredits)) return null;
        manualCredits = nextManualCredits;
      } else if (delta < 0) {
        const nextManualDebits = manualDebits - delta;
        if (!Number.isSafeInteger(nextManualDebits)) return null;
        manualDebits = nextManualDebits;
      }
      continue;
    }

    if (row.action === "expire") {
      if (delta < 0) {
        const nextExpiredCredits = expiredCredits - delta;
        if (!Number.isSafeInteger(nextExpiredCredits)) return null;
        expiredCredits = nextExpiredCredits;
      }
      continue;
    }

    if (delta < 0) {
      const credits = -delta;
      const nextGross = grossReserved + credits;
      const nextActionTotal = (creditsByAction.get(row.action) ?? 0) + credits;
      if (!Number.isSafeInteger(nextGross) || !Number.isSafeInteger(nextActionTotal)) {
        return null;
      }
      grossReserved = nextGross;
      creditsByAction.set(row.action, nextActionTotal);
    } else if (delta > 0 && row.action === "refund") {
      const nextRefunded = refunded + delta;
      if (!Number.isSafeInteger(nextRefunded)) return null;
      refunded = nextRefunded;
    }
  }

  const items = Array.from(creditsByAction, ([action, credits]) => ({ action, credits }))
    .sort((left, right) => right.credits - left.credits || left.action.localeCompare(right.action));

  return {
    items,
    grossReserved,
    refunded,
    netCharged: Math.max(0, grossReserved - refunded),
    manualCredits,
    manualDebits,
    expiredCredits
  };
}

/**
 * Reads one explicitly bounded cycle through a SQL aggregate RPC. The result
 * crosses PostgREST as one JSON object, avoiding ledger row caps while keeping
 * gross action attempts, refunds, net charged, and manual adjustments in one
 * PostgreSQL statement snapshot.
 */
export async function getCreditSpendSummary(
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<CreditSpendSummary | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return isLocalMockMode()
      ? {
          items: [],
          grossReserved: 0,
          refunded: 0,
          netCharged: 0,
          manualCredits: 0,
          manualDebits: 0,
          expiredCredits: 0
        }
      : null;
  }

  const periodStartMs = Date.parse(periodStart);
  const periodEndMs = Date.parse(periodEnd);
  if (
    !Number.isFinite(periodStartMs) ||
    !Number.isFinite(periodEndMs) ||
    periodStartMs >= periodEndMs
  ) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("get_credit_spend_summary_snapshot", {
      p_user_id: userId,
      p_period_start: periodStart,
      p_period_end: periodEnd
    });
    if (error) {
      console.error("[credits] credit spend summary query failed");
      return null;
    }

    const summary = parseCreditSpendSummary(data);
    if (!summary) {
      console.error("[credits] credit spend summary returned an invalid shape");
      return null;
    }
    return summary;
  } catch {
    console.error("[credits] credit spend summary query failed");
    return null;
  }
}

// ---- Top-up purchases (§10.4) --------------------------------------------
// A top-up is a one-off purchase of long-lived credits. The checkout route
// creates a `pending` credit_purchases row first (so there's an order record
// AND the webhook can grant by id without trusting a client-sent amount),
// then the Creem webhook calls grant_purchase_credits (migration 045) to
// fulfill it atomically: create balance batch + ledger tx + flip to paid.

/** Optional overrides when recording a pending purchase.
 *  Defaults keep the original Creem behavior; the QR-code (经营码) path passes
 *  provider='alipay_qrcode', a tail-adjusted amountCents, an order_code, and
 *  an expires_at so the reconcile flow can match payments precisely. */
export type CreatePurchaseOptions = {
  /** provider column value. Defaults to 'creem'. QR-code path uses 'alipay_qrcode'. */
  provider?: string;
  /** Settlement currency stored on the order. Creem is USD; Alipay QR is CNY. */
  currency?: "usd" | "cny";
  /** Exact amount in the currency's minor unit. Defaults to the pack's matching
   *  USD/CNY price. QR-code orders pass a random 1–99 fen tail for matching. */
  amountCents?: number;
  /** Short order code (FF-XXXXXXXX). QR-code path only. */
  orderCode?: string;
  /** ISO timestamp after which the order is considered expired. QR-code path only. */
  expiresAt?: string;
  /** Plan id for a QR-code SUBSCRIPTION order. NULL/omitted =
   *  a credit-pack order. Only meaningful with provider='alipay_qrcode'. */
  plan?: QrcodePlanId | "starter" | "pro";
};

/**
 * Records a `pending` credit_purchases order for a top-up pack. Returns the
 * new row id so the checkout route can embed it in Creem metadata; the
 * webhook later fulfills by that id, reading credits back out of the row
 * (never trusting a webhook-supplied amount).
 *
 * `options` opts out of the Creem defaults for the QR-code (经营码) reconcile
 * path without changing any existing caller — see lib/payment/qrcode-orders.ts.
 */
export async function createPendingPurchase(
  userId: string,
  pack: CreditPack,
  options?: CreatePurchaseOptions
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return null;
    throw new Error(persistenceUnavailableMessage("Credit purchase"));
  }
  const provider = options?.provider ?? "creem";
  const currency = options?.currency ?? (provider === "creem" ? "usd" : "cny");
  const defaultAmountCents = Math.round(
    (currency === "usd" ? pack.priceUSD : pack.priceCNY) * 100
  );
  const row: Record<string, unknown> = {
    user_id: userId,
    credits: pack.credits,
    amount_cents: options?.amountCents ?? defaultAmountCents,
    currency,
    provider,
    status: "pending"
  };
  if (options?.orderCode) row.order_code = options.orderCode;
  if (options?.expiresAt) row.expires_at = options.expiresAt;
  if (options?.plan) row.plan = options.plan;

  const { data, error } = await supabase
    .from("credit_purchases")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error("[credits] createPendingPurchase failed:", JSON.stringify(error));
    throw new Error("Failed to create credit purchase order.");
  }
  return data.id;
}

/**
 * Fulfills a paid top-up by calling grant_purchase_credits (migration 045),
 * which atomically creates the long-lived purchase balance batch, writes the
 * ledger transaction, and flips credit_purchases pending → paid. Idempotent —
 * a replayed webhook re-returns the existing balance_id without re-granting.
 * Returns the balance_id, or null if the purchase is unknown / not in a
 * fulfillable state (so the caller can ack the webhook without retrying).
 */
export async function grantPurchaseCredits(
  purchaseId: string,
  providerCheckoutId?: string
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return null;
    throw new Error(persistenceUnavailableMessage("Credit purchase fulfillment"));
  }
  const { data, error } = await supabase.rpc("grant_purchase_credits", {
    p_purchase_id: purchaseId,
    p_provider_checkout_id: providerCheckoutId ?? null
  });
  if (error) {
    console.error("[credits] grant_purchase_credits failed:", JSON.stringify(error));
    return null;
  }
  return (data as string | null) ?? null;
}
