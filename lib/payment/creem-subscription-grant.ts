import { FOUNDING_MEMBER_LOCKED_PRICE_CNY } from "@/lib/payment/constants";
import { currentPeriodKey, periodKeyExpiry } from "@/lib/payment/credits";
import {
  isFoundingMemberProduct,
  resolveCreemPlanId
} from "@/lib/payment/creem-webhook";
import { PLAN_CREDITS, PLAN_MONTHLY_LIMITS } from "@/lib/payment/types";
import { createSupabaseAdminClient } from "@/lib/supabase";

type CreemPlanSubscription = {
  product?: { id?: string };
  metadata?: Record<string, string>;
};

/**
 * Applies the paid plan and its current-cycle credit batch as one webhook
 * fulfillment step. The database credit grant is idempotent, so replayed
 * active/paid events cannot double-issue credits.
 */
export async function grantPlanFromSubscription(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  sub: CreemPlanSubscription
): Promise<string> {
  const planId = resolveCreemPlanId({
    productId: sub.product?.id,
    metadataPlan: sub.metadata?.plan
  });

  if (!planId) {
    throw new Error("Unable to resolve paid plan from Creem subscription.");
  }

  const periodKey = currentPeriodKey();
  const isFoundingMember = isFoundingMemberProduct(sub.product?.id);
  const { error } = await supabase.rpc("apply_plan_entitlement", {
    p_user_id: userId,
    p_plan: planId,
    p_monthly_limit: PLAN_MONTHLY_LIMITS[planId],
    p_credits: PLAN_CREDITS[planId],
    p_period_key: periodKey,
    p_expires_at: periodKeyExpiry(periodKey),
    p_founding_member: isFoundingMember,
    p_founding_member_locked_price: isFoundingMember ? FOUNDING_MEMBER_LOCKED_PRICE_CNY : null
  });
  if (error) throw error;
  return planId;
}
