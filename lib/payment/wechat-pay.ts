// WeChat Pay provider — scaffold (not yet implemented)
// Requires merchant account with JSAPI/H5 payment capability

import type { CreateCheckoutParams, CheckoutResult, PaymentProvider } from "./types";

export const wechatPayProvider: PaymentProvider = {
  id: "wechat",

  isConfigured(): boolean {
    // Not yet available — always returns false
    return false;
  },

  async createCheckout(_params: CreateCheckoutParams): Promise<CheckoutResult> {
    void _params;
    throw new Error(
      "微信支付即将上线，敬请期待 / WeChat Pay is coming soon. Please use credit card payment for now."
    );
  }
};
