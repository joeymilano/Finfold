export const runtime = "edge";

import { NextResponse } from "next/server";
import { verifyHmacSHA256 } from "@/lib/payment/hmac";
import { buildCreemSubscriptionUpsert, resolveCreemPlanId } from "@/lib/payment/creem-webhook";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment/types";
import { createSupabaseAdminClient } from "@/lib/supabase";

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
    // Webhook not configured — acknowledge to prevent retries
    return NextResponse.json({ received: true, configured: false });
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
    return NextResponse.json({ received: true, db: false });
  }

  try {
    switch (event.eventType) {
      // ── Checkout completed ──────────────────────────────
      case "checkout.completed": {
        const checkout = event.object as CreemCheckout;
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
          await grantPlanFromSubscription(supabase, userId, sub);
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
        await upsertSubscription(supabase, sub, sub.status ?? "active");
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

      default:
        // Acknowledge unhandled events to prevent retries
        break;
    }
  } catch (error) {
    console.error("Creem webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
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

async function grantPlanFromSubscription(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  sub: CreemSubscription
) {
  const planId = resolveCreemPlanId({
    productId: sub.product?.id,
    metadataPlan: sub.metadata?.plan
  });

  if (!planId) {
    throw new Error("Unable to resolve paid plan from Creem subscription.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      plan: planId,
      monthly_limit: PLAN_MONTHLY_LIMITS[planId],
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);
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

  if (customerId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("payment_provider", "creem")
      .eq("provider_customer_id", customerId)
      .maybeSingle();

    userId = (existing?.user_id as string) ?? null;
  }

  // Also check by provider_subscription_id
  if (!userId) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();

    userId = (existing?.user_id as string) ?? null;
  }

  const { userId: resolvedUserId, data: upsertData } = buildCreemSubscriptionUpsert({
    status,
    subscriptionId,
    customerId,
    existingUserId: userId,
    metadataUserId: sub.metadata?.user_id,
    currentPeriodEnd: sub.current_period_end_date,
    canceledAt: sub.canceled_at
  });

  // Use provider_subscription_id as the conflict target
  const { data: upserted, error } = await supabase
    .from("subscriptions")
    .upsert(upsertData, { onConflict: "provider_subscription_id" })
    .select("user_id")
    .maybeSingle();
  if (error) throw error;

  return (upserted?.user_id as string) ?? resolvedUserId;
}
