export const runtime = "edge";

import { NextResponse } from "next/server";
import { canUsePaidFeatures, getActiveSubscription } from "@/lib/payment/entitlements";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

export async function POST() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ authenticated: false, plan: "trial", canUseOutputs: false, canAnalyze: false, trialAvailable: true, monthlyLimit: 0, used: 0 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return NextResponse.json({ authenticated: false, plan: "trial", canUseOutputs: false, canAnalyze: false, trialAvailable: true, monthlyLimit: 0, used: 0 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ authenticated: true, plan: "free", canUseOutputs: false, canAnalyze: false, trialAvailable: false, monthlyLimit: 5, used: 0 });
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: profile }, { data: subscriptions }, { count }] = await Promise.all([
    admin.from("profiles").select("plan, monthly_limit, locale").eq("id", user.id).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false }),
    admin.from("content_kits").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", monthStart.toISOString())
  ]);

  const plan = String(profile?.plan ?? "free");
  const activeSubscription = getActiveSubscription(
    (subscriptions ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end
    }))
  );
  const paid = canUsePaidFeatures(plan, activeSubscription);
  const monthlyLimit = paid ? Number(profile?.monthly_limit ?? PLAN_MONTHLY_LIMITS.free) : PLAN_MONTHLY_LIMITS.free;
  const usedCount = count ?? 0;

  return NextResponse.json({
    authenticated: true,
    plan: paid ? plan : "free",
    canUseOutputs: paid || usedCount < PLAN_MONTHLY_LIMITS.free,
    canAnalyze: paid,
    trialAvailable: false,
    monthlyLimit,
    used: usedCount,
    locale: profile?.locale ?? null
  });
}
