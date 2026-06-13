import { VALID_PLANS } from "@/lib/payment/constants";
import type { PlanId } from "@/lib/payment/types";

type ResolvePlanParams = {
  productId?: string | null;
  metadataPlan?: string | null;
};

export function resolveCreemPlanId({ productId, metadataPlan }: ResolvePlanParams): PlanId | null {
  if (productId) {
    const productMap: Array<[string | undefined, PlanId]> = [
      [process.env.CREEM_STARTER_PRODUCT_ID, "starter"],
      [process.env.CREEM_CREATOR_PRODUCT_ID, "creator"],
      [process.env.CREEM_PRO_PRODUCT_ID, "pro"],
      [process.env.CREEM_TEAM_PRODUCT_ID, "team"]
    ];
    const match = productMap.find(([configuredProductId]) => configuredProductId && configuredProductId === productId);
    if (match) {
      return match[1];
    }
  }

  return VALID_PLANS.includes(metadataPlan as PlanId) ? (metadataPlan as PlanId) : null;
}

type BuildUpsertParams = {
  status: string;
  subscriptionId: string;
  customerId?: string | null;
  existingUserId?: string | null;
  metadataUserId?: string | null;
  currentPeriodEnd?: string | null;
  canceledAt?: string | null;
};

export function buildCreemSubscriptionUpsert(params: BuildUpsertParams): {
  userId: string;
  data: Record<string, unknown>;
} {
  const userId = params.existingUserId ?? params.metadataUserId ?? null;
  if (!userId) {
    throw new Error("Cannot upsert Creem subscription without a user_id.");
  }

  const data: Record<string, unknown> = {
    user_id: userId,
    payment_provider: "creem",
    provider_subscription_id: params.subscriptionId,
    status: params.status,
    updated_at: new Date().toISOString()
  };

  if (params.customerId) {
    data.provider_customer_id = params.customerId;
  }

  if (params.currentPeriodEnd) {
    data.current_period_end = params.currentPeriodEnd;
  }

  if (params.canceledAt || params.status === "scheduled_cancel") {
    data.cancel_at = params.currentPeriodEnd ?? null;
  }

  return { userId, data };
}
