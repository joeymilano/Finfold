import type { CoverStyle } from "@/lib/cover/cover-spec";

export const coverTemplateCategories = [
  "insight",
  "tutorial",
  "case-study",
  "launch",
  "report",
  "story"
] as const;

export type CoverTemplateCategory = (typeof coverTemplateCategories)[number];

export type CoverTemplate = {
  id: string;
  category: CoverTemplateCategory;
  nameZh: string;
  nameEn: string;
  style: CoverStyle;
  themeId: string;
};

/**
 * The first Finfold template pack: six common content jobs, each with four
 * genuinely different visual directions. Templates deliberately reuse the
 * deterministic cover renderers, so every exported Chinese/English character
 * stays browser-rendered instead of being painted by an image model.
 */
export const coverTemplates: CoverTemplate[] = [
  { id: "insight-ink", category: "insight", nameZh: "黑墨观点", nameEn: "Ink Opinion", style: "editorial", themeId: "ink-classic" },
  { id: "insight-photo", category: "insight", nameZh: "人物观点", nameEn: "Human Point of View", style: "photo", themeId: "midnight-ink" },
  { id: "insight-blue", category: "insight", nameZh: "蓝色宣言", nameEn: "Blue Manifesto", style: "swiss", themeId: "ikb" },
  { id: "insight-bronze", category: "insight", nameZh: "品牌立场", nameEn: "Brand Position", style: "editorial", themeId: "finfold-brand" },

  { id: "tutorial-porcelain", category: "tutorial", nameZh: "青花步骤", nameEn: "Porcelain Steps", style: "editorial", themeId: "indigo-porcelain" },
  { id: "tutorial-yellow", category: "tutorial", nameZh: "高亮教程", nameEn: "Highlight Guide", style: "swiss", themeId: "lemon-yellow" },
  { id: "tutorial-photo", category: "tutorial", nameZh: "实景教学", nameEn: "Real-world Guide", style: "photo", themeId: "forest-ink" },
  { id: "tutorial-kraft", category: "tutorial", nameZh: "手账清单", nameEn: "Notebook Checklist", style: "editorial", themeId: "kraft-paper" },

  { id: "case-forest", category: "case-study", nameZh: "深绿复盘", nameEn: "Forest Review", style: "editorial", themeId: "forest-ink" },
  { id: "case-orange", category: "case-study", nameZh: "关键转折", nameEn: "Turning Point", style: "swiss", themeId: "safety-orange" },
  { id: "case-photo", category: "case-study", nameZh: "现场案例", nameEn: "Case in Context", style: "photo", themeId: "midnight-ink" },
  { id: "case-dune", category: "case-study", nameZh: "温暖复盘", nameEn: "Warm Retrospective", style: "editorial", themeId: "dune" },

  { id: "launch-blue", category: "launch", nameZh: "新品蓝图", nameEn: "Launch Blueprint", style: "swiss", themeId: "ikb" },
  { id: "launch-photo", category: "launch", nameZh: "产品实拍", nameEn: "Product in Hand", style: "photo", themeId: "midnight-ink" },
  { id: "launch-brand", category: "launch", nameZh: "品牌首发", nameEn: "Brand Premiere", style: "editorial", themeId: "finfold-brand" },
  { id: "launch-green", category: "launch", nameZh: "增长信号", nameEn: "Growth Signal", style: "swiss", themeId: "lemon-green" },

  { id: "report-ink", category: "report", nameZh: "年度报告", nameEn: "Annual Review", style: "editorial", themeId: "ink-classic" },
  { id: "report-blue", category: "report", nameZh: "数据蓝本", nameEn: "Data Blueprint", style: "swiss", themeId: "ikb" },
  { id: "report-yellow", category: "report", nameZh: "数字头条", nameEn: "Number Headline", style: "swiss", themeId: "lemon-yellow" },
  { id: "report-porcelain", category: "report", nameZh: "研究摘要", nameEn: "Research Brief", style: "editorial", themeId: "indigo-porcelain" },

  { id: "story-photo", category: "story", nameZh: "人物故事", nameEn: "People Story", style: "photo", themeId: "midnight-ink" },
  { id: "story-kraft", category: "story", nameZh: "旅途手记", nameEn: "Field Notes", style: "editorial", themeId: "kraft-paper" },
  { id: "story-dune", category: "story", nameZh: "温柔叙事", nameEn: "Quiet Narrative", style: "editorial", themeId: "dune" },
  { id: "story-orange", category: "story", nameZh: "故事现场", nameEn: "Story in Motion", style: "swiss", themeId: "safety-orange" }
];

export function getTemplatesByCategory(category: CoverTemplateCategory): CoverTemplate[] {
  return coverTemplates.filter((template) => template.category === category);
}
