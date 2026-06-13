export type GoalId = "lead-gen" | "audience-growth" | "product-launch" | "event-promo";

export type GrowthGoal = {
  id: GoalId;
  label: string;
  labelEn: string;
  description: string;
  conversionIntent: string;
};

export const growthGoals: GrowthGoal[] = [
  {
    id: "lead-gen",
    label: "获客",
    labelEn: "Lead Gen",
    description: "Turn attention into product calls, waitlist signups, or trial users.",
    conversionIntent: "Drive qualified prospects to a clear next step."
  },
  {
    id: "audience-growth",
    label: "涨粉",
    labelEn: "Audience Growth",
    description: "Build founder authority and repeatable audience memory.",
    conversionIntent: "Earn follows, saves, reposts, and thoughtful comments."
  },
  {
    id: "product-launch",
    label: "产品发布",
    labelEn: "Product Launch",
    description: "Package a launch into native stories for builders, buyers, and early users.",
    conversionIntent: "Create launch momentum, feedback, and early adoption."
  },
  {
    id: "event-promo",
    label: "活动推广",
    labelEn: "Event Promo",
    description: "Turn an event into invitation posts, community prompts, and reminder assets.",
    conversionIntent: "Increase registration, attendance, and post-event follow-up."
  }
];

export function getGoal(goalId: GoalId): GrowthGoal {
  const goal = growthGoals.find((item) => item.id === goalId);

  if (!goal) {
    throw new Error(`Unsupported goal: ${goalId}`);
  }

  return goal;
}
