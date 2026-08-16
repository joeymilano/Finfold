import { FOUNDING_MEMBER_LOCKED_PRICE_CNY } from "@/lib/payment/constants";
import { ensurePlanCredits } from "@/lib/payment/credits";
import {
  isFoundingMemberProduct,
  resolveCreemPlanId
} from "@/lib/payment/creem-webhook";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment/types";
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

  const update: Record<string, unknown> = {
    plan: planId,
    monthly_limit: PLAN_MONTHLY_LIMITS[planId],
    updated_at: new Date().toISOString()
  };

  // Lock in founding-member status/price on first grant only — a later
  // resubscribe or plan change should never silently grant the discount to
  // someone who wasn't one of the original seats.
  if (isFoundingMemberProduct(sub.product?.id)) {
    update.founding_member = true;
    update.founding_member_locked_price = FOUNDING_MEMBER_LOCKED_PRICE_CNY;
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) throw error;

  await ensurePlanCredits(userId, planId);
  return planId;
}
