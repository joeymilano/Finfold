import type { CoverSize, CoverSizeId } from "@/lib/cover/cover-spec";
import { coverSizes } from "@/lib/cover/cover-spec";
import type { KitOutput } from "@/lib/content-schema";

/**
 * Deterministic infographic generation. Layouts define how facts are
 * structured; styles reuse the cover theme assets (editorial papers and
 * swiss accents), so every visible character stays browser-rendered —
 * no image model touches the copy.
 */

export type InfographicLayout = "stats-grid" | "timeline" | "process" | "comparison" | "checklist" | "quote-board";
export type InfographicStyle = "editorial" | "swiss";

export type InfographicItem = {
  label: string;
  value?: string;
  note?: string;
};

export type InfographicSpec = {
  layout: InfographicLayout;
  style: InfographicStyle;
  themeId: string;
  title: string;
  subtitle: string;
  items: InfographicItem[];
  footer: string;
};

export type InfographicLayoutOption = {
  id: InfographicLayout;
  nameZh: string;
  nameEn: string;
  hintZh: string;
  hintEn: string;
  minItems: number;
  maxItems: number;
};

export const infographicLayouts: InfographicLayoutOption[] = [
  { id: "stats-grid", nameZh: "数据网格", nameEn: "Stats Grid", hintZh: "把关键数字放大成卡片", hintEn: "Enlarge the key numbers into cards", minItems: 2, maxItems: 4 },
  { id: "timeline", nameZh: "时间线", nameEn: "Timeline", hintZh: "按先后讲清里程碑", hintEn: "Milestones in order", minItems: 2, maxItems: 6 },
  { id: "process", nameZh: "流程步骤", nameEn: "Process", hintZh: "编号步骤带出做法", hintEn: "Numbered how-to steps", minItems: 2, maxItems: 5 },
  { id: "comparison", nameZh: "对比", nameEn: "Comparison", hintZh: "左右两栏看清差异", hintEn: "Two columns, one decision", minItems: 2, maxItems: 6 },
  { id: "checklist", nameZh: "清单", nameEn: "Checklist", hintZh: "可勾选的行动要点", hintEn: "Actionable check-offs", minItems: 2, maxItems: 7 },
  { id: "quote-board", nameZh: "金句板", nameEn: "Quote Board", hintZh: "一句核心观点站上主视觉", hintEn: "One core claim, full bleed", minItems: 1, maxItems: 1 }
];

export const infographicSizeIds: CoverSizeId[] = ["xhs-3x4", "square-1x1"];

export function getInfographicSize(sizeId: CoverSizeId): CoverSize {
  return coverSizes[sizeId] ?? coverSizes["xhs-3x4"];
}

export function infographicFilename(sizeId: CoverSizeId): string {
  return `finfold-infographic-${sizeId}-${new Date().toISOString().slice(0, 10)}.png`;
}

export function getInfographicLayout(id: InfographicLayout): InfographicLayoutOption {
  return infographicLayouts.find((layout) => layout.id === id) ?? infographicLayouts[0];
}

/**
 * Seed an editable spec from a kit output: prefer list lines from the body,
 * fall back to leading sentences, and surface any embedded numbers as card
 * values so the stats grid starts life meaningful.
 */
export function defaultInfographicSpec(output: Pick<KitOutput, "title" | "body" | "finalBody">): InfographicSpec {
  const body = (output.finalBody || output.body || "").trim();
  const listLines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(?:[-*•]|\d+[.)、])\s*/u.test(line))
    .map((line) => line.replace(/^(?:[-*•]|\d+[.)、])\s*/u, "").trim());

  const sentences = body
    .replace(/^#{1,6}\s+/gmu, "")
    .split(/(?<=[。！？!?])|\n{2,}/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 8);

  const source = listLines.length >= 2 ? listLines : sentences.slice(0, 4);
  const items: InfographicItem[] = (source.length > 0 ? source : ["要点一", "要点二", "要点三"]).slice(0, 4).map((line) => {
    const numberMatch = line.match(/(\d+(?:\.\d+)?\s*[%倍万亿千百])/u);
    return {
      label: line.slice(0, 24),
      value: numberMatch ? numberMatch[1].trim() : undefined,
      note: undefined
    };
  });

  const firstSentence = sentences[0] ?? "";

  return {
    layout: "stats-grid",
    style: "editorial",
    themeId: "ink-classic",
    title: output.title.trim() || "增长要点",
    subtitle: firstSentence.slice(0, 30),
    items,
    footer: "Finfold · Content Studio"
  };
}
