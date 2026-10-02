import {
  BILLING_PRICE_ID_ENV_MAP,
  CREEM_FOUNDING_MEMBER_PRODUCT_ENV,
  CREEM_PRODUCT_ENV_MAP,
  VALID_PLANS
} from "@/lib/payment/constants";
import { PRICING_PLANS, type PaidPublicPlanKey, type PricingMarket } from "@/lib/pricing";
import type { PlanId } from "@/lib/payment/types";

type ResolvePlanParams = {
  productId?: string | null;
  metadataPlan?: string | null;
};

/** True if the given Creem product ID is the founding-member presale
 * product (a distinct price point for the same "employee" plan tier). */
export function isFoundingMemberProduct(productId?: string | null): boolean {
  const foundingMemberProductId = process.env[CREEM_FOUNDING_MEMBER_PRODUCT_ENV];
  return Boolean(productId && foundingMemberProductId && productId === foundingMemberProductId);
}

export function resolveCreemPlanId({ productId, metadataPlan }: ResolvePlanParams): PlanId | null {
  if (productId) {
    if (isFoundingMemberProduct(productId)) {
      return "employee";
    }

    const productMap: Array<[string | undefined, PlanId]> = Object.entries(CREEM_PRODUCT_ENV_MAP).map(
      ([plan, env]) => [process.env[env], plan as PlanId]
    );
    for (const market of ["cn", "global"] as const satisfies readonly PricingMarket[]) {
      for (const publicPlan of ["starter", "creator", "growth", "digital_employee"] as const satisfies readonly PaidPublicPlanKey[]) {
        productMap.push([
          process.env[BILLING_PRICE_ID_ENV_MAP[market][publicPlan]],
          PRICING_PLANS[publicPlan].internalPlan
        ]);
      }
    }
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
  entitlementId?: string | null;
  market?: string | null;
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

  if (params.entitlementId) {
    data.entitlement_id = params.entitlementId;
  }
  if (params.market) {
    data.market = params.market;
  }

  if (params.canceledAt || params.status === "scheduled_cancel") {
    data.cancel_at = params.currentPeriodEnd ?? null;
  }

  return { userId, data };
}
