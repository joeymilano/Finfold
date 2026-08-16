// Plan → Creem Product ID environment variable mapping
// Each plan maps to an env var that holds the Creem product_id (prod_*)

import type { PaidPublicPlanKey, PricingMarket } from "@/lib/pricing";
import type { CreditPackId, LegacyPlanId, PlanId } from "./types";

/** Maps PlanId → environment variable name for Creem product IDs */
export const CREEM_PRODUCT_ENV_MAP: Record<LegacyPlanId, string> = {
  starter: "CREEM_STARTER_PRODUCT_ID",
  pro: "CREEM_PRO_PRODUCT_ID",
  growth: "CREEM_GROWTH_PRODUCT_ID",
  employee: "CREEM_EMPLOYEE_PRODUCT_ID"
};

/** Maps PlanId → environment variable name for Creem dashboard payment links */
export const CREEM_PAYMENT_LINK_ENV_MAP: Record<LegacyPlanId, string> = {
  starter: "CREEM_STARTER_PAYMENT_LINK",
  pro: "CREEM_PRO_PAYMENT_LINK",
  growth: "CREEM_GROWTH_PAYMENT_LINK",
  employee: "CREEM_EMPLOYEE_PAYMENT_LINK"
};

/** Backward-compatible aliases for teams that name hosted links "checkout URLs". */
export const CREEM_CHECKOUT_URL_ENV_MAP: Record<LegacyPlanId, string> = {
  starter: "CREEM_STARTER_CHECKOUT_URL",
  pro: "CREEM_PRO_CHECKOUT_URL",
  growth: "CREEM_GROWTH_CHECKOUT_URL",
  employee: "CREEM_EMPLOYEE_CHECKOUT_URL"
};

/** List of valid paid plan IDs */
export const VALID_PLANS: PlanId[] = [
  "starter",
  "pro",
  "growth",
  "employee",
  "starter_v2",
  "creator_v2",
  "growth_v2",
  "digital_employee_v2"
];

/** Independent market-specific Pricing V2 checkout targets. */
export const BILLING_PRICE_ID_ENV_MAP: Record<PricingMarket, Record<PaidPublicPlanKey, string>> = {
  cn: {
    starter: "BILLING_CN_STARTER_PRICE_ID",
    creator: "BILLING_CN_CREATOR_PRICE_ID",
    growth: "BILLING_CN_GROWTH_PRICE_ID",
    digital_employee: "BILLING_CN_DIGITAL_EMPLOYEE_PRICE_ID"
  },
  global: {
    starter: "BILLING_GLOBAL_STARTER_PRICE_ID",
    creator: "BILLING_GLOBAL_CREATOR_PRICE_ID",
    growth: "BILLING_GLOBAL_GROWTH_PRICE_ID",
    digital_employee: "BILLING_GLOBAL_DIGITAL_EMPLOYEE_PRICE_ID"
  }
};

export const BILLING_PAYMENT_LINK_ENV_MAP: Record<PricingMarket, Record<PaidPublicPlanKey, string>> = {
  cn: {
    starter: "BILLING_CN_STARTER_PAYMENT_LINK",
    creator: "BILLING_CN_CREATOR_PAYMENT_LINK",
    growth: "BILLING_CN_GROWTH_PAYMENT_LINK",
    digital_employee: "BILLING_CN_DIGITAL_EMPLOYEE_PAYMENT_LINK"
  },
  global: {
    starter: "BILLING_GLOBAL_STARTER_PAYMENT_LINK",
    creator: "BILLING_GLOBAL_CREATOR_PAYMENT_LINK",
    growth: "BILLING_GLOBAL_GROWTH_PAYMENT_LINK",
    digital_employee: "BILLING_GLOBAL_DIGITAL_EMPLOYEE_PAYMENT_LINK"
  }
};

/**
 * The founding-member presale is the Digital Employee plan at a locked-in
 * discount for the first FOUNDING_MEMBER_SEAT_LIMIT subscribers (plan
 * roadmap M1 cash-flow move — see §5/§8). It's a distinct Creem product
 * (different price point) but grants the same "employee" plan tier.
 */
export const CREEM_FOUNDING_MEMBER_PRODUCT_ENV = "CREEM_FOUNDING_MEMBER_PRODUCT_ID";
export const CREEM_FOUNDING_MEMBER_PAYMENT_LINK_ENV = "CREEM_FOUNDING_MEMBER_PAYMENT_LINK";
export const CREEM_FOUNDING_MEMBER_CHECKOUT_URL_ENV = "CREEM_FOUNDING_MEMBER_CHECKOUT_URL";
export const FOUNDING_MEMBER_SEAT_LIMIT = 10;
export const FOUNDING_MEMBER_LOCKED_PRICE_CNY = 999;

/**
 * Maps (market, CreditPackId) → environment variable name for the Creem ONE-TIME
 * product (a top-up pack). Mirrors BILLING_PRICE_ID_ENV_MAP's per-market shape so
 * CN and Global buyers each see a localized product name/description on checkout
 * (Creem localizes the checkout chrome from the browser, but NOT merchant-authored
 * product content). Create each as a one-time purchase in the Creem dashboard at
 * the matching price in lib/payment/types.ts (CREDIT_PACKS), then set the
 * product_id here. Prices are identical across markets (Creem is USD/EUR only);
 * only the product copy differs. One-time purchases are fulfilled by the
 * checkout.completed webhook branch (subscription products use subscription.paid
 * instead — see app/api/webhooks/creem/route.ts).
 */
export const CREEM_CREDIT_PACK_PRODUCT_ENV_MAP: Record<PricingMarket, Record<CreditPackId, string>> = {
  cn: {
    starter_pack: "CREEM_CREDIT_PACK_CN_STARTER_PRODUCT_ID",
    standard_pack: "CREEM_CREDIT_PACK_CN_STANDARD_PRODUCT_ID",
    plus_pack: "CREEM_CREDIT_PACK_CN_PLUS_PRODUCT_ID",
    pro_pack: "CREEM_CREDIT_PACK_CN_PRO_PRODUCT_ID"
  },
  global: {
    starter_pack: "CREEM_CREDIT_PACK_GLOBAL_STARTER_PRODUCT_ID",
    standard_pack: "CREEM_CREDIT_PACK_GLOBAL_STANDARD_PRODUCT_ID",
    plus_pack: "CREEM_CREDIT_PACK_GLOBAL_PLUS_PRODUCT_ID",
    pro_pack: "CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID"
  }
};

/** Optional hosted payment links for top-up packs (fallback when no API key). */
export const CREEM_CREDIT_PACK_PAYMENT_LINK_ENV_MAP: Record<
  PricingMarket,
  Record<CreditPackId, string>
> = {
  cn: {
    starter_pack: "CREEM_CREDIT_PACK_CN_STARTER_PAYMENT_LINK",
    standard_pack: "CREEM_CREDIT_PACK_CN_STANDARD_PAYMENT_LINK",
    plus_pack: "CREEM_CREDIT_PACK_CN_PLUS_PAYMENT_LINK",
    pro_pack: "CREEM_CREDIT_PACK_CN_PRO_PAYMENT_LINK"
  },
  global: {
    starter_pack: "CREEM_CREDIT_PACK_GLOBAL_STARTER_PAYMENT_LINK",
    standard_pack: "CREEM_CREDIT_PACK_GLOBAL_STANDARD_PAYMENT_LINK",
    plus_pack: "CREEM_CREDIT_PACK_GLOBAL_PLUS_PAYMENT_LINK",
    pro_pack: "CREEM_CREDIT_PACK_GLOBAL_PRO_PAYMENT_LINK"
  }
};
