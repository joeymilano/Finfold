export const brand = {
  name: "Finfold",
  chineseName: "一鱼多吃",
  slogan: "Your AI marketing employee — retainer + performance pay.",
  description:
    "An AI content operations workspace built exclusively for founders and solo teams. Turn one product signal into platform-native growth kits across every channel.",
  primaryCta: "Hire your AI employee",
  siteUrl: "https://finfold.pages.dev",
  pricing: {
    free: {
      id: "free" as const,
      name: "Intern",
      nameCN: "实习生",
      price: { usd: "$0", cny: "¥0" },
      priceLabel: { usd: "Free", cny: "免费" },
      allowance: "5 kits / month",
      allowanceCN: "每月 5 份内容包",
      features: [
        "7 core platforms",
        "Preview generation",
        "Upgrade to copy & export"
      ],
      featuresCN: [
        "7 个核心平台",
        "内容预览生成",
        "升级后解锁复制与导出"
      ],
      highlighted: false,
      badge: null
    },
    starter: {
      id: "starter" as const,
      name: "Junior",
      nameCN: "初级营销员工",
      price: { usd: "$4.99", cny: "¥29" },
      priceLabel: { usd: "$4.99/mo", cny: "¥29/mo" },
      allowance: "30 kits / month",
      allowanceCN: "每月 30 份内容包",
      features: [
        "All 11 platforms",
        "Saved kit history",
        "Markdown export"
      ],
      featuresCN: [
        "全部 11 个平台",
        "历史内容存档",
        "Markdown 导出"
      ],
      highlighted: false,
      badge: null
    },
    creator: {
      id: "creator" as const,
      name: "Senior",
      nameCN: "资深营销员工",
      price: { usd: "$9.99", cny: "¥69" },
      priceLabel: { usd: "$9.99/mo", cny: "¥69/mo" },
      allowance: "100 kits / month",
      allowanceCN: "每月 100 份内容包",
      features: [
        "All 11 platforms",
        "Saved kit history",
        "Markdown export",
        "Launch playbooks",
        "Priority support",
        "30% refund if results disappoint"
      ],
      featuresCN: [
        "全部 11 个平台",
        "历史内容存档",
        "Markdown 导出",
        "发布 Playbook",
        "优先支持",
        "效果不理想退款 30%"
      ],
      highlighted: true,
      badge: "Most Popular"
    },
    pro: {
      id: "pro" as const,
      name: "Lead",
      nameCN: "营销主管",
      price: { usd: "$19.99", cny: "¥149" },
      priceLabel: { usd: "$19.99/mo", cny: "¥149/mo" },
      allowance: "300 kits / month",
      allowanceCN: "每月 300 份内容包",
      features: [
        "All 11 platforms",
        "Saved kit history",
        "Markdown export",
        "Launch playbooks",
        "Priority support",
        "Workspace API access",
        "30% refund if results disappoint"
      ],
      featuresCN: [
        "全部 11 个平台",
        "历史内容存档",
        "Markdown 导出",
        "发布 Playbook",
        "优先支持",
        "Workspace API 接入",
        "效果不理想退款 30%"
      ],
      highlighted: false,
      badge: null
    },
    team: {
      id: "team" as const,
      name: "Growth Team",
      nameCN: "增长团队",
      price: { usd: "$49", cny: "¥399" },
      priceLabel: { usd: "$49+/mo", cny: "¥399+/mo" },
      allowance: "1,000 kits / month",
      allowanceCN: "每月 1,000 份内容包",
      features: [
        "Everything in Lead",
        "Up to 5 seats",
        "Shared kit history",
        "Priority support",
        "30% refund if results disappoint"
      ],
      featuresCN: [
        "营销主管全部权益",
        "最多 5 个席位",
        "团队内容库共享",
        "优先支持",
        "效果不理想退款 30%"
      ],
      highlighted: false,
      badge: null
    }
  }
} as const;

export type PricingPlanKey = keyof typeof brand.pricing;
