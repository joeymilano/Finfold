
import { NextResponse } from "next/server";
import {
  getProvider,
  getProviderForRegion,
  detectRegion,
  type PaymentProviderId
} from "@/lib/payment";
import {
  PRICING_PLANS,
  isPaidPublicPlanKey,
  type PricingMarket
} from "@/lib/pricing";
import { getActiveSubscription } from "@/lib/payment/entitlements";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as {
      plan?: string;
      locale?: "zh" | "en";
      market?: PricingMarket;
      paymentMethod?: PaymentProviderId;
      email?: string;
    };

    if (!isPaidPublicPlanKey(body.plan)) {
      return NextResponse.json({ error: "Unknown Pricing V2 plan." }, { status: 400 });
    }
    const publicPlan = body.plan;
    const pricingPlan = PRICING_PLANS[publicPlan];
    const plan = pricingPlan.internalPlan;
    const admin = createSupabaseAdminClient();
    if (admin) {
      const { data: subscriptions } = await admin
        .from("subscriptions")
        .select("status, current_period_end, payment_provider")
        .eq("user_id", userId);
      const active = getActiveSubscription(
        (subscriptions ?? []).map((subscription) => ({
          status: String(subscription.status ?? ""),
          currentPeriodEnd: subscription.current_period_end,
          provider: subscription.payment_provider
        }))
      );
      if (active) {
        return NextResponse.json(
          { error: "当前订阅会保留原价格与权益。切换套餐前请先联系支持，避免重复订阅。(Your active subscription is protected; contact support before switching plans.)" },
          { status: 409 }
        );
      }
    }

    // Determine payment provider
    const region = detectRegion(request);
    const market: PricingMarket = body.market === "cn" || body.market === "global"
      ? body.market
      : region === "CN" ? "cn" : "global";
    let provider;

    if (body.paymentMethod) {
      provider = getProvider(body.paymentMethod);
    } else {
      provider = getProviderForRegion(region);
    }

    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: "支付功能暂未开放 — Checkout is not yet configured. Please contact support or try again later." },
        { status: 503 }
      );
    }

    // Creem products are currently USD/EUR only. Finfold may display the CN
    // market in CNY, but its card checkout uses the matching USD monthly price;
    // Alipay keeps the exact CNY amount on its separate provider path.
    const checkoutCurrency = provider.id === "creem" ? "USD" : pricingPlan.currency[market];
    const checkoutPrice = provider.id === "creem" ? pricingPlan.price.global : pricingPlan.price[market];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await provider.createCheckout({
      plan,
      publicPlan,
      locale: body.locale === "zh" || body.locale === "en" ? body.locale : undefined,
      market,
      currency: checkoutCurrency,
      price: checkoutPrice,
      userId,
      email: body.email,
      successUrl: `${appUrl}/dashboard?upgraded=true&plan=${publicPlan}&market=${market}`,
      cancelUrl: `${appUrl}/billing?cancelled=true`
    });

    return NextResponse.json({ url: result.url, provider: result.provider, region, market });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to subscribe." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start checkout." },
      { status: 400 }
    );
  }
}
