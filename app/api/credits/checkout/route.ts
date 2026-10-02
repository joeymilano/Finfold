
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { getCreditPack } from "@/lib/payment/types";
import { createCreditsCheckout, isAnyCreditPackConfigured } from "@/lib/payment/creem";
import { createPendingPurchase } from "@/lib/payment/credits";
import { resolveBillingPreferenceFromRequest } from "@/lib/payment";
import type { PricingMarket } from "@/lib/pricing";

// §10.4 — starts a Creem checkout for a one-time credit top-up pack.
// Mirrors app/api/checkout/route.ts (edge + cookie-session auth) but for
// one-time credit packs instead of subscriptions. The pending purchase row
// is recorded BEFORE the Creem call so the webhook can fulfill by id without
// trusting a client-sent amount — credits are read back out of the row.
//
// The buyer's market resolves the CN-locale vs Global-locale Creem product
// while the actual card settlement remains USD. Explicit language wins, then
// older clients' market hint, request language, and Cloudflare country.

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as {
      packageId?: string;
      market?: PricingMarket;
      locale?: "zh" | "en";
    };
    if (!body.packageId) {
      return NextResponse.json({ error: "Missing packageId." }, { status: 400 });
    }

    const pack = getCreditPack(body.packageId);
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit package." }, { status: 400 });
    }

    if (!isAnyCreditPackConfigured()) {
      return NextResponse.json(
        { error: "Credit top-up is not yet configured. Please try again later." },
        { status: 503 }
      );
    }

    // Resolve the buyer's market the same way subscription checkout does:
    // prefer an explicit body.market, then fall back to the request's region.
    const preference = resolveBillingPreferenceFromRequest(request, {
      locale: body.locale,
      market: body.market
    });
    const market = preference.market;

    // 1. Record the pending order FIRST so the webhook can fulfill by id
    //    without trusting a client-sent amount (credits come from the row).
    const purchaseId = await createPendingPurchase(userId, pack, {
      amountCents: Math.round(pack.priceUSD * 100),
      currency: "usd"
    });
    if (!purchaseId) {
      return NextResponse.json({ error: "Failed to create purchase order." }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    // 2. Create the Creem checkout for the market's locale product, embedding
    //    purchase_id in metadata so the webhook's checkout.completed branch can
    //    identify + fulfill the top-up.
    const result = await createCreditsCheckout({
      userId,
      packId: pack.id,
      purchaseId,
      market,
      successUrl: `${appUrl}/billing?purchased=credits`
    });

    return NextResponse.json({
      url: result.url,
      provider: result.provider,
      market,
      currency: "USD",
      preferredPaymentMethod: preference.preferredPaymentMethod
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to purchase credits." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start checkout." },
      { status: 400 }
    );
  }
}
