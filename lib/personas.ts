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
  buyingTrigger: string;
};

export const personas: Persona[] = [
  {
    id: "indie-builder",
    label: "独立开发者",
    labelEn: "Indie Builder",
    description: "Solo founders shipping plugins, SaaS, side projects, and launch updates.",
    buyingTrigger: "Needs launch content without hiring a marketer."
  },
  {
    id: "ai-saas",
    label: "AI SaaS",
    labelEn: "AI SaaS",
    description: "AI tools, agents, productivity products, and developer utilities.",
    buyingTrigger: "Needs sharp positioning across PH, X, Reddit, and LinkedIn."
  },
  {
    id: "consultant",
    label: "咨询顾问",
    labelEn: "Consultant",
    description: "B2B, product, design, growth, education, and AI consultants.",
    buyingTrigger: "Needs authority-building content that turns ideas into calls."
  },
  {
    id: "design-service",
    label: "设计服务",
    labelEn: "Design Service",
    description: "Studios, portfolio consultants, brand designers, and product design sellers.",
    buyingTrigger: "Needs high-trust storytelling across global and local channels."
  },
  {
    id: "global-team",
    label: "小型出海团队",
    labelEn: "Global Team",
    description: "Small teams selling globally with no dedicated content marketing team.",
    buyingTrigger: "Needs bilingual, platform-native demand generation."
  }
];

export function getPersona(personaId: PersonaId): Persona {
  const persona = personas.find((item) => item.id === personaId);

  if (!persona) {
    throw new Error(`Unsupported persona: ${personaId}`);
  }

  return persona;
}
