export type PersonaId =
  | "indie-builder"
  | "ai-saas"
  | "consultant"
  | "design-service"
  | "global-team";

export type Persona = {
  id: PersonaId;
  label: string;
  labelEn: string;
  description: string;
  descriptionZh: string;
  buyingTrigger: string;
  buyingTriggerZh: string;
};

export const personas: Persona[] = [
  {
    id: "indie-builder",
    label: "独立开发者",
    labelEn: "Indie Builder",
    description: "Solo founders shipping plugins, SaaS, side projects, and launch updates.",
    descriptionZh: "独立创始人，正在发布插件、SaaS、副业项目或产品更新。",
    buyingTrigger: "Needs launch content without hiring a marketer.",
    buyingTriggerZh: "不想招聘市场人员，也需要可发布的上线内容。"
  },
  {
    id: "ai-saas",
    label: "AI SaaS",
    labelEn: "AI SaaS",
    description: "AI tools, agents, productivity products, and developer utilities.",
    descriptionZh: "AI 工具、智能体、效率产品和开发者工具。",
    buyingTrigger: "Needs sharp positioning across PH, X, Reddit, and LinkedIn.",
    buyingTriggerZh: "需要在 Product Hunt、X、Reddit 和 LinkedIn 上形成清晰定位。"
  },
  {
    id: "consultant",
    label: "咨询顾问",
    labelEn: "Consultant",
    description: "B2B, product, design, growth, education, and AI consultants.",
    descriptionZh: "B2B、产品、设计、增长、教育和 AI 咨询顾问。",
    buyingTrigger: "Needs authority-building content that turns ideas into calls.",
    buyingTriggerZh: "需要把专业观点变成建立信任和带来预约的内容。"
  },
  {
    id: "design-service",
    label: "设计服务",
    labelEn: "Design Service",
    description: "Studios, portfolio consultants, brand designers, and product design sellers.",
    descriptionZh: "工作室、作品集顾问、品牌设计师和产品设计服务商。",
    buyingTrigger: "Needs high-trust storytelling across global and local channels.",
    buyingTriggerZh: "需要在国内外渠道讲清服务价值并建立高信任。"
  },
  {
    id: "global-team",
    label: "小型出海团队",
    labelEn: "Global Team",
    description: "Small teams selling globally with no dedicated content marketing team.",
    descriptionZh: "面向全球销售、但没有专职内容市场团队的小团队。",
    buyingTrigger: "Needs bilingual, platform-native demand generation.",
    buyingTriggerZh: "需要双语、贴合平台语感的获客内容。"
  }
];

export function getPersona(personaId: PersonaId): Persona {
  const persona = personas.find((item) => item.id === personaId);

  if (!persona) {
    throw new Error(`Unsupported persona: ${personaId}`);
  }

  return persona;
}
