/**
 * Creem Pricing V2 catalog.
 *
 * Prices use each currency's minor unit (for example, 1200 = USD 12.00).
 * Product names and descriptions are deliberately localized because Creem
 * localizes the checkout chrome, but not merchant-authored product content.
 * Creem currently accepts USD and EUR product currencies. The CN catalog is
 * therefore Chinese-language USD checkout content; Finfold keeps CNY public
 * display prices and its Alipay path separately.
 */
export const CREEM_PRICING_V2_PRODUCTS = [
  {
    market: "cn",
    planKey: "starter",
    envKey: "BILLING_CN_STARTER_PRICE_ID",
    name: "Finfold 入门版（月付）",
    description: "每月 600 创作点数，覆盖全部 14 个平台，保存品牌语气，并完成内容生成、导出与基础效果复盘。",
    price: 1_200,
    currency: "USD"
  },
  {
    market: "cn",
    planKey: "creator",
    envKey: "BILLING_CN_CREATOR_PRICE_ID",
    name: "Finfold 创作者版（月付）",
    description: "每月 3,000 创作点数，包含品牌记忆 URL 导入、一键 Polish 高级润色与更完整的跨平台内容资产。",
    price: 2_900,
    currency: "USD"
  },
  {
    market: "cn",
    planKey: "growth",
    envKey: "BILLING_CN_GROWTH_PRICE_ID",
    name: "Finfold 增长引擎（月付）",
    description: "每月 7,500 创作点数，使用更高质量的内容生成模型，从编辑中持续学习，并提供完整 AI 增长复盘与下一轮建议。",
    price: 14_900,
    currency: "USD"
  },
  {
    market: "cn",
    planKey: "digital_employee",
    envKey: "BILLING_CN_DIGITAL_EMPLOYEE_PRICE_ID",
    name: "Finfold 数字员工（月付）",
    description: "每月 50,000 创作点数（公平使用），主动监测产品更新、自动起草内容，并提供周度增长复盘与真人月度策略复核。",
    price: 39_900,
    currency: "USD"
  },
  {
    market: "global",
    planKey: "starter",
    envKey: "BILLING_GLOBAL_STARTER_PRICE_ID",
    name: "Finfold Starter (Monthly)",
    description: "600 AI Credits per month, all 14 platforms, saved brand voice, export-ready content, and basic performance reviews.",
    price: 1_200,
    currency: "USD"
  },
  {
    market: "global",
    planKey: "creator",
    envKey: "BILLING_GLOBAL_CREATOR_PRICE_ID",
    name: "Finfold Creator (Monthly)",
    description: "3,000 AI Credits per month with Brand Memory URL bootstrap, one-click Polish, and richer cross-platform content assets.",
    price: 2_900,
    currency: "USD"
  },
  {
    market: "global",
    planKey: "growth",
    envKey: "BILLING_GLOBAL_GROWTH_PRICE_ID",
    name: "Finfold Growth Engine (Monthly)",
    description: "7,500 AI Credits per month with a higher-quality generation model, continuous learning from edits, and complete AI growth reviews.",
    price: 14_900,
    currency: "USD"
  },
  {
    market: "global",
    planKey: "digital_employee",
    envKey: "BILLING_GLOBAL_DIGITAL_EMPLOYEE_PRICE_ID",
    name: "Finfold Digital Employee (Monthly)",
    description: "50,000 AI Credits per month under fair use, proactive product monitoring, automatic drafting, weekly growth reviews, and a monthly human strategy review.",
    price: 39_900,
    currency: "USD"
  }
].map((product) => ({
  ...product,
  billingType: "recurring",
  billingPeriod: "every-month",
  taxMode: "inclusive",
  taxCategory: "saas",
  abandonedCartRecoveryEnabled: false
}));

export function productsForMarket(market = "all") {
  if (market === "all") return CREEM_PRICING_V2_PRODUCTS;
  return CREEM_PRICING_V2_PRODUCTS.filter((product) => product.market === market);
}

export function productAmount(product) {
  return new Intl.NumberFormat(product.market === "cn" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: product.currency
  }).format(product.price / 100);
}
