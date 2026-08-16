// Alipay 经营码 (QR-code) orders — the transitional payment channel for
// Finfold.app before Finfold.cn finishes ICP filing and moves to the official
// Alipay "电脑网站支付" product.
//
// A 经营码 is a static receive-money QR code: NO order API, NO async notify
// callback, so payment can't be auto-detected. This module implements a
// semi-manual reconciliation flow that serves TWO purchase kinds:
//
//   • Credit-pack top-up  (plan IS NULL)  — createQrcodeOrder()
//   • Subscription month  (plan='starter_v2'|'creator_v2') — createQrcodePlanOrder()
//
// Both reuse the same table (credit_purchases, provider='alipay_qrcode'), the
// same precise-amount anchor (pack/plan price + random 1–99 分 tail), and the
// same operator confirm step. confirmQrcodeOrder() branches on `plan`:
//   - plan set    → grantQrcodePlan(): open the plan for 30 days
//   - plan null   → grantPurchaseCredits(): grant pack credits (RPC 045)
//
// Edge-runtime safe: randomness via Web Crypto (no Node `crypto`). No Alipay
// API call, no signing, no webhook — that's the whole point of this path.

import {
  PLAN_CREDITS,
  PLAN_MONTHLY_LIMITS,
  getCreditPack,
  type CreditPack
} from "@/lib/payment/types";
import {
  createPendingPurchase,
  ensurePlanCredits,
  grantPurchaseCredits
} from "@/lib/payment/credits";
import {
  QRCODE_PLANS,
  type QrcodePlanId
} from "@/lib/payment/qrcode-constants";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export { QRCODE_PLANS };
export type { QrcodePlanId };

/** provider value that marks a 经营码 order inside credit_purchases. */
export const QRCODE_PROVIDER = "alipay_qrcode";

/** One subscription month = 30 days (no calendar-month complexity). */
const PLAN_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a 经营码 order stays payable (env-tunable, default 120 min). */
function qrcodeOrderTtlMs(): number {
  const minutes = Number(process.env.ALIPAY_QRCODE_ORDER_TTL_MINUTES ?? 120);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 120 * 60_000;
}

export type QrcodeOrder = {
  id: string;
  userId: string;
  /** Short human-friendly code, e.g. "FF-A3F9B2C1". */
  orderCode: string;
  credits: number;
  /** Precise amount payable in 分 (price + random tail) — the recon anchor. */
  amountCents: number;
  /** "49.37" — display string derived from amountCents. */
  amountYuan: string;
  status: string;
  /** Pricing V2 self-serve plan for a subscription order; null for a credit-pack order. */
  plan: QrcodePlanId | null;
  expiresAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

/** Result of confirming an order — branches on what was fulfilled. */
export type ConfirmResult = {
  kind: "credits" | "plan";
  plan: QrcodePlanId | null;
  balanceId: string | null;
  /** True if the order was already fulfilled (idempotent no-op this call). */
  alreadyPaid: boolean;
};

/** Cents → "yuan.cents" display string. 4937 → "49.37". */
export function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

const HEX = "0123456789ABCDEF";
function randomHex(charCount: number): string {
  const bytes = new Uint8Array(Math.ceil(charCount / 2));
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    out += HEX[b >> 4] + HEX[b & 0x0f];
  }
  return out.slice(0, charCount);
}

/** Short human-friendly order code, e.g. "FF-A3F9B2C1". */
export function generateOrderCode(): string {
  return "FF-" + randomHex(8);
}

/** Random 1–99 分 tail added to the price so each live order amount is unique. */
function randomTailCents(): number {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 99) + 1;
}

type PurchaseRow = {
  id: string;
  user_id: string;
  credits: number;
  amount_cents: number;
  provider: string | null;
  status: string;
  order_code: string | null;
  plan: string | null;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
};

function rowToOrder(row: PurchaseRow): QrcodeOrder {
  return {
    id: row.id,
    userId: row.user_id,
    orderCode: row.order_code ?? "",
    credits: row.credits,
    amountCents: row.amount_cents,
    amountYuan: formatYuan(row.amount_cents),
    status: row.status,
    plan: (row.plan === "starter_v2" || row.plan === "creator_v2" ? row.plan : null),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at
  };
}

const SELECT_COLUMNS =
  "id, user_id, credits, amount_cents, provider, status, order_code, plan, expires_at, created_at, confirmed_at";

/**
 * Shared insert path for both credit-pack and subscription 经营码 orders.
 * `pack` supplies credits + fallback price; `baseCents` is the precise base
 * (pack.priceCNY*100 or plan price*100); `plan` is set for subscriptions.
 * The amount gets a random 1–99 分 tail unique among live orders.
 */
async function insertQrcodeOrder(
  userId: string,
  pack: CreditPack,
  baseCents: number,
  plan: QrcodePlanId | null
): Promise<QrcodeOrder> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return mockOrder(userId, pack, plan);
    throw new Error(persistenceUnavailableMessage("QR-code order"));
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + qrcodeOrderTtlMs()).toISOString();

  // Amounts still in play — the tail must not collide with another live order,
  // or two orders would map to the same Alipay receipt.
  const { data: liveRows } = await supabase
    .from("credit_purchases")
    .select("amount_cents")
    .eq("provider", QRCODE_PROVIDER)
    .eq("status", "pending")
    .gt("expires_at", nowIso);
  const usedAmounts = new Set(
    (liveRows ?? []).map((r: { amount_cents: number }) => r.amount_cents)
  );

  let amountCents = baseCents + randomTailCents();
  let guard = 0;
  while (usedAmounts.has(amountCents) && guard < 200) {
    amountCents = baseCents + randomTailCents();
    guard++;
  }

  // order_code carries a unique index — retry on the (vanishingly rare) collision.
  let created: { id: string; orderCode: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const orderCode = generateOrderCode();
    try {
      const id = await createPendingPurchase(userId, pack, {
        provider: QRCODE_PROVIDER,
        amountCents,
        orderCode,
        expiresAt,
        ...(plan ? { plan } : {})
      });
      if (id) created = { id, orderCode };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 23505 = unique_violation on order_code. Retry; anything else is real.
      if (!/23505|duplicate|order_code/i.test(msg) || attempt === 4) throw err;
    }
  }

  if (!created) {
    throw new Error("Failed to create QR-code order.");
  }

  return {
    id: created.id,
    userId,
    orderCode: created.orderCode,
    credits: pack.credits,
    amountCents,
    amountYuan: formatYuan(amountCents),
    status: "pending",
    plan,
    expiresAt,
    createdAt: nowIso,
    confirmedAt: null
  };
}

/** Create a pending 经营码 order for a credit-pack top-up. */
export async function createQrcodeOrder(
  userId: string,
  packId: string
): Promise<QrcodeOrder> {
  const pack = getCreditPack(packId);
  if (!pack) {
    throw new Error("Unknown credit package.");
  }
  return insertQrcodeOrder(userId, pack, Math.round(pack.priceCNY * 100), null);
}

/** Create a pending 经营码 order for one subscription month of `plan`. */
export async function createQrcodePlanOrder(
  userId: string,
  planId: string
): Promise<QrcodeOrder> {
  if (planId !== "starter_v2" && planId !== "creator_v2") {
    throw new Error("Unsupported plan for QR-code payment.");
  }
  const plan = planId as QrcodePlanId;
  const credits = PLAN_CREDITS[plan];
  // A synthetic CreditPack gives createPendingPurchase the credits + fallback
  // price it expects; amountCents override + plan flag carry the real intent.
  const syntheticPack: CreditPack = {
    id: (`plan_${plan}` as CreditPack["id"]),
    name: QRCODE_PLANS[plan].name,
    nameCN: QRCODE_PLANS[plan].nameCN,
    credits,
    priceCNY: QRCODE_PLANS[plan].priceCNY,
    priceUSD: 0
  };
  return insertQrcodeOrder(
    userId,
    syntheticPack,
    Math.round(QRCODE_PLANS[plan].priceCNY * 100),
    plan
  );
}

function mockOrder(
  userId: string,
  pack: { credits: number; priceCNY: number },
  plan: QrcodePlanId | null
): QrcodeOrder {
  const cents = Math.round(pack.priceCNY * 100) + 37;
  return {
    id: "mock-qrcode-" + randomHex(6),
    userId,
    orderCode: "FF-MOCK" + randomHex(4),
    credits: pack.credits,
    amountCents: cents,
    amountYuan: formatYuan(cents),
    status: "pending",
    plan,
    expiresAt: new Date(Date.now() + qrcodeOrderTtlMs()).toISOString(),
    createdAt: new Date().toISOString(),
    confirmedAt: null
  };
}

/**
 * Fetch one user-owned 经营码 order.
 *
 * The admin client bypasses RLS, so ownership must be part of the database
 * query rather than an in-memory check after a row has already been read.
 */
export async function getQrcodeOrder(
  orderId: string,
  userId: string
): Promise<QrcodeOrder | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("credit_purchases")
    .select(SELECT_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("provider", QRCODE_PROVIDER)
    .maybeSingle();
  if (!data) return null;
  return rowToOrder(data as PurchaseRow);
}

/** List 经营码 orders for the admin reconcile page, newest first. */
export async function listQrcodeOrders(opts?: {
  status?: "pending" | "paid" | "all";
  limit?: number;
}): Promise<QrcodeOrder[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  let query = supabase
    .from("credit_purchases")
    .select(SELECT_COLUMNS)
    .eq("provider", QRCODE_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  const { data } = await query;
  return (data ?? []).map((r) => rowToOrder(r as PurchaseRow));
}

/**
 * Fulfill a subscription 经营码 order: open `plan` for 30 days. Stacks on top
 * of any unexpired 经营码 subscription the user already has (renew early →
 * remaining days roll forward, not lost). Idempotent — re-confirming an
 * already-paid order is a no-op. Each step is individually idempotent so a
 * mid-sequence failure can be safely retried by confirming again.
 */
export async function grantQrcodePlan(
  purchaseId: string,
  adminId: string
): Promise<{ plan: QrcodePlanId; alreadyPaid: boolean }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(persistenceUnavailableMessage("QR-code plan grant"));
  }

  const { data: order } = await supabase
    .from("credit_purchases")
    .select("id, user_id, plan, status, order_code")
    .eq("id", purchaseId)
    .eq("provider", QRCODE_PROVIDER)
    .maybeSingle();

  if (!order || !order.plan) {
    throw new Error("Subscription order not found.");
  }
  const plan = order.plan as QrcodePlanId;
  const alreadyPaid = order.status === "paid";

  if (!alreadyPaid) {
    const now = new Date();

    // Stack on an unexpired subscription so early renewal doesn't lose days.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", order.user_id)
      .eq("payment_provider", QRCODE_PROVIDER)
      .maybeSingle();
    const existingEnd = existing?.current_period_end
      ? new Date(existing.current_period_end)
      : null;
    const base = existingEnd && existingEnd.getTime() > now.getTime() ? existingEnd : now;
    const newEnd = new Date(base.getTime() + PLAN_MONTH_MS);

    // 1. Activate the plan on the profile.
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        plan,
        monthly_limit: PLAN_MONTHLY_LIMITS[plan],
        updated_at: now.toISOString()
      })
      .eq("id", order.user_id);
    if (profileErr) throw new Error("Failed to activate plan.");

    // 2. Upsert the 经营码 subscription row (unique on user_id+provider).
    const { error: subErr } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: order.user_id,
          payment_provider: QRCODE_PROVIDER,
          provider_subscription_id: order.order_code,
          status: "active",
          current_period_end: newEnd.toISOString(),
          updated_at: now.toISOString()
        },
        { onConflict: "user_id,payment_provider" }
      );
    if (subErr) throw new Error("Failed to record subscription.");

    // 3. Grant this cycle's plan credits (idempotent via grant_plan_credits).
    await ensurePlanCredits(order.user_id, plan);

    // 4. Flip the order to paid + audit (scoped to pending so it's safe to retry).
    await supabase
      .from("credit_purchases")
      .update({
        status: "paid",
        confirmed_at: now.toISOString(),
        confirmed_by: adminId
      })
      .eq("id", purchaseId)
      .eq("status", "pending");
  }

  return { plan, alreadyPaid };
}

/**
 * Operator confirms receipt of an Alipay payment. Branches on `plan`:
 *   - subscription order → grantQrcodePlan (open plan 30 days)
 *   - credit-pack order  → grant_purchase_credits (RPC 045, same as Creem webhook)
 * Idempotent — safe to call again on an already-paid order.
 */
export async function confirmQrcodeOrder(
  purchaseId: string,
  adminId: string
): Promise<ConfirmResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(persistenceUnavailableMessage("QR-code confirmation"));
  }

  const { data: before } = await supabase
    .from("credit_purchases")
    .select("status, provider, plan")
    .eq("id", purchaseId)
    .maybeSingle();

  if (!before || before.provider !== QRCODE_PROVIDER) {
    throw new Error("Order not found.");
  }

  // Subscription branch.
  if (before.plan === "starter_v2" || before.plan === "creator_v2") {
    const r = await grantQrcodePlan(purchaseId, adminId);
    return { kind: "plan", plan: r.plan, balanceId: null, alreadyPaid: r.alreadyPaid };
  }

  // Credit-pack branch (unchanged from the original flow).
  const alreadyPaid = before.status === "paid";
  const balanceId = await grantPurchaseCredits(purchaseId);
  if (!balanceId && !alreadyPaid) {
    throw new Error("Failed to grant credits for this order.");
  }
  await supabase
    .from("credit_purchases")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: adminId })
    .eq("id", purchaseId);

  return { kind: "credits", plan: null, balanceId, alreadyPaid };
}

/** Void an order the operator doesn't want to fulfill (expired / duplicate).
 *  Only pending orders can be voided; paid orders are immutable. */
export async function voidQrcodeOrder(purchaseId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase
    .from("credit_purchases")
    .update({ status: "failed" })
    .eq("id", purchaseId)
    .eq("provider", QRCODE_PROVIDER)
    .eq("status", "pending");
}
