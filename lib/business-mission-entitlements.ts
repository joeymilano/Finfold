import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import type { PlanId } from "@/lib/payment/types";
import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
export type BusinessMissionPlan = PlanId | "free";

/**
 * Automatic form/payment outcome backflow is the paid accountability layer.
 * Starter and Creator users retain manual outcome recording; Growth and
 * Digital Employee plans can connect a signed server-to-server endpoint.
 */
export function canUseAutomaticOutcomeBackflow(plan: BusinessMissionPlan): boolean {
  return getPlanFeatures(plan).iterateReport;
}

export function businessMissionLimitForPlan(plan: BusinessMissionPlan): number {
  if (plan === "free") return 1;
  if (plan === "starter" || plan === "starter_v2") return 4;
  return 12;
}

export async function resolveBusinessMissionPlan(
  admin: AdminClient,
  userId: string
): Promise<BusinessMissionPlan> {
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin.from("subscriptions").select("status, current_period_end").eq("user_id", userId).eq("payment_provider", "creem").order("updated_at", { ascending: false })
  ]);
  const active = getActiveSubscription((subscriptions ?? []).map((subscription) => ({
    status: String(subscription.status ?? ""),
    currentPeriodEnd: subscription.current_period_end
  })));
  return resolveEffectivePlan(profile?.plan, active);
}

export async function enforceMonthlyBusinessMissionLimit(
  admin: AdminClient,
  userId: string,
  plan: BusinessMissionPlan,
  locale: "zh" | "en"
): Promise<string | null> {
  const cap = businessMissionLimitForPlan(plan);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count, error } = await admin
    .from("growth_missions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mission_kind", "growth_opportunity")
    .gte("created_at", monthStart);
  if (error) throw error;
  if ((count ?? 0) < cap) return null;
  if (locale === "en") {
    return plan === "free"
      ? "The Free plan can start 1 Growth Mission. Upgrade to Starter for up to 4 missions per month."
      : `Your current plan can start up to ${cap} Growth Missions per month.`;
  }
  return plan === "free"
    ? "免费版可预览并启动 1 个增长任务；升级 Starter 后每月最多启动 4 个。"
    : `当前套餐本月最多启动 ${cap} 个增长任务。`;
}
