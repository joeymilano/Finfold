import type { BrandBrain } from "@/lib/brand-brain";
import { buildVisualIdentityPrompt } from "@/lib/brand-brain";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";
import type { VisualIntelligencePlan } from "@/lib/visual-intelligence";

export type IllustrationRole = "concept" | "process" | "comparison" | "evidence";

export type ArticleIllustrationBrief = {
  id: string;
  role: IllustrationRole;
  label: string;
  sourceExcerpt: string;
  placementHint: string;
  altText: string;
  prompt: string;
  size: "1344x768";
};

export type ArticleIllustrationPlan = {
  eligible: boolean;
  briefs: ArticleIllustrationBrief[];
  continuityDirection: string;
};

const ARTICLE_PLATFORMS = new Set<PlatformId>(["wechat", "medium-substack"]);

export function buildArticleIllustrationPlan(
  output: Pick<KitOutput, "title" | "body" | "finalBody">,
  platform: PlatformId,
  locale: Locale,
  visualPlan: Pick<VisualIntelligencePlan, "theme">,
  brandBrain?: Pick<BrandBrain, "brandName" | "toneKeywords" | "visualIdentity">
): ArticleIllustrationPlan {
  if (!ARTICLE_PLATFORMS.has(platform)) {
    return { eligible: false, briefs: [], continuityDirection: "" };
  }

  const body = (output.finalBody || output.body).trim();
  const paragraphs = splitUsefulParagraphs(body);
  if (paragraphs.length === 0) {
    return { eligible: true, briefs: [], continuityDirection: continuityCopy(visualPlan.theme, brandBrain) };
  }

  const targetCount = articleImageCount(body, paragraphs.length);
  const selected = selectEvenly(paragraphs, targetCount);
  const continuityDirection = continuityCopy(visualPlan.theme, brandBrain);

  return {
    eligible: true,
    continuityDirection,
    briefs: selected.map((paragraph, index) => {
      const excerpt = trimVisible(paragraph, locale === "zh" ? 92 : 180);
      const role = inferRole(paragraph);
      return {
        id: `article-illustration-${index + 1}`,
        role,
        label: illustrationLabel(role, index, locale),
        sourceExcerpt: excerpt,
        placementHint: locale === "zh" ? `放在这段内容之后：${trimVisible(paragraph, 44)}` : `Place after: ${trimVisible(paragraph, 78)}`,
        altText: locale === "zh" ? `${output.title}：${trimVisible(paragraph, 54)}` : `${output.title}: ${trimVisible(paragraph, 90)}`,
        prompt: illustrationPrompt(excerpt, role, continuityDirection),
        size: "1344x768"
      };
    })
  };
}

function articleImageCount(body: string, paragraphCount: number): number {
  const length = Array.from(body.replace(/\s+/g, "")).length;
  if (length > 2200 && paragraphCount >= 6) return 4;
  if (length > 1000 && paragraphCount >= 4) return 3;
  if (length > 220 || paragraphCount >= 3) return 2;
  return 1;
}

function splitUsefulParagraphs(source: string): string[] {
  const cleaned = source.replace(/```[\s\S]*?```/g, " ").replace(/^#{1,6}\s+/gm, "").trim();
  const paragraphs = cleaned.split(/\n\s*\n/).map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 28);
  if (paragraphs.length > 0) return paragraphs;
  return cleaned.split(/(?<=[。！？!?])\s*/).map((item) => item.trim()).filter((item) => item.length >= 24);
}

function selectEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round(((index + 1) * (items.length - 1)) / (count + 1));
    return items[position];
  });
}

function inferRole(source: string): IllustrationRole {
  if (/\b(vs\.?|versus|compared?|before|after)\b|对比|相比|以前|现在/iu.test(source)) return "comparison";
  if (/(?:^|\s)(?:[-*•]|\d+[.)、])|步骤|流程|方法|首先|然后|最后|first|then|finally/iu.test(source)) return "process";
  if (/\b\d+(?:\.\d+)?%?\b|数据|结果|证据|增长|下降|metric|result|evidence|growth/iu.test(source)) return "evidence";
  return "concept";
}

function continuityCopy(theme: VisualIntelligencePlan["theme"], brandBrain?: Pick<BrandBrain, "brandName" | "toneKeywords" | "visualIdentity">): string {
  const themeDirections = {
    editorial: "warm editorial illustration, tactile paper texture, restrained composition",
    signal: "high-contrast information design, precise geometric rhythm, dark technical atmosphere",
    "field-notes": "human field-note aesthetic, imperfect tactile marks, candid documentary warmth"
  } as const;
  const brandDirection = brandBrain ? buildVisualIdentityPrompt(brandBrain) : "";
  return [themeDirections[theme], brandDirection].filter(Boolean).join(". ");
}

function illustrationPrompt(excerpt: string, role: IllustrationRole, continuity: string): string {
  const roleDirection: Record<IllustrationRole, string> = {
    concept: "Express the idea through one clear editorial metaphor.",
    process: "Show a directional sequence through objects and spatial progression, without labels.",
    comparison: "Build a clear left-to-right visual contrast without captions or split-screen text.",
    evidence: "Suggest evidence and measurement through abstract physical forms; never invent charts, numbers, or UI."
  };
  return [
    `Create a landscape editorial illustration grounded only in this source idea: "${excerpt}"`,
    roleDirection[role],
    continuity,
    "No text, letters, numbers, logos, watermarks, dashboards, fake interfaces, or unsupported product claims. Leave breathing room for article layout."
  ].filter(Boolean).join(" ");
}

function illustrationLabel(role: IllustrationRole, index: number, locale: Locale): string {
  const labels: Record<IllustrationRole, { zh: string; en: string }> = {
    concept: { zh: "概念转场", en: "Concept bridge" },
    process: { zh: "方法拆解", en: "Process visual" },
    comparison: { zh: "对比画面", en: "Comparison visual" },
    evidence: { zh: "证据画面", en: "Evidence visual" }
  };
  return `${String(index + 1).padStart(2, "0")} · ${labels[role][locale]}`;
}

function trimVisible(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return Array.from(normalized).length > max ? `${Array.from(normalized).slice(0, max).join("")}…` : normalized;
}
