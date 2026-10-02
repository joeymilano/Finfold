import type { Locale } from "@/lib/i18n";
import { PRICING_PLANS, type PaidPublicPlanKey } from "@/lib/pricing";

export type BillingPlanAcquisition =
  | { kind: "checkout"; cta: string; availabilityNote: null }
  | { kind: "application"; cta: string; availabilityNote: string };

export type GrowthCheckoutMode = "new_checkout" | "creem_upgrade" | "assisted_migration";

export function getGrowthCheckoutMode(
  currentPlan: string | null,
  paymentProvider: string | null
): GrowthCheckoutMode {
  const isExistingPaidUser = currentPlan !== null && currentPlan !== "free";
  if (!isExistingPaidUser) return "new_checkout";
  return paymentProvider === "creem" ? "creem_upgrade" : "assisted_migration";
}

export function getBillingPlanAcquisition(
  plan: PaidPublicPlanKey,
  locale: Locale
): BillingPlanAcquisition {
  // zh buyers self-serve every paid plan via scan-to-pay, incl. the digital
  // employee (fixed CNY list price). en has no scan channel yet, so the
  // digital employee stays application-based there.
  if (plan !== "digital_employee" || locale === "zh") {
    return {
      kind: "checkout",
      cta: PRICING_PLANS[plan].copy[locale].cta,
      availabilityNote: null
    };
  }

  return {
    kind: "application",
    cta: "Apply for access",
    availabilityNote:
      "Rolling out in batches. We’ll confirm the model, allowance, and billing with you before activation."
  };
}

export function buildPlanApplicationHref(plan: PaidPublicPlanKey, locale: Locale): string {
  const planName = PRICING_PLANS[plan].copy[locale].name;
  const subject =
    locale === "en"
      ? `Finfold ${planName} access request`
      : `申请开通 Finfold ${planName}`;
  const body =
    locale === "en"
      ? `I’d like to discuss access to the Finfold ${planName} plan. Please confirm the model, allowance, and billing before activation.`
      : `我想申请开通 Finfold ${planName}。请在开通前与我确认模型、额度和计费。`;

  return `mailto:support@finfold.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
