import { PRICING_PLANS, type PublicPlanKey } from "@/lib/pricing";

// Canonical origin for sitemap/robots/JSON-LD/canonical tags. Each deployment
// flavor bakes its own value at build time (www.finfold.app on Cloudflare,
// www.finfold.cn on the self-hosted CN server); the literal fallback keeps
// bare `next dev` sessions and the Cloudflare build (which pins the env var
// to the same value) unchanged.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.finfold.app";

export const brand = {
  name: "Finfold",
  chineseName: "一鱼多吃",
  slogan: "Your reviewable AI marketing agent for getting the word out.",
  description:
    "Finfold is a reviewable AI marketing agent for founders and small teams: it audits a website, prepares growth missions, creates platform-native content, and learns from real outcomes.",
  primaryCta: "Try it free",
  siteUrl,
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
    effectiveDate: "2026-09-09",
    /** Third-party payment processor / merchant of record. */
    paymentProcessor: "Creem",
    /** Third-party AI providers whose large language models power content
     * generation. Disclosed on the Privacy page and Terms to satisfy
     * payment-provider (Creem) review requirements. Generation is
     * served by the direct provider chain or orchestrated through Letta.
     * Update this list if the underlying providers change. */
    aiProviders: {
      en: "Zhipu AI (GLM models), Alibaba Cloud DashScope (Qwen models), DeepSeek, and Letta orchestration, which may use OpenAI (GPT models) or Anthropic (Claude models)",
      zh: "智谱 AI（GLM 模型）、阿里云百炼 DashScope（通义千问 Qwen 模型）、DeepSeek，以及可能调用 OpenAI（GPT 系列）或 Anthropic（Claude 系列）的 Letta 编排服务"
    }
  }
} as const;

export type PricingPlanKey = PublicPlanKey;
