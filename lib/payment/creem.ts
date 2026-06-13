// Creem.io payment provider — Edge-compatible via REST API (fetch)
// Docs: https://docs.creem.io

import type { CreateCheckoutParams, CheckoutResult, PaymentProvider } from "./types";
import { CREEM_PRODUCT_ENV_MAP } from "./constants";

function getBaseUrl(): string {
  const apiKey = process.env.CREEM_API_KEY ?? "";
  // creem_test_ keys use the sandbox environment
  return apiKey.startsWith("creem_test_")
    ? "https://test-api.creem.io/v1"
    : "https://api.creem.io/v1";
}

function getProductIdForPlan(plan: string): string | undefined {
  const envKey = CREEM_PRODUCT_ENV_MAP[plan as keyof typeof CREEM_PRODUCT_ENV_MAP];
  return envKey ? process.env[envKey] : undefined;
}

export const creemProvider: PaymentProvider = {
  id: "creem",

  isConfigured(): boolean {
    return Boolean(process.env.CREEM_API_KEY);
  },

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const apiKey = process.env.CREEM_API_KEY;
    if (!apiKey) throw new Error("Creem is not configured.");

    const productId = getProductIdForPlan(params.plan);
    if (!productId) {
      throw new Error(`Creem product ID not configured for plan: ${params.plan}`);
    }

    const baseUrl = getBaseUrl();

    const body: Record<string, unknown> = {
      product_id: productId,
      success_url: params.successUrl,
      metadata: {
        user_id: params.userId,
        plan: params.plan
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
