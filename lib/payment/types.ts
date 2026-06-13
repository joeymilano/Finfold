// Shared payment types — provider-agnostic
// Replaces PlanId / PLAN_MONTHLY_LIMITS previously in lib/stripe.ts

export type PlanId = "starter" | "creator" | "pro" | "team";
export type PaymentProviderId = "creem" | "wechat" | "alipay";
export type Region = "CN" | "INTL";

export const PLAN_MONTHLY_LIMITS: Record<PlanId | "free", number> = {
  free: 3,
  starter: 30,
  creator: 100,
  pro: 300,
  team: 1000
};

/** Parameters for creating a checkout session */
export interface CreateCheckoutParams {
  plan: PlanId;
  userId: string;
  email?: string;
  successUrl: string;
  cancelUrl: string;
}

/** Result returned after creating a checkout session */
export interface CheckoutResult {
  /** URL to redirect the user to complete payment */
  url: string;
  /** Which provider handled the checkout */
  provider: PaymentProviderId;
}

/** Interface every payment provider must implement */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Returns true if the provider has all required env vars configured */
  isConfigured(): boolean;
  /** Create a checkout session and return a redirect URL */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;
}
