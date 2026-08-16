import { PRICING_PLANS, type PublicPlanKey } from "@/lib/pricing";

export const brand = {
  name: "Finfold",
  chineseName: "一鱼多吃",
  slogan: "Your reviewable AI marketing agent for getting the word out.",
  description:
    "Finfold is a reviewable AI marketing agent for founders and small teams: it audits a website, prepares growth missions, creates platform-native content, and learns from real outcomes.",
  primaryCta: "Try it free",
  siteUrl: "https://www.finfold.app",
  socialImage: {
    url: "/brand/og-image.png",
    width: 1200,
    height: 630,
    alt: "Finfold — AI marketing agent for small teams"
  },
  pricing: PRICING_PLANS,
  /** 3-day no-questions-asked refund on all paid plans; the top tier adds a
   * first-month satisfaction guarantee since it's sold on a much higher
   * trust bar (see plan §5 — replaces the old "30% performance refund"). */
  refundPolicy: {
    standard: { en: "3-day no-questions-asked refund.", zh: "3 天无理由退款。" },
    employee: {
      en: "3-day no-questions-asked refund, plus a full refund if you're not satisfied within your first month.",
      zh: "3 天无理由退款；首月内不满意可全额退款。"
    }
  },
  /** Legal / compliance metadata surfaced on the Privacy, Terms and Refund
   * pages and in the site footer. Payments are processed by Creem, which acts
   * as the merchant of record for card transactions. */
  legal: {
    /** Registered operating entity behind the Finfold product. Update this to
     * your exact registered business name before going live. */
    entity: "Finfold",
    contactEmail: "support@finfold.app",
    privacyEmail: "support@finfold.app",
    /** Last time the legal documents were reviewed (ISO date). */
    effectiveDate: "2026-07-08",
    /** Third-party payment processor / merchant of record. */
    paymentProcessor: "Creem",
    /** Third-party AI providers whose large language models power content
     * generation. Disclosed on the Privacy page and Terms to satisfy
     * payment-provider (Creem) review requirements. Generation is
     * orchestrated through Letta, which routes to OpenAI and Anthropic
     * models. Update this list if the underlying providers change. */
    aiProviders: {
      en: "OpenAI (GPT models), Anthropic (Claude models), orchestrated through Letta",
      zh: "OpenAI（GPT 系列模型）、Anthropic（Claude 系列模型），通过 Letta 进行编排调用"
    }
  }
} as const;

export type PricingPlanKey = PublicPlanKey;
