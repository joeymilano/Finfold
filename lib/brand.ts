export const brand = {
  name: "Finfold",
  chineseName: "Finfold",
  slogan: "Fold one product signal into launch-ready growth assets.",
  description:
    "An AI content operations workspace for turning product updates, founder notes, and market insights into platform-native growth kits.",
  primaryCta: "Build a growth package",
  siteUrl: "https://finfold.pages.dev",
  pricing: {
    free: {
      id: "free" as const,
      name: "Free",
      nameCN: "Free",
      price: { usd: "$0", cny: "¥0" },
      priceLabel: { usd: "Free", cny: "Free" },
      allowance: "5 kits / month",
      allowanceCN: "5 kits / month",
      features: ["7 core platforms", "Preview generation", "Upgrade to copy & export"],
      featuresCN: ["7 core platforms", "Preview generation", "Upgrade to copy & export"],
      highlighted: false,
      badge: null
    },
    starter: {
      id: "starter" as const,
      name: "Starter",
      nameCN: "Starter",
      price: { usd: "$4.99", cny: "¥29" },
      priceLabel: { usd: "$4.99/mo", cny: "¥29/mo" },
      allowance: "30 kits / month",
      allowanceCN: "30 kits / month",
      features: ["All 11 platforms", "Saved history", "Markdown export"],
      featuresCN: ["All 11 platforms", "Saved history", "Markdown export"],
      highlighted: false,
      badge: null
    },
    creator: {
      id: "creator" as const,
      name: "Creator",
      nameCN: "Creator",
      price: { usd: "$9.99", cny: "¥69" },
      priceLabel: { usd: "$9.99/mo", cny: "¥69/mo" },
      allowance: "100 kits / month",
      allowanceCN: "100 kits / month",
      features: ["All 11 platforms", "Saved history", "Markdown export", "Launch playbooks", "Priority support"],
      featuresCN: ["All 11 platforms", "Saved history", "Markdown export", "Launch playbooks", "Priority support"],
      highlighted: true,
      badge: "Most Popular"
    },
    pro: {
      id: "pro" as const,
      name: "Pro",
      nameCN: "Pro",
      price: { usd: "$19.99", cny: "¥149" },
      priceLabel: { usd: "$19.99/mo", cny: "¥149/mo" },
      allowance: "300 kits / month",
      allowanceCN: "300 kits / month",
      features: ["All 11 platforms", "Saved history", "Markdown export", "Launch playbooks", "Priority support", "Workspace API access"],
      featuresCN: ["All 11 platforms", "Saved history", "Markdown export", "Launch playbooks", "Priority support", "Workspace API access"],
      highlighted: false,
      badge: null
    },
    team: {
      id: "team" as const,
      name: "Team",
      nameCN: "Team",
      price: { usd: "$49", cny: "¥399" },
      priceLabel: { usd: "$49+/mo", cny: "¥399+/mo" },
      allowance: "1,000 kits / month",
      allowanceCN: "1,000 kits / month",
      features: ["Everything in Pro", "Up to 5 seats", "Shared kit history", "Priority support"],
      featuresCN: ["Everything in Pro", "Up to 5 seats", "Shared kit history", "Priority support"],
      highlighted: false,
      badge: null
    }
  }
} as const;

export type PricingPlanKey = keyof typeof brand.pricing;
