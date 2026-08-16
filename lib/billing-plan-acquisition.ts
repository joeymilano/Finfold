import type { Locale } from "@/lib/i18n";
import { PRICING_PLANS, type PaidPublicPlanKey } from "@/lib/pricing";

export type BillingPlanAcquisition =
  | { kind: "checkout"; cta: string; availabilityNote: null }
  | { kind: "application"; cta: string; availabilityNote: string };

export function getBillingPlanAcquisition(
  plan: PaidPublicPlanKey,
  locale: Locale
): BillingPlanAcquisition {
  if (plan === "starter" || plan === "creator") {
    return {
      kind: "checkout",
      cta: PRICING_PLANS[plan].copy[locale].cta,
      availabilityNote: null
    };
  }

  return {
    kind: "application",
    cta: locale === "en" ? "Apply for access" : "申请开通",
    availabilityNote:
      locale === "en"
        ? "Rolling out in batches. We’ll confirm the model, allowance, and billing with you before activation."
        : "正在分批开放。提交申请后，我们会先与你确认模型、额度和计费，再安排开通。"
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
