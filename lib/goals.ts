export type GoalId = "lead-gen" | "audience-growth" | "product-launch" | "event-promo";

export type GrowthGoal = {
  id: GoalId;
  label: string;
  labelEn: string;
  description: string;
  descriptionZh: string;
  conversionIntent: string;
  conversionIntentZh: string;
};

export const growthGoals: GrowthGoal[] = [
  {
    id: "lead-gen",
    label: "获客",
    labelEn: "Lead Gen",
    description: "Turn attention into product calls, waitlist signups, or trial users.",
    descriptionZh: "把注意力转化成产品咨询、候补名单或试用用户。",
    conversionIntent: "Drive qualified prospects to a clear next step.",
    conversionIntentZh: "引导高意向用户完成清晰的下一步。"
  },
  {
    id: "audience-growth",
    label: "涨粉",
    labelEn: "Audience Growth",
    description: "Build founder authority and repeatable audience memory.",
    descriptionZh: "建立创始人权威感，让受众反复记住你的产品。",
    conversionIntent: "Earn follows, saves, reposts, and thoughtful comments.",
    conversionIntentZh: "提升关注、收藏、转发和高质量评论。"
  },
  {
    id: "product-launch",
    label: "产品发布",
    labelEn: "Product Launch",
    description: "Package a launch into native stories for builders, buyers, and early users.",
    descriptionZh: "把一次发布包装成适合开发者、买家和早期用户的原生故事。",
    conversionIntent: "Create launch momentum, feedback, and early adoption.",
    conversionIntentZh: "制造发布势能、收集反馈并获得早期采用者。"
  },
  {
    id: "event-promo",
    label: "活动推广",
    labelEn: "Event Promo",
    description: "Turn an event into invitation posts, community prompts, and reminder assets.",
    descriptionZh: "把活动变成邀请帖、社群话题和提醒素材。",
    conversionIntent: "Increase registration, attendance, and post-event follow-up.",
    conversionIntentZh: "提升报名、到场和活动后的持续转化。"
  }
];

export function getGoal(goalId: GoalId): GrowthGoal {
  const goal = growthGoals.find((item) => item.id === goalId);

  if (!goal) {
    throw new Error(`Unsupported goal: ${goalId}`);
  }

  return goal;
}
