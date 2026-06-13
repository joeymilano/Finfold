import { VALID_PLANS } from "@/lib/payment/constants";
import type { PlanId } from "@/lib/payment/types";

export type SubscriptionEntitlement = {
  status: string | null;
  currentPeriodEnd?: string | null;
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
