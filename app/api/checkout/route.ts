export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  getProvider,
  getProviderForRegion,
  detectRegion,
  VALID_PLANS,
  type PlanId,
  type PaymentProviderId
} from "@/lib/payment";
import { getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as {
      plan?: string;
      paymentMethod?: PaymentProviderId;
      email?: string;
    };

    const plan: PlanId = VALID_PLANS.includes(body.plan as PlanId)
      ? (body.plan as PlanId)
      : "creator";

    // Determine payment provider
    const region = detectRegion(request);
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await provider.createCheckout({
      plan,
      userId,
      email: body.email,
      successUrl: `${appUrl}/dashboard?upgraded=true&plan=${plan}`,
      cancelUrl: `${appUrl}/billing?cancelled=true`
    });

    return NextResponse.json({ url: result.url, provider: result.provider, region });
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
