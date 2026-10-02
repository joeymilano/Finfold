export type CreemPricingV2Product = {
  market: "cn" | "global";
  planKey: "starter" | "creator" | "growth" | "digital_employee";
  envKey: string;
  name: string;
  description: string;
  price: number;
  currency: "USD";
  billingType: "recurring";
  billingPeriod: "every-month";
  taxMode: "inclusive";
  taxCategory: "saas";
  abandonedCartRecoveryEnabled: false;
};

export const CREEM_PRICING_V2_PRODUCTS: CreemPricingV2Product[];
export function productsForMarket(market?: "all" | "cn" | "global"): CreemPricingV2Product[];
export function productAmount(product: CreemPricingV2Product): string;
