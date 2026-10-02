
import { NextResponse } from "next/server";
import {
  getProvider,
  resolveBillingPreferenceFromRequest,
  type PaymentProviderId
} from "@/lib/payment";
import {
  PRICING_PLANS,
  isPaidPublicPlanKey,
  type PricingMarket
} from "@/lib/pricing";
import { getActiveSubscription } from "@/lib/payment/entitlements";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";
import { monthlyOfferPrice } from "@/lib/payment/monthly-offer";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as {
      plan?: string;
      locale?: "zh" | "en";
      market?: PricingMarket;
      paymentMethod?: PaymentProviderId;
      email?: string;
      autoRenew?: boolean;
    };

    if (!isPaidPublicPlanKey(body.plan)) {
      return NextResponse.json({ error: "Unknown Pricing V2 plan." }, { status: 400 });
    }
    const publicPlan = body.plan;
    if (body.autoRenew !== true) {
      return NextResponse.json({ error: apiError(request.headers, "请先勾选连续包月；支付宝经营码仅支持单月购买。", "Please select monthly auto-renewal. Alipay QR supports one-month purchases only.") }, { status: 400 });
    }
    if (publicPlan === "digital_employee") {
      return NextResponse.json({ error: "Digital Employee requires an access application." }, { status: 400 });
    }
    const pricingPlan = PRICING_PLANS[publicPlan];
    const plan = pricingPlan.internalPlan;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Subscription verification is temporarily unavailable." }, { status: 503 });
    }
    {
      const { data: subscriptions, error } = await admin
        .from("subscriptions")
        .select("status, current_period_end, payment_provider")
        .eq("user_id", userId);
      if (error) throw error;
      const active = getActiveSubscription(
        (subscriptions ?? []).map((subscription) => ({
          status: String(subscription.status ?? ""),
          currentPeriodEnd: subscription.current_period_end,
          provider: subscription.payment_provider
        }))
      );
      // Only a live auto-renewing card subscription blocks a second one —
      // two Creem subscriptions would both keep charging. Scan-to-pay
      // subscriptions never renew, so they never block card checkout.
      if (active && active.provider === "creem") {
        return NextResponse.json(
          { error: apiError(request.headers, "你已有连续包月订阅生效中。请先取消连续包月，本期结束后即可订阅新套餐。", "You already have an active auto-renewing plan. Cancel the renewal first, then subscribe to the new plan when this period ends.") },
          { status: 409 }
        );
      }
    }

    const preference = resolveBillingPreferenceFromRequest(request, {
      locale: body.locale,
      market: body.market
    });
    const region = preference.region;
    const requestedMarket = preference.market;
    const provider = body.paymentMethod
      ? getProvider(body.paymentMethod)
      : getProvider("creem");

    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: apiError(request.headers, "支付功能暂未开放。", "Checkout is not yet configured. Please contact support or try again later.") },
        { status: 503 }
      );
    }

    if (provider.id !== "creem") {
      return NextResponse.json({ error: "Auto-renewal is available through Creem card billing only." }, { status: 400 });
    }

    // Creem products are currently USD/EUR only. Finfold may display the CN
    // market in CNY, but its card checkout uses the matching USD monthly price;
    // Alipay keeps the exact CNY amount on its separate provider path.
    const market: PricingMarket = requestedMarket;
    const checkoutCurrency = provider.id === "creem" ? "USD" : pricingPlan.currency[market];
    const checkoutPrice = monthlyOfferPrice(pricingPlan.price.global);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await provider.createCheckout({
      plan,
      publicPlan,
      locale: body.locale === "zh" || body.locale === "en" ? body.locale : undefined,
      market,
      currency: checkoutCurrency,
      price: checkoutPrice,
      autoRenew: true,
      userId,
      email: body.email,
      successUrl: `${appUrl}/dashboard?upgraded=true&plan=${publicPlan}&market=${market}`,
      cancelUrl: `${appUrl}/billing?cancelled=true`
    });

    return NextResponse.json({
      url: result.url,
      provider: result.provider,
      region,
      market,
      currency: checkoutCurrency,
      preferredPaymentMethod: preference.preferredPaymentMethod
    });
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
