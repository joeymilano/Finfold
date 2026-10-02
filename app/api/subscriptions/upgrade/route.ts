import { NextResponse } from "next/server";
import { BILLING_PRICE_ID_ENV_MAP } from "@/lib/payment/constants";
import { getActiveSubscription } from "@/lib/payment/entitlements";
import {
  retrieveCreemSubscription,
  upgradeCreemSubscription
} from "@/lib/payment/creem-management";
import { captureServerEvent } from "@/lib/posthog-server";
import type { PricingMarket } from "@/lib/pricing";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const ELIGIBLE_SOURCE_PLANS = new Set(["starter", "pro", "starter_v2", "creator_v2"]);

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json().catch(() => ({})) as {
      plan?: string;
      market?: PricingMarket;
      locale?: "zh" | "en";
    };
    if (body.plan !== "growth") {
      return NextResponse.json({ error: "Only Growth upgrades are available online." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Subscription upgrades are temporarily unavailable." }, { status: 503 });
    }

    const [{ data: profile, error: profileError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      admin
        .from("subscriptions")
        .select("provider_subscription_id, status, current_period_end, payment_provider, entitlement_id, market")
        .eq("user_id", userId)
    ]);
    if (profileError) throw profileError;
    if (subscriptionError) throw subscriptionError;

    const currentPlan = String(profile?.plan ?? "free");
    if (!ELIGIBLE_SOURCE_PLANS.has(currentPlan)) {
      const alreadyGrowth = currentPlan === "growth" || currentPlan === "growth_v2";
      return NextResponse.json(
        { error: alreadyGrowth ? "Growth is already active on this account." : "This subscription cannot be upgraded to Growth online." },
        { status: 409 }
      );
    }

    const active = getActiveSubscription(
      (subscriptions ?? []).map((subscription) => ({
        ...subscription,
        provider: subscription.payment_provider,
        currentPeriodEnd: subscription.current_period_end
      }))
    );
    if (!active || active.payment_provider !== "creem" || !active.provider_subscription_id) {
      return NextResponse.json(
        { error: "An active Creem Starter or Creator subscription is required for online upgrade." },
        { status: 409 }
      );
    }
    if (active.status !== "active" && active.status !== "trialing") {
      return NextResponse.json(
        { error: "Resolve the current subscription status before upgrading." },
        { status: 409 }
      );
    }

    const market: PricingMarket = active.market === "cn" || active.market === "global"
      ? active.market
      : body.market === "cn" || body.market === "global"
        ? body.market
        : body.locale === "en" ? "global" : "cn";
    const productEnv = BILLING_PRICE_ID_ENV_MAP[market].growth;
    const productId = process.env[productEnv];
    if (!productId) {
      return NextResponse.json(
        { error: "Growth card billing is not configured for this market." },
        { status: 503 }
      );
    }

    // A page retry while the signed webhook is still in flight must not submit
    // a second prorated charge. Creem's current subscription is the source of
    // truth for whether the product switch has already been accepted.
    const current = await retrieveCreemSubscription(active.provider_subscription_id);
    if (current.product?.id !== productId) {
      await upgradeCreemSubscription(active.provider_subscription_id, productId);
    }

    await captureServerEvent(userId, "subscription_upgrade_started", {
      from_plan: currentPlan,
      to_plan: "growth_v2",
      market,
      provider: "creem",
      update_behavior: "proration-charge-immediately"
    });

    return NextResponse.json({
      pending: true,
      plan: "growth",
      market,
      message: body.locale === "en"
        ? "Creem accepted the upgrade. Growth will unlock after the signed payment event is confirmed."
        : "Creem 已受理升级；签名支付事件确认后，Growth 权益会自动生效。"
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to upgrade." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upgrade subscription." },
      { status: 400 }
    );
  }
}
