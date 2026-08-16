import { VALID_PLANS } from "@/lib/payment/constants";
import { PLAN_CREDITS, PLAN_FEATURES, PLAN_MODEL_TIER, PLAN_MONTHLY_LIMITS, PLAN_PLATFORM_LIMITS, type ModelTier, type PlanFeatures, type PlanId } from "@/lib/payment/types";

export type SubscriptionEntitlement = {
  status: string | null;
  currentPeriodEnd?: string | null;
  /** Payment provider — needed because 经营码 (alipay_qrcode) has no webhook to
   *  flip status on expiry, so its `active` must be checked against
   *  currentPeriodEnd. Creem keeps status fresh via webhooks. */
  provider?: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isPaidPlan(plan: string | null | undefined): plan is PlanId {
  return VALID_PLANS.includes(plan as PlanId);
}

export function isSubscriptionCurrentlyActive(subscription: SubscriptionEntitlement | null | undefined): boolean {
  if (!subscription?.status) {
    return false;
  }

  if (ACTIVE_STATUSES.has(subscription.status)) {
    // Creem keeps `active` trustworthy via webhooks (status flips to
    // expired/canceled at period end). 经营码 has no webhook, so its `active`
    // is only valid while currentPeriodEnd is still in the future — once it
    // lapses with no renewal, the subscription must read as inactive so the
    // user auto-downgrades to free (Joey's chosen policy).
    if (subscription.provider === "alipay_qrcode") {
      return Boolean(
        subscription.currentPeriodEnd &&
          new Date(subscription.currentPeriodEnd).getTime() > Date.now()
      );
    }
    return true;
  }

  if (subscription.status === "scheduled_cancel") {
    if (!subscription.currentPeriodEnd) {
      return false;
    }
    return new Date(subscription.currentPeriodEnd).getTime() > Date.now();
  }

  return false;
}

export function canUsePaidFeatures(
  plan: string | null | undefined,
  subscription: SubscriptionEntitlement | null | undefined
): boolean {
  return isPaidPlan(plan) && isSubscriptionCurrentlyActive(subscription);
}

export function getActiveSubscription<T extends SubscriptionEntitlement>(subscriptions: T[]): T | null {
  const active = subscriptions.filter(isSubscriptionCurrentlyActive);
  if (active.length === 0) {
    return null;
  }

  return active.sort((a, b) => {
    const aTime = a.currentPeriodEnd ? new Date(a.currentPeriodEnd).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.currentPeriodEnd ? new Date(b.currentPeriodEnd).getTime() : Number.MAX_SAFE_INTEGER;
    return bTime - aTime;
  })[0] ?? null;
}

/**
 * Resolve the *effective* plan for gating purposes: the stored plan only
 * grants paid features while its subscription is genuinely active — a
 * canceled/expired subscription silently reverts a user to "free" even if
 * profiles.plan hasn't been written back yet by the webhook.
 */
export function resolveEffectivePlan(
  plan: string | null | undefined,
  subscription: SubscriptionEntitlement | null | undefined
): PlanId | "free" {
  return canUsePaidFeatures(plan, subscription) ? (plan as PlanId) : "free";
}

export function getPlanFeatures(plan: PlanId | "free"): PlanFeatures {
  return PLAN_FEATURES[plan];
}

export function getPlanPlatformLimit(plan: PlanId | "free"): number {
  return PLAN_PLATFORM_LIMITS[plan];
}

export function getPlanMonthlyLimit(plan: PlanId | "free"): number {
  return PLAN_MONTHLY_LIMITS[plan];
}

/** Credits granted per billing cycle on a plan — the primary billing unit. */
export function getPlanCredits(plan: PlanId | "free"): number {
  return PLAN_CREDITS[plan];
}

export function getPlanModelTier(plan: PlanId | "free"): ModelTier {
  return PLAN_MODEL_TIER[plan];
}
