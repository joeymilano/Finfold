// One-off order refunds (credit packs + scan-to-pay plan months).
//
// The subscription refund flow (/api/refund, Creem) verifies the 3-day window
// against Creem's authoritative charge date. One-off orders don't need a
// provider round-trip: `credit_purchases.confirmed_at` IS the money-landing
// timestamp (written by the gateway callback / Creem checkout webhook), so the
// window check runs against our own row.
//
// Neither ZCW Pay nor Creem exposes a public refund API, so the money movement
// stays an operator dashboard action — this records the request, claws back
// what was granted (freeze pack credits / downgrade a plan month), and emails
// the team. On Creem, `refund.created` closes the loop automatically
// (webhooks/creem → markRefundCompleted).

import { createSupabaseAdminClient } from "@/lib/supabase";
import { isWithinRefundWindow } from "@/lib/payment/creem-management";
import { orderRefundTarget, type PurchaseRow } from "@/lib/payment/orders";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  notifyRefundRequested,
  notifyUserRefundConfirmed
} from "@/lib/notifications/refund-email";
import { brand } from "@/lib/brand";

export type OrderRefundResult =
  | { status: "requested"; message: string }
  | { status: "already_requested"; message: string }
  | {
      status: "rejected";
      httpCode: number;
      message: string;
    };

const SELECT_COLUMNS =
  "id, user_id, credits, amount_cents, currency, provider, status, order_code, plan, balance_id, created_at, confirmed_at";

/**
 * Self-service refund for a one-off paid order (credit pack or scan-to-pay
 * plan month). Caller has already authenticated the user.
 */
export async function requestOrderRefund(
  userId: string,
  orderId: string,
  reason: string | null
): Promise<OrderRefundResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { status: "rejected", httpCode: 503, message: "Service unavailable." };
  }

  // 1. Load the order (ownership is part of the query).
  const { data: row } = await supabase
    .from("credit_purchases")
    .select(SELECT_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) {
    return {
      status: "rejected",
      httpCode: 404,
      message: `未找到该订单 / Order not found. Email ${brand.legal.contactEmail} if this looks wrong.`
    };
  }
  const order = row as PurchaseRow;

  if (order.status !== "paid") {
    return {
      status: "rejected",
      httpCode: 400,
      message: "只有已支付的订单可以申请退款 / Only paid orders can be refunded."
    };
  }

  // 2. 3-day window against our own confirmation timestamp (fail closed).
  if (!isWithinRefundWindow(order.confirmed_at ?? order.created_at)) {
    return {
      status: "rejected",
      httpCode: 409,
      message: `该订单已超过 3 天退款期。请邮件 ${brand.legal.contactEmail}，我们会尽量协助 / This order is outside the 3-day refund window. Email ${brand.legal.contactEmail} and we'll see what we can do.`
    };
  }

  const target = orderRefundTarget(order);

  // 3. Duplicate guard: one open (or already refunded) request per target.
  const { data: existing } = await supabase
    .from("refund_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("provider_order_id", target)
    .in("status", ["pending", "completed"])
    .maybeSingle();
  if (existing) {
    return existing.status === "pending"
      ? {
          status: "already_requested",
          message: "这笔订单的退款申请正在处理中 / This order's refund request is already in progress."
        }
      : {
          status: "rejected",
          httpCode: 409,
          message: "这笔订单已退款 / This order has already been refunded."
        };
  }

  const amount = order.amount_cents / 100;
  const currency = (order.currency ?? "cny").toUpperCase();

  // 4. Branch: plan months claw back the subscription; packs freeze credits.
  if (order.plan) {
    return refundPlanOrder(supabase, userId, order, target, amount, currency, reason);
  }
  return refundCreditPackOrder(supabase, userId, order, target, amount, currency, reason);}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Scan-to-pay plan month: only refundable while it is still the user's plan. */
async function refundPlanOrder(
  supabase: AdminClient,
  userId: string,
  order: PurchaseRow,
  target: string,
  amount: number,
  currency: string,
  reason: string | null
): Promise<OrderRefundResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  const currentPlan = (profile?.plan as string | undefined) ?? null;

  if (currentPlan !== order.plan) {
    return {
      status: "rejected",
      httpCode: 409,
      message: `你已更换套餐，此订单无法自助退款。请邮件 ${brand.legal.contactEmail} 处理 / Your plan has changed since this order, so it can't be self-refunded. Email ${brand.legal.contactEmail} and we'll sort it out.`
    };
  }

  const insertError = await insertRefundRequest(supabase, userId, order, target, reason);
  if (insertError) return insertError;

  // Downgrade (guarded by plan match so a concurrent upgrade is never clobbered)
  // and mark the subscription row this order opened as refunded.
  await supabase
    .from("profiles")
    .update({ plan: "free", subscription_status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("plan", order.plan);

  await supabase
    .from("subscriptions")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider_subscription_id", target);

  await notifyRefundStakeholders(supabase, userId, order, target, amount, currency, reason, "plan");
  return requestedResult();
}

/** Credit pack: freeze the whole batch first so the credits can't be spent
 *  while the payout is in flight; a partially-spent pack must go through
 *  support (we can't claw back what was already consumed). */
async function refundCreditPackOrder(
  supabase: AdminClient,
  userId: string,
  order: PurchaseRow,
  target: string,
  amount: number,
  currency: string,
  reason: string | null
): Promise<OrderRefundResult> {
  if (order.balance_id) {
    const { data: batch } = await supabase
      .from("credit_balances")
      .select("id, granted, used")
      .eq("id", order.balance_id)
      .maybeSingle();
    const consumedMsg =
      `这份补充包的点数已有消耗，无法整单退回。请邮件 ${brand.legal.contactEmail}，我们会按情况协助 / This pack has partially spent credits and can't be refunded whole. Email ${brand.legal.contactEmail} and we'll help.`;
    if (!batch || Number(batch.used) > 0) {
      return { status: "rejected", httpCode: 409, message: consumedMsg };
    }

    // Atomic "only if untouched": the used=0 guard loses to a concurrent
    // spend, so a pack can never be frozen while credits are being burned.
    const { data: frozen, error: freezeError } = await supabase
      .from("credit_balances")
      .update({ used: batch.granted })
      .eq("id", order.balance_id)
      .eq("used", 0)
      .select("id")
      .maybeSingle();

    if (freezeError) {
      console.error("[order-refund] freeze failed:", JSON.stringify(freezeError));
      return { status: "rejected", httpCode: 500, message: "提交退款申请失败 / Failed to submit refund request." };
    }
    if (!frozen) {
      return { status: "rejected", httpCode: 409, message: consumedMsg };
    }

    const insertError = await insertRefundRequest(supabase, userId, order, target, reason);
    if (insertError) {
      // Roll the freeze back so a duplicate request never strands credits.
      await supabase
        .from("credit_balances")
        .update({ used: 0 })
        .eq("id", order.balance_id)
        .eq("used", batch.granted);
      return insertError;
    }

    // Ledger entry for the claw-back (used = granted ⇒ remaining = 0).
    await supabase.from("credit_transactions").insert({
      user_id: userId,
      delta: -Number(batch.granted),
      action: "refund_reclaim",
      source: "refund",
      balance_id: order.balance_id,
      detail: { order_id: order.id, order_code: order.order_code, reason }
    });
  } else {
    // Legacy/edge row without a linked balance (e.g. old 经营码 confirmations):
    // still accept the request, flag it for manual reconciliation in the email.
    const insertError = await insertRefundRequest(supabase, userId, order, target, reason);
    if (insertError) return insertError;
  }

  await notifyRefundStakeholders(supabase, userId, order, target, amount, currency, reason, "credits");
  return requestedResult();
}

async function insertRefundRequest(
  supabase: AdminClient,
  userId: string,
  order: PurchaseRow,
  target: string,
  reason: string | null
): Promise<OrderRefundResult | null> {
  const { error } = await supabase.from("refund_requests").insert({
    user_id: userId,
    provider: order.provider ?? "unknown",
    provider_order_id: target,
    plan: order.plan ?? `credit_pack_${order.credits}`,
    amount: order.amount_cents,
    currency: order.currency ?? "cny",
    reason,
    status: "pending"
  });
  if (error) {
    if (error.code === "23505") {
      return {
        status: "already_requested",
        message: "这笔订单的退款申请正在处理中 / This order's refund request is already in progress."
      };
    }
    console.error("[order-refund] insert failed:", JSON.stringify(error));
    return {
      status: "rejected",
      httpCode: 500,
      message: "提交退款申请失败 / Failed to submit refund request."
    };
  }
  return null;
}

async function notifyRefundStakeholders(
  supabase: AdminClient,
  userId: string,
  order: PurchaseRow,
  target: string,
  amount: number,
  currency: string,
  reason: string | null,
  kind: "plan" | "credits"
): Promise<void> {
  await captureServerEvent(userId, "order_refund_requested", {
    order_id: order.id,
    order_code: order.order_code,
    kind,
    plan: order.plan,
    credits: order.credits,
    amount_cents: order.amount_cents,
    currency: order.currency,
    reason
  }).catch(() => undefined);

  let userEmail = "(unknown)";
  try {
    const {
      data: { user: authUser }
    } = await supabase.auth.admin.getUserById(userId);
    userEmail = authUser?.email ?? "(unknown)";
  } catch {
    // best-effort
  }

  try {
    await notifyRefundRequested({
      userEmail,
      userId,
      plan: order.plan ?? `credit_pack_${order.credits}`,
      subscriptionId: target,
      orderId: order.order_code ?? order.id,
      amount,
      currency,
      reason
    });
  } catch (err) {
    console.error("[order-refund] team email failed:", err instanceof Error ? err.message : err);
  }

  try {
    await notifyUserRefundConfirmed({
      userEmail,
      plan: order.plan ?? `credit_pack_${order.credits}`,
      subscriptionId: target,
      amount,
      currency
    });
  } catch (err) {
    console.error("[order-refund] user email failed:", err instanceof Error ? err.message : err);
  }
}

function requestedResult(): OrderRefundResult {
  return {
    status: "requested",
    message:
      "退款申请已受理。款项将按原支付方式退回，通常 5–10 个工作日到账 / Refund request received. It will be returned to your original payment method, typically within 5–10 business days."
  };
}
