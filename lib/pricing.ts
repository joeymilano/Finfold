import type { Locale } from "@/lib/i18n";
import type { PlanId } from "@/lib/payment/types";

export type PricingMarket = "cn" | "global";
export type PricingCurrency = "CNY" | "USD";
export type PublicPlanKey = "free" | "starter" | "creator" | "growth" | "digital_employee";
export type PaidPublicPlanKey = Exclude<PublicPlanKey, "free">;
export type V2EntitlementId = "free_v2" | "starter_v2" | "creator_v2" | "growth_v2" | "digital_employee_v2";

export type LocalizedPlanCopy = {
  name: string;
  description: string;
  allowance: string;
  features: readonly string[];
  exclusions?: readonly string[];
  cta: string;
  badge?: string;
};

export type PricingPlan = {
  key: PublicPlanKey;
  entitlementId: V2EntitlementId;
  /** Existing product feature gates continue to use these stable capability tiers. */
  internalPlan: PlanId | "free";
  price: Record<PricingMarket, number>;
  currency: Record<PricingMarket, PricingCurrency>;
  internalCredits: number;
  highlighted: boolean;
  copy: Record<Locale, LocalizedPlanCopy>;
};

/**
 * Pricing V2 public source of truth.
 *
 * AI Credits are the public and internal usage unit. China and global prices
 * are explicit values and must never be converted from one another at runtime.
 */
export const PRICING_PLANS = {
  free: {
    key: "free",
    entitlementId: "free_v2",
    internalPlan: "free",
    price: { cn: 0, global: 0 },
    currency: { cn: "CNY", global: "USD" },
    internalCredits: 50,
    highlighted: false,
    copy: {
      zh: {
        name: "免费试用",
        allowance: "每月 50 创作点数",
        description: "先让 Finfold 看懂你的业务，发现一个值得执行的增长机会。",
        features: ["每月 1 次网站增长审查", "1 个增长任务预览", "3 个核心平台的内容执行工具"],
        cta: "免费试用"
      },
      en: {
        name: "Free",
        allowance: "50 AI Credits / month",
        description: "Let Finfold understand the business and surface one growth opportunity worth acting on.",
        features: ["1 website growth audit per month", "1 growth mission preview", "Content execution tools for 3 core platforms"],
        cta: "Try it free"
      }
    }
  },
  starter: {
    key: "starter",
    entitlementId: "starter_v2",
    internalPlan: "starter_v2",
    price: { cn: 79, global: 12 },
    currency: { cn: "CNY", global: "USD" },
    internalCredits: 600,
    highlighted: true,
    copy: {
      zh: {
        name: "入门版",
        badge: "建议起步",
        allowance: "每月 600 创作点数",
        description: "适合第一次把增长工作交给 AI 的个人创作者和独立开发者。",
        features: ["网站审查与 3 个有证据的增长机会", "每月最多启动 4 个增长任务", "任务简报与一键生成执行草稿", "全部 14 个平台的高级创作台", "发布记录与基础结果复盘"],
        exclusions: ["关键动作需要你确认", "暂不自动发布", "暂不持续监测产品更新"],
        cta: "开始使用"
      },
      en: {
        name: "Starter",
        badge: "Best place to start",
        allowance: "600 AI Credits / month",
        description: "For indie builders and creators handing their first repeatable growth job to AI.",
        features: ["Website audit with 3 evidence-backed opportunities", "Up to 4 growth missions per month", "Mission brief with one-click execution drafts", "Advanced Studio for all 14 platforms", "Publishing history and basic outcome review"],
        exclusions: ["You approve important actions", "No automatic publishing", "No continuous product-update monitoring yet"],
        cta: "Get started"
      }
    }
  },
  creator: {
    key: "creator",
    entitlementId: "creator_v2",
    internalPlan: "creator_v2",
    price: { cn: 199, global: 29 },
    currency: { cn: "CNY", global: "USD" },
    internalCredits: 3_000,
    highlighted: false,
    copy: {
      zh: {
        name: "创作者",
        allowance: "每月 3,000 创作点数",
        description: "适合每周持续发布、同时经营多个平台的创作者和小团队。",
        features: ["入门版全部能力", "品牌记忆 URL 一键导入", "一键 Polish 高级润色", "更完整的跨平台内容资产"],
        cta: "升级创作者版"
      },
      en: {
        name: "Creator",
        allowance: "3,000 AI Credits / month",
        description: "For creators and small teams publishing every week across multiple platforms.",
        features: ["Everything in Starter", "Brand Memory URL bootstrap", "One-click Polish pass", "Richer cross-platform content assets"],
        cta: "Upgrade to Creator"
      }
    }
  },
  growth: {
    key: "growth",
    entitlementId: "growth_v2",
    internalPlan: "growth_v2",
    price: { cn: 999, global: 149 },
    currency: { cn: "CNY", global: "USD" },
    internalCredits: 7_500,
    highlighted: false,
    copy: {
      zh: {
        name: "增长引擎",
        allowance: "每月 7,500 创作点数",
        description: "适合已经跑通内容渠道、需要持续优化质量和转化的增长团队。",
        features: ["创作者版全部能力", "更高质量的内容生成模型", "从你的编辑中持续学习", "表单与支付业务结果的签名回传", "完整 AI 增长复盘与下一轮建议"],
        cta: "升级增长引擎"
      },
      en: {
        name: "Growth Engine",
        allowance: "7,500 AI Credits / month",
        description: "For growth teams with proven channels that need stronger quality and continuous optimization.",
        features: ["Everything in Creator", "Higher-quality generation model", "Learns continuously from your edits", "Signed business-result backflow from forms and payments", "Full AI growth reviews and next-step recommendations"],
        cta: "Upgrade to Growth"
      }
    }
  },
  digital_employee: {
    key: "digital_employee",
    entitlementId: "digital_employee_v2",
    internalPlan: "digital_employee_v2",
    price: { cn: 2_999, global: 399 },
    currency: { cn: "CNY", global: "USD" },
    internalCredits: 50_000,
    highlighted: false,
    copy: {
      zh: {
        name: "数字员工",
        allowance: "每月 50,000 创作点数",
        description: "雇佣你的第一位 AI 增长运营员工，让内容增长从临时任务变成持续工作流。",
        features: ["全部 14 个平台，单次最多生成 6 个", "旗舰级文案与逐帖联网调研", "产品更新来源配置与监测预览", "表单与支付业务结果自动回传", "待确认的内容计划与发布节奏建议", "周度增长复盘与下一步建议", "真人增长运营专家月度策略复核"],
        cta: "开通"
      },
      en: {
        name: "Digital Employee",
        // The backend currently enforces a 50,000-credit ceiling. Do not claim
        // unlimited usage until enforcement and legal terms support it.
        allowance: "50,000 AI Credits / month",
        description: "Hire your first AI marketing employee and turn content growth into a continuous operating system.",
        features: ["All 14 platforms, up to 6 per generation", "Flagship-grade writing and live research on every post", "Product-update source setup and monitoring preview", "Automatic business-result backflow from forms and payments", "Reviewable content plans and publishing cadence guidance", "Weekly growth review and next-step guidance", "Monthly strategy review with a human growth operator"],
        cta: "Apply for access"
      }
    }
  }
} as const satisfies Record<PublicPlanKey, PricingPlan>;

export const PRICING_PLAN_ORDER: readonly PublicPlanKey[] = ["free", "starter", "creator", "growth", "digital_employee"];
export const PAID_PRICING_PLAN_ORDER: readonly PaidPublicPlanKey[] = ["starter", "creator", "growth", "digital_employee"];

export const PLAN_SCENARIOS: Record<Locale, readonly { scenario: string; plan: PublicPlanKey }[]> = {
  zh: [
    { scenario: "想先看看业务有哪些增长机会", plan: "free" },
    { scenario: "想把第一个增长任务交给 AI", plan: "starter" },
    { scenario: "需要稳定经营多个平台", plan: "creator" },
    { scenario: "已经跑通渠道，需要持续优化增长", plan: "growth" },
    { scenario: "需要更深的调研与人工策略复核", plan: "digital_employee" }
  ],
  en: [
    { scenario: "I want to see my strongest growth opportunities", plan: "free" },
    { scenario: "I want AI to prepare my first growth mission", plan: "starter" },
    { scenario: "I run multiple channels consistently", plan: "creator" },
    { scenario: "My channels work and I need continuous optimization", plan: "growth" },
    { scenario: "I need deeper research and human strategy review", plan: "digital_employee" }
  ]
};

export type EnterpriseSectionCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  features: readonly string[];
  note: string;
  cta: string;
};

/**
 * Enterprise (To B) section for the pricing area. Deliberately separate from
 * PRICING_PLANS: no price, no checkout, no entitlement — it must never enter
 * PublicPlanKey-typed flows. Sales-led via email (custom scope and
 * performance-based terms have no standard list price to check out against).
 */
export const ENTERPRISE_SECTION: Record<Locale, EnterpriseSectionCopy> = {
  zh: {
    eyebrow: "企业版",
    title: "为增长团队定制 AI 工作力",
    subtitle: "个人按月订阅，团队按用量扩展，企业按结果合作",
    features: [
      "定制增长工作流",
      "企业级系统集成",
      "私有品牌与业务知识库",
      "高级权限与多项目管理",
      "按业务定制数字员工",
      "专属客户成功支持",
      "用量方案按规模定制",
      "按结果付费合作可谈"
    ],
    note: "定制方案与报价通过商务沟通确认",
    cta: "联系销售"
  },
  en: {
    eyebrow: "ENTERPRISE",
    title: "Custom AI Workforce for your growth operation",
    subtitle: "Individuals subscribe monthly — teams scale with usage — enterprises partner on outcomes",
    features: [
      "Custom growth workflows",
      "Enterprise integrations",
      "Private brand and business knowledge",
      "Advanced permissions and multi-project management",
      "AI employees tailored to your workflows",
      "Dedicated customer success support",
      "Usage tailored to your scale",
      "Performance-based pricing available"
    ],
    note: "Custom pricing is confirmed through a sales conversation",
    cta: "Contact Sales"
  }
};

export function buildEnterpriseContactHref(locale: Locale): string {
  const subject = locale === "en" ? "Finfold Enterprise inquiry" : "Finfold 企业版咨询";
  const body =
    locale === "en"
      ? "I’d like to discuss a custom Finfold deployment for my team. Please share how enterprise pricing, integrations, and performance-based contracts work."
      : "我想了解 Finfold 企业版。请介绍定制方案、系统集成与按结果合作的方式。";

  return `mailto:support@finfold.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function marketForLocale(locale: Locale): PricingMarket {
  return locale === "en" ? "global" : "cn";
}

export function formatPlanPrice(plan: PricingPlan, market: PricingMarket): string {
  const amount = plan.price[market].toLocaleString("en-US");
  return market === "cn" ? `¥${amount}` : `$${amount}`;
}

export function getPricingPlan(key: PublicPlanKey): PricingPlan {
  return PRICING_PLANS[key];
}

export function getLocalizedPlanCopy(key: PublicPlanKey, locale: Locale): LocalizedPlanCopy {
  return PRICING_PLANS[key].copy[locale] as LocalizedPlanCopy;
}

export function isPublicPlanKey(value: string | null | undefined): value is PublicPlanKey {
  return Boolean(value && PRICING_PLAN_ORDER.includes(value as PublicPlanKey));
}

export function isPaidPublicPlanKey(value: string | null | undefined): value is PaidPublicPlanKey {
  return Boolean(value && PAID_PRICING_PLAN_ORDER.includes(value as PaidPublicPlanKey));
}

/** Localized account label for both stored and current capability tier IDs. */
export function entitlementPlanName(plan: string | null | undefined, locale: Locale): string {
  const names: Record<string, { zh: string; en: string }> = {
    free: { zh: "免费试用", en: "Free" },
    starter: { zh: "入门版", en: "Starter" },
    pro: { zh: "创作者", en: "Creator" },
    growth: { zh: "增长引擎", en: "Growth Engine" },
    employee: { zh: "数字员工", en: "Digital Employee" },
    starter_v2: { zh: "入门版", en: "Starter" },
    creator_v2: { zh: "创作者", en: "Creator" },
    growth_v2: { zh: "增长引擎", en: "Growth Engine" },
    digital_employee_v2: { zh: "数字员工", en: "Digital Employee" }
  };
  return names[plan ?? "free"]?.[locale] ?? (plan || names.free[locale]);
}
