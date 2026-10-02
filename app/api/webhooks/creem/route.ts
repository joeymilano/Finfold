
import { NextResponse } from "next/server";
import { verifyHmacSHA256 } from "@/lib/payment/hmac";
import { buildCreemSubscriptionUpsert, resolveCreemPlanId } from "@/lib/payment/creem-webhook";
import { grantPlanFromSubscription } from "@/lib/payment/creem-subscription-grant";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { captureServerEvent } from "@/lib/posthog-server";
import { grantPurchaseCredits } from "@/lib/payment/credits";
import { resolveCreditPackByProductId } from "@/lib/payment/creem";
import {
  claimWebhookEvent,
  hashWebhookPayload,
  markWebhookEventFailed,
  markWebhookEventSucceeded
} from "@/lib/payment/webhook-events";
import { recordCreemRevenueOutcome } from "@/lib/native-outcome-attribution";

// ── Creem webhook event types ─────────────────────────────────
// Full list: https://docs.creem.io/code/webhooks

type CreemCustomer = {
  id?: string;
  email?: string;
};

type CreemProduct = {
  id?: string;
  name?: string;
};

type CreemSubscription = {
  id?: string;
  status?: string;
  customer?: CreemCustomer;
  product?: CreemProduct;
  current_period_end_date?: string;
  canceled_at?: string;
  last_transaction_id?: string;
  metadata?: Record<string, string>;
};

type CreemCheckout = {
  id?: string;
  status?: string;
  customer?: CreemCustomer;
  product?: CreemProduct;
  subscription?: CreemSubscription;
  metadata?: Record<string, string>;
};

type CreemEvent = {
  id?: string;
  eventType: string;
  created_at?: number;
  object: CreemSubscription | CreemCheckout;
};

// ── Webhook handler ───────────────────────────────────────────

export async function POST(request: Request) {
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Never acknowledge a payment event that cannot be authenticated. A 503
    // keeps the provider retrying while production configuration is repaired.
    return NextResponse.json(
      { error: "Webhook processing is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  // 1. Verify signature
  const signature = request.headers.get("creem-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing creem-signature header." }, { status: 400 });
  }

  const payload = await request.text();

  const isValid = await verifyHmacSHA256(payload, signature, webhookSecret);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  // 2. Parse event
  let event: CreemEvent;
  try {
    event = JSON.parse(payload) as CreemEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Webhook processing is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }

  if (!event.id) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  let processingLease: string;
  try {
    const claim = await claimWebhookEvent(supabase, {
      id: event.id,
      eventType: event.eventType,
      payloadHash: await hashWebhookPayload(payload)
    });
    if (claim.outcome === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim.outcome === "busy") {
      return NextResponse.json(
        { error: "Webhook event is already being processed." },
        { status: 503, headers: { "Retry-After": "5" } }
      );
    }
    if (claim.outcome === "conflict") {
      console.error(
        `[creem-webhook] event id ${event.id} was reused with different content`
      );
      return NextResponse.json(
        { error: "Webhook event conflicts with an existing event." },
        { status: 409 }
      );
    }
    processingLease = claim.lease;
  } catch (claimError) {
    console.error(
      "[creem-webhook] event claim failed:",
      claimError
    );
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  try {
    switch (event.eventType) {
      // ── Checkout completed ──────────────────────────────
      case "checkout.completed": {
        const checkout = event.object as CreemCheckout;

        // Credit top-up? One-time pack purchases complete here (they carry no
        // subscription, so they never reach subscription.paid). Fulfill the
        // pending purchase by id BEFORE any customer linking — a top-up is
        // not a subscription. Falls back to product-id matching if a hosted
        // payment link dropped the metadata.type flag along the way.
        const isCreditTopup =
          checkout.metadata?.type === "credits" ||
          Boolean(resolveCreditPackByProductId(checkout.product?.id));
        if (isCreditTopup && checkout.metadata?.purchase_id) {
          await fulfillCreditPurchase(checkout);
          break;
        }

        const customerId = checkout.customer?.id;
        const userId = checkout.metadata?.user_id;

        if (customerId && userId) {
          await linkCreemCustomer(supabase, userId, customerId);
        }
        break;
      }

      // ── Subscription active (sync record only) ─────────
      case "subscription.active": {
        const sub = event.object as CreemSubscription;
        const userId = await upsertSubscription(supabase, sub, "active");
        if (userId) {
          await grantPlanFromSubscription(supabase, userId, sub);
        }
        break;
      }

      // ── Subscription paid (grant access) ───────────────
      case "subscription.paid": {
        const sub = event.object as CreemSubscription;
        const userId = await upsertSubscription(supabase, sub, "active");

        if (userId) {
          const planId = await grantPlanFromSubscription(supabase, userId, sub);
          await recordCreemRevenueOutcome(supabase, {
            subjectUserId: userId,
            providerEventId: event.id,
            transactionId: sub.last_transaction_id,
            subscriptionId: sub.id,
            occurredAt: normalizeCreemEventTime(event.created_at)
          });
          await captureServerEvent(userId, "checkout_completed", {
            locale: sub.metadata?.market === "global" ? "en" : "zh",
            market: sub.metadata?.market ?? "unknown",
            currency: sub.metadata?.currency ?? "unknown",
            plan_key: sub.metadata?.plan_key ?? planId,
            entitlement_id: planId,
            billing_period: "monthly",
            price: Number(sub.metadata?.price ?? 0),
            source_page: "billing",
            is_existing_user: false
          });
        }
        break;
      }

      // ── Subscription canceled ──────────────────────────
      case "subscription.canceled": {
        const sub = event.object as CreemSubscription;
        const userId = await upsertSubscription(supabase, sub, "canceled");

        if (userId) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              monthly_limit: PLAN_MONTHLY_LIMITS.free,
              updated_at: new Date().toISOString()
            })
            .eq("id", userId);
        }
        break;
      }

      // ── Subscription expired ───────────────────────────
      case "subscription.expired": {
        const sub = event.object as CreemSubscription;
        const userId = await upsertSubscription(supabase, sub, "expired");

        if (userId) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              monthly_limit: PLAN_MONTHLY_LIMITS.free,
              updated_at: new Date().toISOString()
            })
            .eq("id", userId);
        }
        break;
      }

      // ── Cancellation scheduled at period end ───────────
      case "subscription.scheduled_cancel": {
        const sub = event.object as CreemSubscription;
        await upsertSubscription(supabase, sub, "scheduled_cancel");
        break;
      }

      // ── Past due (payment failed, Creem auto-retries) ──
      case "subscription.past_due": {
        const sub = event.object as CreemSubscription;
        await upsertSubscription(supabase, sub, "past_due");
        // Don't revoke access — Creem will retry payments
        break;
      }

      // ── Subscription updated ───────────────────────────
      case "subscription.update": {
        const sub = event.object as CreemSubscription;
        const status = sub.status ?? "active";
        const userId = await upsertSubscription(supabase, sub, status);
        // Self-service plan upgrades arrive here. The signed provider event —
        // not the browser response — is authoritative for changing paid
        // entitlements. Only an active subscription can unlock the new tier;
        // past-due/paused updates remain record-only.
        if (userId && status === "active") {
          await grantPlanFromSubscription(supabase, userId, sub);
          await captureServerEvent(userId, "subscription_upgrade_confirmed", {
            plan_key: sub.metadata?.plan_key ?? "unknown",
            entitlement_id: resolveCreemPlanId({
              productId: sub.product?.id,
              metadataPlan: sub.metadata?.entitlement_id ?? sub.metadata?.plan
            }) ?? "unknown",
            provider: "creem"
          });
        }
        break;
      }

      // ── Trial started ──────────────────────────────────
      case "subscription.trialing": {
        const sub = event.object as CreemSubscription;
        await upsertSubscription(supabase, sub, "trialing");
        break;
      }

      // ── Subscription paused ────────────────────────────
      case "subscription.paused": {
        const sub = event.object as CreemSubscription;
        await upsertSubscription(supabase, sub, "paused");
        break;
      }

      // ── Refund issued (close the self-service refund loop) ──
      // Creem fires this after an operator issues the refund from the
      // dashboard. Mark the user's pending refund request completed.
      case "refund.created": {
        const refund = event.object as unknown as {
          subscription?: string;
          subscription_id?: string;
          order?: string;
          order_id?: string;
        };
        await markRefundCompleted(supabase, {
          subscriptionId: refund.subscription ?? refund.subscription_id,
          orderId: refund.order ?? refund.order_id
        });
        break;
      }

      default:
        // Acknowledge unhandled events to prevent retries
        break;
    }
    await markWebhookEventSucceeded(supabase, event.id, processingLease);
  } catch (error) {
    console.error("Creem webhook processing error:", error);
    await markWebhookEventFailed(supabase, event.id, processingLease, error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function normalizeCreemEventTime(createdAt: number | undefined): string {
  if (!Number.isFinite(createdAt)) return new Date().toISOString();
  const raw = Number(createdAt);
  const milliseconds = raw < 1_000_000_000_000 ? raw * 1000 : raw;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

// ── Helper: upsert subscription record and return user_id ─────

async function linkCreemCustomer(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  customerId: string
) {
  const { data: existing, error: selectError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("payment_provider", "creem")
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  const payload = {
    user_id: userId,
    payment_provider: "creem",
    provider_customer_id: customerId,
    status: "incomplete",
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("subscriptions").insert(payload);
  if (error) throw error;
}

async function upsertSubscription(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  sub: CreemSubscription,
  status: string
): Promise<string | null> {
  const customerId = sub.customer?.id;
  const subscriptionId = sub.id;

  if (!subscriptionId) return null;

  // Look up user_id from existing subscription record by provider_customer_id
  let userId: string | null = null;
  let existingSubscriptionRowId: string | null = null;

  if (customerId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("payment_provider", "creem")
      .eq("provider_customer_id", customerId)
      .maybeSingle();

    userId = (existing?.user_id as string) ?? null;
    existingSubscriptionRowId = (existing?.id as string) ?? null;
  }

  // Also check by provider_subscription_id
  if (!userId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();

    userId = (existing?.user_id as string) ?? null;
    existingSubscriptionRowId = (existing?.id as string) ?? null;
  }

  const { userId: resolvedUserId, data: upsertData } = buildCreemSubscriptionUpsert({
    status,
    subscriptionId,
    customerId,
    existingUserId: userId,
    metadataUserId: sub.metadata?.user_id,
    currentPeriodEnd: sub.current_period_end_date,
    canceledAt: sub.canceled_at,
    entitlementId: resolveCreemPlanId({
      productId: sub.product?.id,
      metadataPlan: sub.metadata?.entitlement_id ?? sub.metadata?.plan
    }),
    market: sub.metadata?.market
  });

  // checkout.completed may already have created the user's one allowed
  // provider row with a null subscription id. Update that row in place;
  // inserting another row would violate idx_subscriptions_user_provider before
  // the provider_subscription_id conflict target can make the write idempotent.
  const write = existingSubscriptionRowId
    ? supabase
        .from("subscriptions")
        .update(upsertData)
        .eq("id", existingSubscriptionRowId)
    : supabase
        .from("subscriptions")
        .upsert(upsertData, { onConflict: "provider_subscription_id" });
  const { data: upserted, error } = await write.select("user_id").maybeSingle();
  if (error) throw error;

  return (upserted?.user_id as string) ?? resolvedUserId;
}

// ── Helper: mark a pending refund request completed on refund.created ──
// The webhook payload's shape for refund events isn't documented as a
// typed object, so we resolve the matching request by subscription id
// first, then order id, then through credit_purchases (one-off pack
// refunds match by order_code, while Creem's refund.order is the checkout/
// order id stored in provider_checkout_id).
//
// Refund requests are unique per (user, target) — a user may concurrently
// hold a subscription refund AND an order refund — so the legacy fallback
// of "close the user's single pending request" only fires when exactly one
// pending row exists; otherwise we log and leave it to an operator.
async function markRefundCompleted(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  { subscriptionId, orderId }: { subscriptionId?: string; orderId?: string }
) {
  const now = new Date().toISOString();
  const patch = {
    status: "completed",
    resolved_at: now,
    updated_at: now
  };

  // 1. Direct match on the refunded subscription.
  if (subscriptionId) {
    const { error } = await supabase
      .from("refund_requests")
      .update(patch)
      .eq("provider_subscription_id", subscriptionId)
      .eq("status", "pending");
    if (!error) return;
  }

  // 2. Direct match on provider_order_id (Creem order ids we stored at
  //    request time — subscription refunds may carry txn.order).
  if (orderId) {
    const { data: byOrder, error: byOrderError } = await supabase
      .from("refund_requests")
      .update(patch)
      .eq("provider_order_id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!byOrderError && byOrder) return;
  }

  // 3. One-off order refund: resolve Creem's order id back to our purchase
  //    row, then close that order's request and flip the purchase refunded.
  if (orderId) {
    const { data: purchase } = await supabase
      .from("credit_purchases")
      .select("id, order_code")
      .or(`provider_checkout_id.eq.${orderId},order_code.eq.${orderId}`)
      .maybeSingle();
    const orderCode = purchase?.order_code ?? null;
    if (purchase && orderCode) {
      const { data: closed, error: closeError } = await supabase
        .from("refund_requests")
        .update(patch)
        .eq("provider_order_id", orderCode)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!closeError && closed) {
        await supabase
          .from("credit_purchases")
          .update({ status: "refunded" })
          .eq("id", purchase.id)
          .eq("status", "paid");
        return;
      }
    }
  }

  // 4. Resolve the owning user, then close their pending request — but only
  //    when exactly one is open, so a sibling order refund is never swept up.
  let userId: string | null = null;

  if (orderId) {
    const { data: req } = await supabase
      .from("refund_requests")
      .select("user_id")
      .eq("provider_order_id", orderId)
      .eq("status", "pending")
      .maybeSingle();
    userId = (req?.user_id as string | undefined) ?? null;
  } else if (subscriptionId) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();
    userId = (sub?.user_id as string | undefined) ?? null;
  }

  if (userId) {
    const { data: openRequests } = await supabase
      .from("refund_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending");
    if ((openRequests ?? []).length === 1) {
      await supabase
        .from("refund_requests")
        .update(patch)
        .eq("user_id", userId)
        .eq("status", "pending");
    } else {
      console.warn(
        `[creem-webhook] refund.created left ${openRequests?.length ?? 0} pending refund requests unmatched (sub=${subscriptionId ?? "none"} order=${orderId ?? "none"}) — operator review needed`
      );
    }
  }
}

// ── Helper: fulfill a paid credit top-up on checkout.completed ──────────
// One-time pack purchases land in checkout.completed (no subscription). The
// metadata carries the purchase_id we embedded at checkout-create time;
// grant_purchase_credits (migration 045) atomically creates the long-lived
// balance batch, writes the ledger tx, and flips the order pending → paid.
// Returns null on unknown/non-pending ids without raising, so we just log —
// acking the webhook lets Creem stop retrying instead of re-delivering it.
async function fulfillCreditPurchase(checkout: CreemCheckout) {
  const purchaseId = checkout.metadata?.purchase_id;
  if (!purchaseId) {
    console.error("[creem-webhook] credit top-up missing purchase_id in metadata");
    return;
  }

  const balanceId = await grantPurchaseCredits(purchaseId, checkout.id);
  if (!balanceId) {
    console.error("[creem-webhook] credit purchase fulfillment returned null:", purchaseId);
    return;
  }

  const userId = checkout.metadata?.user_id;
  if (userId) {
    await captureServerEvent(userId, "credits_purchased", {
      purchase_id: purchaseId,
      package_id: checkout.metadata?.package_id
    });
  }
}
