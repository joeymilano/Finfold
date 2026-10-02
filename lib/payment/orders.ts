// Order history — the user-facing view over `credit_purchases` (one-off
// orders: ZCW scan-to-pay plan months + credit packs, Creem credit packs,
// and legacy 经营码 rows) merged with `refund_requests` so the orders page
// can render refund state inline.
//
// The 3-day window mirrors the subscription refund policy
// (lib/payment/creem-management.ts REFUND_WINDOW_MS). For one-off orders the
// authoritative timestamp is our own row (`confirmed_at`, falling back to
// `created_at`) because the money already landed in our table when the
// gateway/checkout confirmed it — no provider API call is needed here.

import { createSupabaseAdminClient } from "@/lib/supabase";
import { isWithinRefundWindow } from "@/lib/payment/creem-management";

/** Hard cap for the history list — a single user's realistic lifetime of orders. */
const ORDERS_PAGE_LIMIT = 100;

export type PurchaseRow = {
  id: string;
  user_id: string;
  credits: number;
  amount_cents: number;
  currency: string | null;
  provider: string | null;
  status: string;
  order_code: string | null;
  plan: string | null;
  balance_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
};

export type RefundRequestRow = {
  provider_order_id: string | null;
  provider_subscription_id: string | null;
  status: string;
  requested_at: string;
};

export type OrderRefundStatus = "pending" | "completed" | "rejected" | null;

export type OrderView = {
  id: string;
  orderCode: string;
  /** "plan" = a 30-day plan month bought scan-to-pay; "credits" = a top-up pack. */
  kind: "plan" | "credits";
  planId: string | null;
  credits: number;
  amountCents: number;
  currency: string;
  provider: string | null;
  status: "pending" | "paid" | "refunded" | "failed";
  createdAt: string;
  confirmedAt: string | null;
  /** When the pending order stops being payable (gateway QR validity). */
  expiresAt: string | null;
  /** A pending ZCW order still inside its window — "continue payment" links
   *  to /billing/pay/[id]. Legacy 经营码 rows stay pending until ops
   *  reconciles them, but their static QR is no longer payable. */
  payable: boolean;
  /** The key refund_requests.provider_order_id is matched against. */
  refundTarget: string;
  refundStatus: OrderRefundStatus;
  refundable: boolean;
  /** Why the refund action is hidden, when it is. */
  refundBlock: "outside_window" | "consumed" | "plan_changed" | null;
};

export type SubscriptionView = {
  provider: string;
  status: string;
  currentPeriodEnd: string | null;
  plan: string;
  refundStatus: OrderRefundStatus;
};

export type OrderHistoryPayload = {
  orders: OrderView[];
  subscription: SubscriptionView | null;
};

/** The refund_requests key for a purchase row: order_code when present. */
export function orderRefundTarget(row: Pick<PurchaseRow, "id" | "order_code">): string {
  return row.order_code ?? row.id;
}

function toOrderStatus(raw: string): OrderView["status"] {
  return raw === "paid" || raw === "refunded" || raw === "failed" ? raw : "pending";
}

/**
 * Pure view-builder so the merge logic is unit-testable. `consumedBalanceIds`
 * are purchase credit batches with used > 0 (their credits can no longer be
 * returned whole); `currentPlan` is profiles.plan, used to detect that a
 * scan-to-pay plan month has since been superseded by another purchase.
 */
export function buildOrderViews(
  rows: PurchaseRow[],
  refundRequests: RefundRequestRow[],
  consumedBalanceIds: Set<string>,
  currentPlan: string | null,
  now: number = Date.now()
): OrderView[] {
  return rows.map((row) => {
    const target = orderRefundTarget(row);

    // The freshest request for this target wins (rejected requests may be
    // followed by a newer re-request).
    const matches = refundRequests.filter((r) => r.provider_order_id === target);
    const request = matches.length > 0
      ? matches.reduce((latest, r) => (r.requested_at > latest.requested_at ? r : latest))
      : null;
    const refundStatus: OrderRefundStatus =
      request &&
      (request.status === "pending" || request.status === "completed" || request.status === "rejected")
        ? request.status
        : null;

    // "Unavailable" orders (not paid, or a refund already open/done) show
    // state instead of an action; the reasons below only apply otherwise.
    const unavailable =
      toOrderStatus(row.status) !== "paid" || refundStatus === "pending" || refundStatus === "completed";

    let refundBlock: OrderView["refundBlock"] = null;
    if (!unavailable) {
      if (row.plan && currentPlan !== null && currentPlan !== row.plan) {
        refundBlock = "plan_changed";
      } else if (!row.plan && row.balance_id && consumedBalanceIds.has(row.balance_id)) {
        refundBlock = "consumed";
      } else if (!isWithinRefundWindow(row.confirmed_at ?? row.created_at, now)) {
        refundBlock = "outside_window";
      }
    }

    // A pending ZCW order inside its gateway window can still be paid — the
    // pay page polls the gateway and fulfills on the spot.
    const status = toOrderStatus(row.status);
    const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : Number.NaN;
    const payable =
      status === "pending" &&
      row.provider === "zcwpay" &&
      Number.isFinite(expiresMs) &&
      expiresMs > now;

    return {
      id: row.id,
      orderCode: row.order_code ?? "—",
      kind: row.plan ? "plan" : "credits",
      planId: row.plan,
      credits: row.credits,
      amountCents: row.amount_cents,
      currency: row.currency ?? "cny",
      provider: row.provider,
      status,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      expiresAt: row.expires_at,
      payable,
      refundTarget: target,
      refundStatus,
      refundable: !unavailable && refundBlock === null,
      refundBlock
    };
  });
}

/**
 * Load one user's full order history + current subscription summary.
 * Uses the admin client with user_id in the query (same ownership-in-query
 * pattern as the payment routes).
 */
export async function fetchOrderHistory(userId: string): Promise<OrderHistoryPayload | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  // Lazy-close expired pending ZCW orders: their gateway QR is dead, so the
  // row can never fulfill anymore. (No cron needed — whoever views the page
  // triggers the sweep. Legacy 经营码 rows are left for ops reconciliation.)
  // Failures here are non-fatal; the row just shows as pending once more.
  await supabase
    .from("credit_purchases")
    .update({ status: "failed" })
    .eq("user_id", userId)
    .eq("provider", "zcwpay")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .then(() => undefined, (error) => {
      console.error("[orders] lazy-close failed:", JSON.stringify(error));
    });

  const [purchasesRes, refundsRes, profileRes, subsRes] = await Promise.all([
    supabase
      .from("credit_purchases")
      .select(
        "id, user_id, credits, amount_cents, currency, provider, status, order_code, plan, balance_id, created_at, confirmed_at, expires_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(ORDERS_PAGE_LIMIT),
    supabase
      .from("refund_requests")
      .select("provider_order_id, provider_subscription_id, status, requested_at")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false }),
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("payment_provider, status, current_period_end, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
  ]);

  const rows = (purchasesRes.data ?? []) as PurchaseRow[];
  const refunds = (refundsRes.data ?? []) as RefundRequestRow[];
  const currentPlan = (profileRes.data?.plan as string | undefined) ?? null;
  const subs = (subsRes.data ?? []) as Array<{
    payment_provider: string;
    status: string;
    current_period_end: string | null;
    updated_at: string | null;
  }>;

  // Which purchase batches are (partially) spent? Only unspent packs are
  // self-service refundable — their credits can be returned whole.
  const balanceIds = rows
    .filter((r) => !r.plan && r.balance_id)
    .map((r) => r.balance_id as string);
  const consumedBalanceIds = new Set<string>();
  if (balanceIds.length > 0) {
    const { data: balances } = await supabase
      .from("credit_balances")
      .select("id, used")
      .in("id", balanceIds);
    for (const b of (balances ?? []) as Array<{ id: string; used: number }>) {
      if (Number(b.used) > 0) consumedBalanceIds.add(b.id);
    }
  }

  const orders = buildOrderViews(rows, refunds, consumedBalanceIds, currentPlan);

  // Current subscription: the freshest row the user still has (creem renewals
  // and zcwpay single months share the table; updated_at keeps them ordered).
  const sub = subs[0] ?? null;
  const subscription: SubscriptionView | null = sub
    ? {
        provider: sub.payment_provider,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        plan: currentPlan ?? "free",
        refundStatus:
          (() => {
            const req = refunds.find((r) => r.provider_subscription_id !== null) ?? null;
            return req &&
              (req.status === "pending" || req.status === "completed" || req.status === "rejected")
              ? req.status
              : null;
          })()
      }
    : null;

  return { orders, subscription };
}
