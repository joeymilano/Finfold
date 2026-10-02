// Alipay provider — scaffold (not yet implemented)
// Requires Alipay merchant account

import type { CreateCheckoutParams, CheckoutResult, PaymentProvider } from "./types";

export const alipayProvider: PaymentProvider = {
  id: "alipay",

  isConfigured(): boolean {
    // Not yet available — always returns false
    return false;
  },

  async createCheckout(_params: CreateCheckoutParams): Promise<CheckoutResult> {
    void _params;
    throw new Error(
      "支付宝即将上线，敬请期待 / Alipay is coming soon. Please use credit card payment for now."
    );
  }
};
