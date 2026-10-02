/**
 * Creem Credit Pack catalog — one-time top-up products.
 *
 * Mirrors scripts/creem-pricing-v2-catalog.mjs but for ONE-TIME credit packs
 * (billing_type "onetime"), not recurring subscriptions. Each pack exists as
 * TWO products — a CN-locale (Chinese) and a Global-locale (English) one — so
 * checkout shows a localized product name/description; the USD price is
 * identical across markets, only the copy differs.
 *
 * Each env var maps via lib/payment/constants.ts
 * (CREEM_CREDIT_PACK_PRODUCT_ENV_MAP[market][packId]), and the credits/price
 * MUST stay in sync with CREDIT_PACKS in lib/payment/types.ts — the webhook
 * fulfills from the credit_purchases row written before checkout, so a price
 * mismatch charges the wrong amount for the granted credits.
 *
 * Prices use the currency minor unit (USD cents): 700 = USD 7.00. Creem only
 * accepts USD/EUR; CN buyers who pay CNY use the separate Alipay 经营码 path,
 * not these products. See docs/creem-credit-packs.md.
 */
export const CREEM_CREDIT_PACK_PRODUCTS = [
  // ---- CN-locale (Chinese product copy) --------------------------------
  {
    market: "cn",
    packId: "starter_pack",
    envKey: "CREEM_CREDIT_PACK_CN_STARTER_PRODUCT_ID",
    name: "Finfold 创作点数 — 入门包（500 点）",
    description:
      "Finfold 创作点数 500 点，一次性补充包。点数永久有效，仅在每月套餐额度耗尽后消耗——忙碌月份的灵活加购。",
    price: 700,
    currency: "USD"
  },
  {
    market: "cn",
    packId: "standard_pack",
    envKey: "CREEM_CREDIT_PACK_CN_STANDARD_PRODUCT_ID",
    name: "Finfold 创作点数 — 标准包（1,500 点）",
    description:
      "Finfold 创作点数 1,500 点，一次性补充包，单价比入门包更划算。点数永久有效，仅在每月套餐额度耗尽后消耗。",
    price: 1_800,
    currency: "USD"
  },
  {
    market: "cn",
    packId: "plus_pack",
    envKey: "CREEM_CREDIT_PACK_CN_PLUS_PRODUCT_ID",
    name: "Finfold 创作点数 — 进阶包（4,000 点）",
    description:
      "Finfold 创作点数 4,000 点，一次性补充包，适合产出密集的月份。点数永久有效，仅在每月套餐额度耗尽后消耗。",
    price: 4_200,
    currency: "USD"
  },
  {
    market: "cn",
    packId: "pro_pack",
    envKey: "CREEM_CREDIT_PACK_CN_PRO_PRODUCT_ID",
    name: "Finfold 创作点数 — 专业包（10,000 点）",
    description:
      "Finfold 创作点数 10,000 点，单价最划算的一次性补充包。点数永久有效，仅在每月套餐额度耗尽后消耗——重度用户首选。",
    price: 8_400,
    currency: "USD"
  },
  // ---- Global-locale (English product copy) ----------------------------
  {
    market: "global",
    packId: "starter_pack",
    envKey: "CREEM_CREDIT_PACK_GLOBAL_STARTER_PRODUCT_ID",
    name: "Finfold AI Credits — Starter (500)",
    description:
      "500 AI Credits for Finfold — a one-time top-up. Credits never expire and are spent only after your monthly plan allowance runs out, a flexible boost for a busier month.",
    price: 700,
    currency: "USD"
  },
  {
    market: "global",
    packId: "standard_pack",
    envKey: "CREEM_CREDIT_PACK_GLOBAL_STANDARD_PRODUCT_ID",
    name: "Finfold AI Credits — Standard (1,500)",
    description:
      "1,500 AI Credits for Finfold — a one-time top-up with a lower per-credit price than Starter. Credits never expire and are spent only after your monthly plan allowance runs out.",
    price: 1_800,
    currency: "USD"
  },
  {
    market: "global",
    packId: "plus_pack",
    envKey: "CREEM_CREDIT_PACK_GLOBAL_PLUS_PRODUCT_ID",
    name: "Finfold AI Credits — Plus (4,000)",
    description:
      "4,000 AI Credits for Finfold — a one-time top-up for heavier output months. Credits never expire and are spent only after your monthly plan allowance runs out.",
    price: 4_200,
    currency: "USD"
  },
  {
    market: "global",
    packId: "pro_pack",
    envKey: "CREEM_CREDIT_PACK_GLOBAL_PRO_PRODUCT_ID",
    name: "Finfold AI Credits — Pro (10,000)",
    description:
      "10,000 AI Credits for Finfold — best value per credit. A one-time top-up for power users; credits never expire and are spent only after your monthly plan allowance runs out.",
    price: 8_400,
    currency: "USD"
  }
].map((product) => ({
  ...product,
  // One-time products carry NO billing_period and NO abandoned-cart recovery
  // (both are recurring-only concepts). billing_type "onetime" is the exact
  // Creem ProductBillingType enum value (confirmed in the search-products
  // OpenAPI schema), not "one-time" / "one_time".
  billingType: "onetime",
  taxMode: "inclusive",
  // digital-goods-service (not "saas"): these are one-time digital credit
  // purchases, not a recurring SaaS subscription — matches the tax category
  // set on the live Creem products.
  taxCategory: "digital-goods-service"
}));

export function productAmount(product) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency
  }).format(product.price / 100);
}

// Default export-less preview run: `node scripts/creem-credit-packs-catalog.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Creem Credit Packs — catalog preview (offline)");
  for (const product of CREEM_CREDIT_PACK_PRODUCTS) {
    console.log(`\n[${product.market.toUpperCase()}] ${product.envKey}`);
    console.log(`${product.name} — ${productAmount(product)} (one-time)`);
    console.log(product.description);
  }
}
