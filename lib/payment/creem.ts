// Creem.io payment provider — Edge-compatible via REST API (fetch)
// Docs: https://docs.creem.io

import type { CreateCheckoutParams, CheckoutResult, CreditPackId, PaymentProvider } from "./types";
import { PRICING_PLANS, type PricingMarket } from "@/lib/pricing";
import { MONTHLY_OFFER, isMonthlyOfferValid, monthlyOfferPrice } from "./monthly-offer";
import {
  CREEM_CHECKOUT_URL_ENV_MAP,
  BILLING_PAYMENT_LINK_ENV_MAP,
  BILLING_PRICE_ID_ENV_MAP,
  CREEM_CREDIT_PACK_PAYMENT_LINK_ENV_MAP,
  CREEM_CREDIT_PACK_PRODUCT_ENV_MAP,
  CREEM_FOUNDING_MEMBER_CHECKOUT_URL_ENV,
  CREEM_FOUNDING_MEMBER_PAYMENT_LINK_ENV,
  CREEM_FOUNDING_MEMBER_PRODUCT_ENV,
  CREEM_PAYMENT_LINK_ENV_MAP,
  CREEM_PRODUCT_ENV_MAP,
  VALID_PLANS
} from "./constants";

function getBaseUrl(): string {
  const apiKey = process.env.CREEM_API_KEY ?? "";
  // creem_test_ keys use the sandbox environment
  return apiKey.startsWith("creem_test_")
    ? "https://test-api.creem.io/v1"
    : "https://api.creem.io/v1";
}

function getProductIdForPlan(params: Pick<CreateCheckoutParams, "plan" | "publicPlan" | "market" | "foundingMember">): string | undefined {
  const { plan, publicPlan, market, foundingMember } = params;
  if (foundingMember && plan === "employee") {
    return process.env[CREEM_FOUNDING_MEMBER_PRODUCT_ENV];
  }
  if (publicPlan && market) {
    return process.env[BILLING_PRICE_ID_ENV_MAP[market][publicPlan]];
  }
  const envKey = CREEM_PRODUCT_ENV_MAP[plan as keyof typeof CREEM_PRODUCT_ENV_MAP];
  return envKey ? process.env[envKey] : undefined;
}

function getPaymentLinkForPlan(params: Pick<CreateCheckoutParams, "plan" | "publicPlan" | "market" | "foundingMember">): string | undefined {
  const { plan, publicPlan, market, foundingMember } = params;
  if (foundingMember && plan === "employee") {
    return (
      process.env[CREEM_FOUNDING_MEMBER_PAYMENT_LINK_ENV] ??
      process.env[CREEM_FOUNDING_MEMBER_CHECKOUT_URL_ENV] ??
      getCreemPaymentLinkFromProductId(getProductIdForPlan(params))
    );
  }

  if (publicPlan && market) {
    return (
      process.env[BILLING_PAYMENT_LINK_ENV_MAP[market][publicPlan]] ??
      getCreemPaymentLinkFromProductId(getProductIdForPlan(params))
    );
  }

  const planId = VALID_PLANS.find((candidate) => candidate === plan);
  if (!planId) return undefined;

  const legacyPlan = planId as keyof typeof CREEM_PAYMENT_LINK_ENV_MAP;
  if (!(legacyPlan in CREEM_PAYMENT_LINK_ENV_MAP)) return undefined;

  return (
    process.env[CREEM_PAYMENT_LINK_ENV_MAP[legacyPlan]] ??
    process.env[CREEM_CHECKOUT_URL_ENV_MAP[legacyPlan]] ??
    getCreemPaymentLinkFromProductId(getProductIdForPlan(params))
  );
}

function getCreemPaymentLinkFromProductId(productId: string | undefined): string | undefined {
  return productId ? `https://creem.io/payment/${productId}` : undefined;
}

function appendMetadataToPaymentLink(url: string, params: CreateCheckoutParams): string {
  const checkoutUrl = new URL(url);
  checkoutUrl.searchParams.set("metadata[user_id]", params.userId);
  checkoutUrl.searchParams.set("metadata[plan]", params.plan);
  if (params.publicPlan) checkoutUrl.searchParams.set("metadata[plan_key]", params.publicPlan);
  if (params.locale) checkoutUrl.searchParams.set("metadata[locale]", params.locale);
  if (params.market) checkoutUrl.searchParams.set("metadata[market]", params.market);
  if (params.currency) checkoutUrl.searchParams.set("metadata[currency]", params.currency);
  if (params.price != null) checkoutUrl.searchParams.set("metadata[price]", String(params.price));
  if (params.foundingMember) {
    checkoutUrl.searchParams.set("metadata[founding_member]", "true");
  }
  return checkoutUrl.toString();
}

export function hasCreemCheckoutTarget(
  plan: string,
  foundingMember?: boolean,
  options?: { publicPlan?: CreateCheckoutParams["publicPlan"]; market?: CreateCheckoutParams["market"] }
): boolean {
  const params = { plan: plan as CreateCheckoutParams["plan"], foundingMember, ...options };
  return Boolean(
    getPaymentLinkForPlan(params) ||
    getProductIdForPlan(params)
  );
}

export function isCreemFoundingMemberCheckoutConfigured(): boolean {
  return hasCreemCheckoutTarget("employee", true);
}

export const creemProvider: PaymentProvider = {
  id: "creem",

  isConfigured(): boolean {
    if (VALID_PLANS.some((plan) => hasCreemCheckoutTarget(plan))) return true;
    return (["cn", "global"] as const).some((market) =>
      (["starter", "creator", "growth", "digital_employee"] as const).some((publicPlan) =>
        hasCreemCheckoutTarget(PRICING_PLANS[publicPlan].internalPlan, false, { publicPlan, market })
      )
    );
  },

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const apiKey = process.env.CREEM_API_KEY;
    // An offer must never fall back to a full-price hosted payment link.
    if (params.autoRenew !== undefined && params.autoRenew !== true) {
      throw new Error("Please select monthly auto-renewal before paying by card. / 请先勾选连续包月。");
    }
    if (params.autoRenew && (!apiKey || !params.publicPlan || !getProductIdForPlan(params))) {
      throw new Error("Monthly discount checkout is unavailable. / 连续包月优惠暂不可用。");
    }
    const paymentLink = getPaymentLinkForPlan(params);
    if (!apiKey) {
      if (!paymentLink) throw new Error("Creem is not configured.");
      return { url: appendMetadataToPaymentLink(paymentLink, params), provider: "creem" };
    }

    const productId = getProductIdForPlan(params);
    if (!productId) {
      if (paymentLink) {
        return { url: appendMetadataToPaymentLink(paymentLink, params), provider: "creem" };
      }
      throw new Error(`Creem product ID not configured for plan: ${params.plan}`);
    }

    const baseUrl = getBaseUrl();

    if (params.autoRenew && params.publicPlan) {
      const options = { headers: { "x-api-key": apiKey }, cache: "no-store" as const };
      const results = await Promise.all([
        fetch(`${baseUrl}/products?product_id=${encodeURIComponent(productId)}`, options),
        fetch(`${baseUrl}/discounts?discount_code=${encodeURIComponent(MONTHLY_OFFER.code)}`, options)
      ]);
      if (results.some((response) => !response.ok)) {
        throw new Error("Unable to verify the monthly discount. Please try again. / 暂时无法核实连续包月优惠，请稍后重试。");
      }
      const [product, discount] = await Promise.all(results.map((response) => response.json()));
      const price = PRICING_PLANS[params.publicPlan].price.global;
      if (product.id !== productId || product.status !== "active" || product.currency !== "USD" ||
          product.price !== Math.round(price * 100) || product.billing_type !== "recurring" ||
          product.billing_period !== "every-month" || product.tax_mode !== "inclusive" ||
          product.trial_period_days > 0 || !isMonthlyOfferValid(discount, productId)) {
        throw new Error("Monthly offer configuration does not match the displayed price. / 连续包月配置与展示优惠不一致，暂不能付款。");
      }
    }

    const body: Record<string, unknown> = {
      product_id: productId,
      ...(params.autoRenew ? { discount_code: MONTHLY_OFFER.code } : {}),
      success_url: params.successUrl,
      metadata: {
        user_id: params.userId,
        plan: params.plan,
        plan_key: params.publicPlan,
        entitlement_id: params.plan,
        locale: params.locale,
        market: params.market,
        currency: params.currency,
        price: params.autoRenew && params.publicPlan
          ? String(monthlyOfferPrice(PRICING_PLANS[params.publicPlan].price.global))
          : params.price != null ? String(params.price) : undefined,
        ...(params.autoRenew ? { auto_renew: "true", renewal_offer: MONTHLY_OFFER.code, renewal_consent_version: "2026-09-07" } : {})
      }
    };

    // Pre-fill customer email if available
    if (params.email) {
      body.customer = { email: params.email };
    }

    const response = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: string;
      };
      throw new Error(
        err.error?.message ?? err.message ?? "Creem checkout session creation failed."
      );
    }

    const session = (await response.json()) as { checkout_url?: string; checkoutUrl?: string };
    const url = session.checkout_url ?? session.checkoutUrl;

    if (!url) {
      throw new Error("Creem did not return a checkout URL.");
    }

    return { url, provider: "creem" };
  }
};

// ---- Credit top-up checkout (§10.4) --------------------------------------
// A top-up pack is a Creem ONE-TIME product, separate from the subscription
// products above. It does NOT go through the PaymentProvider abstraction
// (which is plan/subscription-shaped): this dedicated function builds the
// checkout with metadata.type='credits' so the webhook can tell a top-up
// apart from a subscription's checkout.completed and fulfill it by purchase id.
//
// Like the subscription catalog, each pack exists as TWO Creem products — a
// CN-locale and a Global-locale one — so checkout shows a localized product
// name/description. The USD price is identical across markets; only the copy
// differs. The buyer's market is resolved in the route (body.market or
// detectRegion) and passed in as params.market.

const CREDIT_PACK_IDS: CreditPackId[] = ["starter_pack", "standard_pack", "plus_pack", "pro_pack"];
const CREDIT_PACK_MARKETS: PricingMarket[] = ["cn", "global"];

function getCreditPackProductId(packId: CreditPackId, market: PricingMarket): string | undefined {
  const envKey = CREEM_CREDIT_PACK_PRODUCT_ENV_MAP[market]?.[packId];
  return envKey ? process.env[envKey] : undefined;
}

function getCreditPackPaymentLink(packId: CreditPackId, market: PricingMarket): string | undefined {
  // Hosted-payment-link fallback mirrors the plan link env naming, with the
  // product-id-derived link as a last resort (same as getPaymentLinkForPlan).
  const linkEnv = CREEM_CREDIT_PACK_PAYMENT_LINK_ENV_MAP[market]?.[packId];
  return (
    (linkEnv && process.env[linkEnv]) ??
    getCreemPaymentLinkFromProductId(getCreditPackProductId(packId, market))
  );
}

function appendCreditsMetadataToLink(
  url: string,
  params: { userId: string; packId: CreditPackId; purchaseId: string }
): string {
  const checkoutUrl = new URL(url);
  checkoutUrl.searchParams.set("metadata[user_id]", params.userId);
  checkoutUrl.searchParams.set("metadata[type]", "credits");
  checkoutUrl.searchParams.set("metadata[package_id]", params.packId);
  checkoutUrl.searchParams.set("metadata[purchase_id]", params.purchaseId);
  return checkoutUrl.toString();
}

/** True if a credit-pack product is configured for the given pack in the given
 *  market. When market is omitted, true if configured in EITHER market — used
 *  by callers that only need a coarse "is this pack live somewhere" signal. */
export function hasCreditPackCheckoutTarget(packId: CreditPackId, market?: PricingMarket): boolean {
  if (market) return Boolean(getCreditPackProductId(packId, market));
  return CREDIT_PACK_MARKETS.some((m) => Boolean(getCreditPackProductId(packId, m)));
}

/** True if ANY credit-pack product is configured in ANY market (gates the whole
 *  top-up store — a pack is purchasable once at least one locale product exists). */
export function isAnyCreditPackConfigured(): boolean {
  return CREDIT_PACK_IDS.some((packId) => hasCreditPackCheckoutTarget(packId));
}

/**
 * Resolves which pack a Creem product id belongs to, searching both markets.
 * Used by the webhook as a fallback when metadata.type is missing — defense in
 * depth so a top-up still fulfills even if a payment link dropped the metadata.
 * Returns undefined if the product isn't a credit pack in either market.
 */
export function resolveCreditPackByProductId(productId?: string | null): CreditPackId | undefined {
  if (!productId) return undefined;
  return CREDIT_PACK_IDS.find((packId) =>
    CREDIT_PACK_MARKETS.some((m) => getCreditPackProductId(packId, m) === productId)
  );
}

export async function createCreditsCheckout(params: {
  userId: string;
  packId: CreditPackId;
  purchaseId: string;
  /** Buyer market — selects the CN-locale or Global-locale Creem product. */
  market: PricingMarket;
  email?: string;
  successUrl: string;
}): Promise<CheckoutResult> {
  const apiKey = process.env.CREEM_API_KEY;
  const productId = getCreditPackProductId(params.packId, params.market);

  // Hosted-payment-link fallback (no API key) — same shape as plan checkout.
  if (!apiKey) {
    const link = getCreditPackPaymentLink(params.packId, params.market);
    if (!link) throw new Error("Creem credit pack is not configured.");
    return { url: appendCreditsMetadataToLink(link, params), provider: "creem" };
  }

  if (!productId) {
    throw new Error(`Creem product ID not configured for credit pack: ${params.packId} (${params.market})`);
  }

  const body: Record<string, unknown> = {
    product_id: productId,
    success_url: params.successUrl,
    metadata: {
      user_id: params.userId,
      type: "credits",
      package_id: params.packId,
      purchase_id: params.purchaseId
    }
  };

  if (params.email) {
    body.customer = { email: params.email };
  }

  const response = await fetch(`${getBaseUrl()}/checkouts`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(
      err.error?.message ?? err.message ?? "Creem checkout session creation failed."
    );
  }

  const session = (await response.json()) as { checkout_url?: string; checkoutUrl?: string };
  const url = session.checkout_url ?? session.checkoutUrl;

  if (!url) {
    throw new Error("Creem did not return a checkout URL.");
  }

  return { url, provider: "creem" };
}
