// Payment provider factory — dispatches to the right provider based on region/method

import type { PaymentProvider, PaymentProviderId, Region } from "./types";
import { creemProvider } from "./creem";
import { wechatPayProvider } from "./wechat-pay";
import { alipayProvider } from "./alipay";

export {
  type PlanId,
  type PaymentProviderId,
  type Region,
  type ModelTier,
  type ActionKey,
  type CreditSpendSummary,
  PLAN_MONTHLY_LIMITS,
  PLAN_PLATFORM_LIMITS,
  PLAN_MODEL_TIER,
  PLAN_FEATURES,
  PLAN_CREDITS,
  ACTION_CREDITS,
  CREDITS_PER_KIT,
  computeKitCost
} from "./types";
export type { CreateCheckoutParams, CheckoutResult, PaymentProvider, PlanFeatures } from "./types";
export { VALID_PLANS } from "./constants";
export {
  currentPeriodKey,
  ensurePlanCredits,
  getAvailableCredits,
  getCreditAllowanceSnapshot,
  getCreditSpendSummary,
  getPlanBatchUsed,
  periodKeyExpiry,
  periodKeyStart,
  refundCredits,
  reserveCredits,
  type CreditAllowanceSnapshot,
  type CreditReservation
} from "./credits";
export {
  reserveAiUsageOperation,
  startAiUsageOperation,
  settleAiUsageOperation,
  refundAiUsageOperation,
  recoverStaleAiUsageOperations,
  type AiUsageOperationStatus,
  type ReserveAiUsageOperationInput,
  type ReserveAiUsageOperationResult
} from "./ai-usage-operations";

const providers: Record<PaymentProviderId, PaymentProvider> = {
  creem: creemProvider,
  wechat: wechatPayProvider,
  alipay: alipayProvider
};

/** Get a specific payment provider by ID */
export function getProvider(id: PaymentProviderId): PaymentProvider {
  return providers[id];
}

/** Get the default payment provider for a region */
export function getProviderForRegion(region: Region): PaymentProvider {
  void region;
  // Currently all regions use Creem (WeChat/Alipay not yet available)
  // When ready, CN users will see WeChat/Alipay as primary options
  return creemProvider;
}

/**
 * Detect the user's region from request headers.
 * Cloudflare Workers sets the CF-IPCountry header automatically.
 * Falls back to Accept-Language heuristic.
 */
export function detectRegion(request: Request): Region {
  // Cloudflare sets this header with the ISO 3166-1 alpha-2 country code
  const cfCountry = request.headers.get("CF-IPCountry");
  if (cfCountry === "CN" || cfCountry === "HK" || cfCountry === "MO") {
    return "CN";
  }

  // Fallback: check Accept-Language for Chinese
  const acceptLang = request.headers.get("Accept-Language") ?? "";
  if (acceptLang.startsWith("zh")) {
    return "CN";
  }

  return "INTL";
}
