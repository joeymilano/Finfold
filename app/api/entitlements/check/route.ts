
import { NextResponse } from "next/server";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { getActiveSubscription, getPlanFeatures, getPlanPlatformLimit, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { PLAN_CREDITS, ensurePlanCredits, getCreditAllowanceSnapshot } from "@/lib/payment";
import { isLocalMockMode } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

function freeEntitlement(authenticated: boolean) {
  const features = getPlanFeatures("free");
  return {
    authenticated,
    plan: "free",
    ...features,
    // Visitors can inspect/copy the public showcase, but performance records
    // require an account because they must be tied to a private saved kit.
    canAnalyze: authenticated ? features.canAnalyze : false,
    // Public visitors can preview the workbench, but generation always
    // requires an authenticated account and account-scoped Credits.
    trialAvailable: false,
    // `monthlyLimit` is kept as a backward-compat field name for any client
    // still reading it, but its value is now AI Credits (PLAN_CREDITS.free).
    monthlyLimit: PLAN_CREDITS.free,
    creditsLimit: PLAN_CREDITS.free,
    platformLimit: getPlanPlatformLimit("free"),
    used: 0,
    available: PLAN_CREDITS.free
  };
}

export async function POST() {
  if (!hasSupabaseConfig()) {
    const localMock = isLocalMockMode();
    return NextResponse.json(freeEntitlement(localMock));
  }

  let user: { id: string } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Account authentication is temporarily unavailable." },
        { status: 503 }
      );
    }
    const authResult = await supabase.auth.getUser();
    if (authResult.error && !isAuthSessionMissingError(authResult.error)) {
      return NextResponse.json(
        { error: "Account authentication is temporarily unavailable." },
        { status: 503 }
      );
    }
    user = authResult.data.user;
  } catch {
    return NextResponse.json(
      { error: "Account authentication is temporarily unavailable." },
      { status: 503 }
    );
  }

  if (!user) {
    // Unauthenticated visitors remain in preview mode. A free account is
    // required before any generation request can consume model capacity.
    return NextResponse.json(freeEntitlement(false));
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Account entitlements are temporarily unavailable." },
      { status: 503 }
    );
  }

  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    admin.from("profiles").select("plan, locale").eq("id", user.id).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, current_period_end, payment_provider")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
  ]);

  const activeSubscription = getActiveSubscription(
    (subscriptions ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end,
      provider: subscription.payment_provider
    }))
  );
  const effectivePlan = resolveEffectivePlan(profile?.plan, activeSubscription);
  const features = getPlanFeatures(effectivePlan);

  // Grant this cycle's plan credits before reading usage so a brand-new cycle
  // shows the full allowance immediately, not 0 until the first generation.
  await ensurePlanCredits(user.id, effectivePlan);

  const creditsLimit = PLAN_CREDITS[effectivePlan];
  const allowance = await getCreditAllowanceSnapshot(user.id);
  if (!allowance) {
    return NextResponse.json(
      { error: "Account Credits are temporarily unavailable." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    plan: effectivePlan,
    ...features,
    trialAvailable: false,
    monthlyLimit: creditsLimit,
    creditsLimit,
    platformLimit: getPlanPlatformLimit(effectivePlan),
    used: allowance.used,
    available: allowance.available,
    locale: profile?.locale ?? null,
    paymentProvider: activeSubscription?.provider ?? null
  });
}
