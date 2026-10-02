export type PersonaId =
  // 专业 / 商业人群
  | "indie-builder"
  | "ai-saas"
  | "consultant"
  | "design-service"
  | "global-team"
  // 大众 / 消费人群
  | "general-office"
  | "young-women"
  | "moms"
  | "students"
  | "foodies"
  | "fitness"
  | "travel"
  | "consumer-tech"
  | "gamers"
  | "home-life";

export type PersonaGroup = "professional" | "consumer";

export type Persona = {
  id: PersonaId;
  group: PersonaGroup;
  label: string;
  labelEn: string;
  description: string;
  descriptionZh: string;
  buyingTrigger: string;
  buyingTriggerZh: string;
};

export const personas: Persona[] = [
  // ────────────── 专业 / 商业人群 ──────────────
  {
    id: "indie-builder",
    group: "professional",
    label: "独立开发者",
    labelEn: "Indie Builder",
    description: "Solo founders shipping plugins, SaaS, side projects, and launch updates.",
    descriptionZh: "独立创始人，正在发布插件、SaaS、副业项目或产品更新。",
    buyingTrigger: "Needs launch content without hiring a marketer.",
    buyingTriggerZh: "不想招聘市场人员，也需要可发布的上线内容。"
  },
  {
    id: "ai-saas",
    group: "professional",
    label: "AI SaaS",
    labelEn: "AI SaaS",
    description: "AI tools, agents, productivity products, and developer utilities.",
    descriptionZh: "AI 工具、智能体、效率产品和开发者工具。",
    buyingTrigger: "Needs sharp positioning across PH, X, Reddit, and LinkedIn.",
    buyingTriggerZh: "需要在 Product Hunt、X、Reddit 和 LinkedIn 上形成清晰定位。"
  },
  {
    id: "consultant",
    group: "professional",
    label: "咨询顾问",
    labelEn: "Consultant",
    description: "B2B, product, design, growth, education, and AI consultants.",
    descriptionZh: "B2B、产品、设计、增长、教育和 AI 咨询顾问。",
    buyingTrigger: "Needs authority-building content that turns ideas into calls.",
    buyingTriggerZh: "需要把专业观点变成建立信任和带来预约的内容。"
  },
  {
    id: "design-service",
    group: "professional",
    label: "设计服务",
    labelEn: "Design Service",
    description: "Studios, portfolio consultants, brand designers, and product design sellers.",
    descriptionZh: "工作室、作品集顾问、品牌设计师和产品设计服务商。",
    buyingTrigger: "Needs high-trust storytelling across global and local channels.",
    buyingTriggerZh: "需要在国内外渠道讲清服务价值并建立高信任。"
  },
  {
    id: "global-team",
    group: "professional",
    label: "小型出海团队",
    labelEn: "Global Team",
    description: "Small teams selling globally with no dedicated content marketing team.",
    descriptionZh: "面向全球销售、但没有专职内容市场团队的小团队。",
    buyingTrigger: "Needs bilingual, platform-native demand generation.",
    buyingTriggerZh: "需要双语、贴合平台语感的获客内容。"
  },
  // ────────────── 大众 / 消费人群 ──────────────
  {
    id: "general-office",
    group: "consumer",
    label: "上班族",
    labelEn: "Office Workers",
    description:
      "Everyday 9-to-5 office workers. Write in plain, conversational language that mirrors their daily work-life — like a coworker venting or sharing a tip. No corporate jargon, no English terms.",
    descriptionZh:
      "朝九晚五的普通上班族。用大白话、像同事聊天一样写，戳中加班、KPI、涨薪、摸鱼这些日常共鸣点，别用职场黑话和英文术语。",
    buyingTrigger: "Real, tangible wins: less overtime, more pay, fewer mistakes.",
    buyingTriggerZh: "省时间、少加班、多搞钱、少踩坑这些实在好处。"
  },
  {
    id: "young-women",
    group: "consumer",
    label: "爱美女生",
    labelEn: "Beauty & Lifestyle",
    description:
      "Women aged 18–35 into skincare, fashion, fitness, and lifestyle. Write like a close friend sharing a real find — light, visual, emotional, experience-first. No lectures, no hard-sell.",
    descriptionZh:
      "18–35 岁爱美女性，关注护肤、穿搭、身材、生活品质。像闺蜜安利一样写，有真实体验感、有情绪、有画面，别端着说教，别硬广。",
    buyingTrigger: "Real before/after results and genuine 'must-buy' moments.",
    buyingTriggerZh: "变美、变好的真实前后对比，和被种草的心动瞬间。"
  },
  {
    id: "moms",
    group: "consumer",
    label: "宝妈群体",
    labelEn: "Moms & Parents",
    description:
      "Mothers juggling kids, family budget, and almost zero personal time. Write warm, practical, problem-solving content in a relatable mom-to-mom voice. Never trigger anxiety or guilt.",
    descriptionZh:
      "带娃的妈妈，要兼顾孩子、家庭开销和几乎为零的个人时间。像妈妈之间互相支招一样写，实用、有温度、解决具体烦恼，绝不制造焦虑和愧疚。",
    buyingTrigger: "Practical solutions that save time, money, or worry for the family.",
    buyingTriggerZh: "能省心、省钱、对孩子好、让自己轻松一点的实用方案。"
  },
  {
    id: "students",
    group: "consumer",
    label: "学生党",
    labelEn: "Students",
    description:
      "Middle-school to college students on tight budgets who chase trends and new experiences. Write fun, meme-aware, value-first, peer-to-peer. No lecturing or 'dad-talk'.",
    descriptionZh:
      "中学生到大学生，预算有限、爱跟热点、爱尝鲜。像同学之间分享一样写，好玩、有梗、性价比优先，千万别爹味说教。",
    buyingTrigger: "Cheap, cool, and on-trend — what earns status among peers.",
    buyingTriggerZh: "便宜好用、有面子、跟得上潮流、同学间有话题。"
  },
  {
    id: "foodies",
    group: "consumer",
    label: "美食爱好者",
    labelEn: "Foodies",
    description:
      "People who live to eat, hunt restaurants, and cook. Write vivid, crave-worthy, honest-tasting content that makes them hungry. Skip empty hype.",
    descriptionZh:
      "爱吃、爱探店、爱下厨的人。写得有画面、有馋劲、有真实口味评价，让人看着就饿，别用华丽空话堆砌。",
    buyingTrigger: "Delicious, photogenic, 'worth a special trip' experiences.",
    buyingTriggerZh: "好吃、好看、值得专门跑一趟的真实体验。"
  },
  {
    id: "fitness",
    group: "consumer",
    label: "健身运动",
    labelEn: "Fitness Enthusiasts",
    description:
      "People into gym, running, yoga, or fat loss. Write motivating, method-driven, authentic content that makes them want to move. Never body-shame or sell anxiety.",
    descriptionZh:
      "健身、跑步、瑜伽、减脂人群。写得有激励感、有方法、有坚持下来的真实感，能让人想动起来，绝不贩卖身材焦虑。",
    buyingTrigger: "Effective, sustainable methods with visible progress.",
    buyingTriggerZh: "真有效、坚持得下去、能看见变化的方法。"
  },
  {
    id: "travel",
    group: "consumer",
    label: "旅游出行",
    labelEn: "Travel Lovers",
    description:
      "People who love traveling, check-ins, and discovering hidden gems. Write practical, visual, tip-rich content with honest heads-up about tourist traps.",
    descriptionZh:
      "爱旅行、爱打卡、爱挖小众目的地的人。写得有攻略价值、有画面、有避坑提醒，像朋友回来给你讲真实体验。",
    buyingTrigger: "Fun, pitfall-free, genuinely worth-the-trip experiences.",
    buyingTriggerZh: "好玩、不踩雷、真的值得去的体验。"
  },
  {
    id: "consumer-tech",
    group: "consumer",
    label: "数码爱好者",
    labelEn: "Consumer Tech Fans",
    description:
      "Everyday users (not developers) into phones, laptops, and smart home gadgets. Explain real-world usefulness and value in plain language — avoid spec sheets and jargon.",
    descriptionZh:
      "关注手机、电脑、智能家居的普通用户（不是程序员）。用大白话讲清好不好用、值不值，别堆参数和专业术语。",
    buyingTrigger: "Easy to use, good value, solves a real daily problem.",
    buyingTriggerZh: "好用、值得买、能解决日常实际问题。"
  },
  {
    id: "gamers",
    group: "consumer",
    label: "游戏玩家",
    labelEn: "Gamers",
    description:
      "Gamers who chase new releases and share walkthroughs. Write meme-savvy, relatable, tip-rich content like players chatting — never sound like an ad.",
    descriptionZh:
      "爱玩游戏、追新游、爱分享攻略的人。写得有梗、有共鸣、有干货，像玩家之间聊游戏，别像广告。",
    buyingTrigger: "Fun, perks, and a sense of community belonging.",
    buyingTriggerZh: "好玩、有福利、有社群归属感。"
  },
  {
    id: "home-life",
    group: "consumer",
    label: "家居生活",
    labelEn: "Home & Lifestyle",
    description:
      "People into decor, organization, and useful everyday home goods. Write practical, good-looking, problem-solving content — skip vague 'lifestyle' talk.",
    descriptionZh:
      "关注家装、收纳、生活好物的人。写得实用、有颜值、能解决居家烦恼，别空谈生活方式。",
    buyingTrigger: "Useful, happiness-boosting, well-priced finds.",
    buyingTriggerZh: "好用、能提升幸福感、性价比高的好物。"
  }
];

export function getPersona(personaId: PersonaId): Persona {
  const persona = personas.find((item) => item.id === personaId);

  if (!persona) {
    throw new Error(`Unsupported persona: ${personaId}`);
  }

  return persona;
}
