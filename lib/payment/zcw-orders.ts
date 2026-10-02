// ZCW Pay order orchestration — the bridge between the aggregate gateway
// (lib/payment/zcwpay.ts) and Finfold's order/fulfillment model.
//
// One `credit_purchases` row per order (provider='zcwpay'), reusing the
// columns the retired 经营码 channel introduced (order_code / expires_at /
// plan / confirmed_at). Unlike that channel, payment is detected
// automatically:
//
//   • createZcwOrder()      — insert pending row → gateway unified order →
//                              return QR content for the pay page
//   • syncZcwOrderStatus()  — pay-page polling asks the gateway directly, so
//                              a lost callback still fulfills within seconds
//   • handleZcwNotify()     — gateway GET callback: verify signature + amount,
//                              then fulfill (idempotent)
//
// Fulfillment branches on the row's `plan` (same split as confirmQrcodeOrder):
//   plan set   → open that plan for 30 days (subscriptions upsert, provider='zcwpay')
//   plan null  → grant_purchase_credits RPC (045, row-locked + idempotent)
//
// Amounts are exact pack/plan prices in 分 — the gateway never receives a
// random tail, and a callback whose money doesn't match the row is rejected.

import {
  ZCW_PROVIDER,
  createZcwGatewayOrder,
  isZcwPayConfigured,
  queryZcwGatewayOrder,
  verifyZcwNotify,
  type ZcwChannel,
  type ZcwDevice,
  type ZcwNotifyParams
} from "@/lib/payment/zcwpay";
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
import { isQrcodePlanId, QRCODE_PLANS, type QrcodePlanId } from "@/lib/payment/qrcode-constants";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

/** One subscription month = 30 days (matches the retired 经营码 flow). */
const PLAN_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a ZCW order stays payable on our side (gateway QR validity). */
function zcwOrderTtlMs(): number {
  const minutes = Number(process.env.ZCWPAY_ORDER_TTL_MINUTES ?? 30);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 30 * 60_000;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

function generateOrderCode(): string {
  return "FF-" + randomHex(8);
}

export type ZcwOrderKind =
  | { kind: "credits"; packId: string }
  | { kind: "plan"; planId: QrcodePlanId };

export type ZcwOrder = {
  id: string;
  orderCode: string;
  credits: number;
  amountCents: number;
  amountYuan: string;
  status: "pending" | "paid" | "refunded" | "failed";
  channel: ZcwChannel | null;
  plan: QrcodePlanId | null;
  payType: string | null;
  /** QR content / redirect URL — only present right after checkout creation. */
  payInfo: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type PurchaseRow = {
  id: string;
  user_id: string;
  credits: number;
  amount_cents: number;
  provider: string | null;
  provider_checkout_id: string | null;
  status: string;
  order_code: string | null;
  plan: string | null;
  expires_at: string | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, user_id, credits, amount_cents, provider, provider_checkout_id, status, order_code, plan, expires_at, created_at";

function rowToOrder(row: PurchaseRow): ZcwOrder {
  return {
    id: row.id,
    orderCode: row.order_code ?? "",
    credits: row.credits,
    amountCents: row.amount_cents,
    amountYuan: (row.amount_cents / 100).toFixed(2),
    status: (["pending", "paid", "refunded", "failed"].includes(row.status)
      ? row.status
      : "pending") as ZcwOrder["status"],
    channel: row.provider_checkout_id?.startsWith("zcw:")
      ? (row.provider_checkout_id.slice(4).split(":")[0] as ZcwChannel)
      : null,
    plan: row.plan && isQrcodePlanId(row.plan) ? row.plan : null,
    payType: null,
    payInfo: null,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

/**
 * Create the pending local order, then place the gateway order. The local row
 * is written FIRST (same rule as the Creem flow) so fulfillment only ever
 * trusts row data — never a client-sent amount.
 *
 * `provider_checkout_id` carries "zcw:<channel>:<gateway trade_no>" through
 * creation; on fulfillment it is rewritten to the bare gateway trade_no.
 */
export async function createZcwOrder(
  userId: string,
  kind: ZcwOrderKind,
  channel: ZcwChannel,
  opts: { device: ZcwDevice; clientIp: string; name: string }
): Promise<ZcwOrder> {
  if (!isZcwPayConfigured()) {
    throw new Error("ZCW_PAY_NOT_CONFIGURED");
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(persistenceUnavailableMessage("ZCW Pay order"));
  }

  // Resolve credits + exact price from the source of truth (never the client).
  let pack: CreditPack;
  let plan: QrcodePlanId | null = null;
  if (kind.kind === "credits") {
    const found = getCreditPack(kind.packId);
    if (!found) throw new Error("Unknown credit package.");
    pack = found;
  } else {
    plan = kind.planId;
    pack = {
      id: `plan_${plan}` as CreditPack["id"],
      name: QRCODE_PLANS[plan].name,
      nameCN: QRCODE_PLANS[plan].nameCN,
      credits: PLAN_CREDITS[plan],
      priceCNY: QRCODE_PLANS[plan].priceCNY,
      priceUSD: 0
    };
  }
  const amountCents = Math.round(pack.priceCNY * 100);

  // 1. Pending row (order_code unique index → brief retry on collision).
  let orderId: string | null = null;
  let orderCode = "";
  const expiresAt = new Date(Date.now() + zcwOrderTtlMs()).toISOString();
  for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
    orderCode = generateOrderCode();
    try {
      orderId = await createPendingPurchase(userId, pack, {
        provider: ZCW_PROVIDER,
        amountCents,
        currency: "cny",
        orderCode,
        expiresAt,
        ...(plan ? { plan } : {})
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/23505|duplicate|order_code/i.test(msg) || attempt === 4) throw err;
    }
  }
  if (!orderId) throw new Error("Failed to create the payment order.");

  // 2. Gateway unified order.
  let created;
  try {
    created = await createZcwGatewayOrder({
      channel,
      device: opts.device,
      outTradeNo: orderCode,
      money: (amountCents / 100).toFixed(2),
      name: opts.name.slice(0, 120),
      notifyUrl: `${appUrl()}/api/webhooks/zcwpay`,
      returnUrl: `${appUrl()}/pay/${orderId}`,
      clientIp: opts.clientIp
    });
  } catch (err) {
    // Gateway rejected the order — void the pending row so it never lingers
    // as payable in reconcile views. The user can simply retry.
    await supabase
      .from("credit_purchases")
      .update({ status: "failed" })
      .eq("id", orderId)
      .eq("status", "pending");
    throw err;
  }

  await supabase
    .from("credit_purchases")
    .update({ provider_checkout_id: `zcw:${channel}:${created.tradeNo}` })
    .eq("id", orderId);

  return {
    id: orderId,
    orderCode,
    credits: pack.credits,
    amountCents,
    amountYuan: (amountCents / 100).toFixed(2),
    status: "pending",
    channel,
    plan,
    payType: created.payType,
    payInfo: created.payInfo,
    expiresAt,
    createdAt: new Date().toISOString()
  };
}

/** Fetch one user-owned ZCW order (ownership is part of the query — admin
 *  client bypasses RLS, mirroring getQrcodeOrder). */
export async function getZcwOrder(orderId: string, userId: string): Promise<ZcwOrder | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("credit_purchases")
    .select(SELECT_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("provider", ZCW_PROVIDER)
    .maybeSingle();
  if (!data) return null;
  return rowToOrder(data as PurchaseRow);
}

// ---- Fulfillment -------------------------------------------------------------

/**
 * Open `plan` for 30 days for the order's user. Optimistically claims the row
 * (pending → paid) FIRST and only the winner proceeds, so a simultaneous
 * callback + poll can never stack two 30-day extensions.
 */
async function grantZcwPlan(orderId: string, tradeNo: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(persistenceUnavailableMessage("ZCW Pay plan grant"));
  }

  // Claim: exactly one caller flips pending → paid.
  const { data: claimed, error: claimErr } = await supabase
    .from("credit_purchases")
    .update({
      status: "paid",
      confirmed_at: new Date().toISOString(),
      provider_checkout_id: tradeNo
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("user_id, plan, order_code")
    .maybeSingle();
  if (claimErr) throw new Error("Failed to record the payment.");
  if (!claimed) return false; // someone else already fulfilled it
  const order = claimed as { user_id: string; plan: string; order_code: string | null };
  const plan = order.plan as QrcodePlanId;

  const now = new Date();

  // Stack on an unexpired zcwpay subscription (early renewal keeps days).
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("current_period_end")
    .eq("user_id", order.user_id)
    .eq("payment_provider", ZCW_PROVIDER)
    .maybeSingle();
  const existingEnd = existing?.current_period_end ? new Date(existing.current_period_end) : null;
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
  if (profileErr) throw new Error("Failed to activate the plan.");

  // 2. Subscription row (unique on user_id+payment_provider).
  const { error: subErr } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: order.user_id,
        payment_provider: ZCW_PROVIDER,
        provider_subscription_id: order.order_code,
        status: "active",
        current_period_end: newEnd.toISOString(),
        updated_at: now.toISOString()
      },
      { onConflict: "user_id,payment_provider" }
    );
  if (subErr) throw new Error("Failed to record the subscription.");

  // 3. This cycle's plan credits (idempotent RPC).
  await ensurePlanCredits(order.user_id, plan);
  return true;
}

/**
 * Fulfill a paid order, branching on `plan`. Idempotent: the credits path is
 * row-locked inside grant_purchase_credits; the plan path claims pending→paid
 * first. Returns true when this call did the fulfillment.
 */
export async function fulfillZcwOrder(
  orderId: string,
  tradeNo: string
): Promise<{ fulfilled: boolean; alreadyPaid: boolean }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error(persistenceUnavailableMessage("ZCW Pay fulfillment"));
  }

  const { data: row } = await supabase
    .from("credit_purchases")
    .select("id, status, plan, provider")
    .eq("id", orderId)
    .maybeSingle();
  if (!row || row.provider !== ZCW_PROVIDER) {
    throw new Error("Order not found.");
  }
  if (row.status === "paid") return { fulfilled: false, alreadyPaid: true };
  if (row.status !== "pending") return { fulfilled: false, alreadyPaid: false };

  if (row.plan === "starter_v2" || row.plan === "creator_v2") {
    const did = await grantZcwPlan(orderId, tradeNo);
    return { fulfilled: did, alreadyPaid: !did };
  }

  const balanceId = await grantPurchaseCredits(orderId, tradeNo);
  if (!balanceId) throw new Error("Failed to deliver this order.");
  await supabase
    .from("credit_purchases")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", orderId);
  return { fulfilled: true, alreadyPaid: false };
}

/**
 * Pay-page polling path: ask the gateway directly, and if it says paid, verify
 * the amount matches the row, then fulfill. Makes a lost notify callback
 * harmless — the user's own polling completes the order.
 */
export async function syncZcwOrderStatus(order: ZcwOrder): Promise<ZcwOrder> {
  if (order.status !== "pending") return order;

  let remote: Awaited<ReturnType<typeof queryZcwGatewayOrder>> = null;
  try {
    remote = await queryZcwGatewayOrder(order.orderCode);
  } catch {
    // Gateway hiccup — keep the local view; the notify callback remains.
    return order;
  }
  if (!remote || remote.status !== "paid") return order;

  // Amount check: gateway money (yuan) must equal the row amount exactly.
  if (Math.round(parseFloat(remote.money || "0") * 100) !== order.amountCents) {
    console.error(
      `[zcwpay] amount mismatch for ${order.orderCode}: gateway=${remote.money} row_cents=${order.amountCents}`
    );
    return order;
  }

  try {
    await fulfillZcwOrder(order.id, remote.tradeNo || order.orderCode);
  } catch (err) {
    console.error(`[zcwpay] fulfillment failed for ${order.orderCode}:`, err);
    return order;
  }
  return { ...order, status: "paid" };
}

/**
 * Gateway async notify (GET). Verifies the payload end-to-end, fulfills, and
 * reports whether the caller should answer "success" (stop retries).
 */
export async function handleZcwNotify(
  params: ZcwNotifyParams
): Promise<{ ok: boolean; reason?: string }> {
  if (!verifyZcwNotify(params)) {
    return { ok: false, reason: "signature" };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return { ok: false, reason: "persistence" };

  const { data: row } = await supabase
    .from("credit_purchases")
    .select("id, user_id, amount_cents, status, provider")
    .eq("order_code", params.outTradeNo)
    .eq("provider", ZCW_PROVIDER)
    .maybeSingle();
  if (!row) return { ok: false, reason: "unknown_order" };

  if (Math.round(parseFloat(params.money) * 100) !== row.amount_cents) {
    console.error(
      `[zcwpay] notify amount mismatch for ${params.outTradeNo}: ${params.money} vs ${row.amount_cents}`
    );
    return { ok: false, reason: "amount" };
  }

  try {
    await fulfillZcwOrder(row.id, params.tradeNo);
  } catch (err) {
    console.error(`[zcwpay] notify fulfillment failed for ${params.outTradeNo}:`, err);
    // Answer failure so the gateway retries — the order stays pending.
    return { ok: false, reason: "fulfillment" };
  }
  return { ok: true };
}

/** Mock mode: a fake but structurally valid order for local preview. */
export function mockZcwOrder(userId: string, kind: ZcwOrderKind, channel: ZcwChannel): ZcwOrder {
  void userId;
  const credits = kind.kind === "credits" ? 500 : PLAN_CREDITS[kind.planId];
  const cents =
    kind.kind === "credits"
      ? Math.round((getCreditPack(kind.packId)?.priceCNY ?? 49) * 100)
      : Math.round(QRCODE_PLANS[kind.planId].priceCNY * 100);
  return {
    id: "mock-zcw-" + randomHex(6),
    orderCode: "FF-MOCK" + randomHex(4),
    credits,
    amountCents: cents,
    amountYuan: (cents / 100).toFixed(2),
    status: "pending",
    channel,
    plan: kind.kind === "plan" ? kind.planId : null,
    payType: "qrcode",
    payInfo: "https://example.com/mock-pay/" + randomHex(8),
    expiresAt: new Date(Date.now() + zcwOrderTtlMs()).toISOString(),
    createdAt: new Date().toISOString()
  };
}

/** Whether order creation should short-circuit to the mock in local preview. */
export function shouldMockZcwOrder(): boolean {
  return isLocalMockMode();
}
