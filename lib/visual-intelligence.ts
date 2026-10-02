import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";
import type { BrandBrain } from "@/lib/brand-brain";
import type { VisualStoryTheme } from "@/lib/visual-story";
import {
  buildContentSkillPlan,
  type ContentSkillId,
  type ContentSkillLayout,
  type ContentSkillStrategy
} from "@/lib/content-skills";
import {
  visualStoryFormats,
  type VisualStoryFormatId
} from "@/lib/visual-story-formats";

export type VisualAssetKind = "carousel" | "article-cover" | "social-card" | "launch-gallery" | "thread-media";
export type VisualStudio = "story" | "cover";
export type VisualPageCount = 5 | 7 | 9;

export type VisualIntelligencePlan = {
  skillId: ContentSkillId;
  strategy: ContentSkillStrategy;
  layout: ContentSkillLayout;
  outcome: string;
  steps: string[];
  assetKind: VisualAssetKind;
  primaryStudio: VisualStudio;
  formatId: VisualStoryFormatId;
  pageCount: VisualPageCount;
  theme: VisualStoryTheme;
  title: string;
  rationale: string;
  formatSummary: string;
  confidence: "high" | "medium";
  brandAligned: boolean;
  paletteOverride?: {
    paper?: string;
    ink?: string;
    accent?: string;
  };
};

type PlatformVisualProfile = {
  assetKind: VisualAssetKind;
  primaryStudio: VisualStudio;
  formatId: VisualStoryFormatId;
  basePages: VisualPageCount;
  theme: VisualStoryTheme;
};

const PLATFORM_PROFILES: Record<PlatformId, PlatformVisualProfile> = {
  xiaohongshu: { assetKind: "carousel", primaryStudio: "story", formatId: "portrait-3x4", basePages: 7, theme: "editorial" },
  zhihu: { assetKind: "article-cover", primaryStudio: "cover", formatId: "social-preview", basePages: 5, theme: "editorial" },
  instagram: { assetKind: "carousel", primaryStudio: "story", formatId: "portrait-4x5", basePages: 5, theme: "editorial" },
  linkedin: { assetKind: "carousel", primaryStudio: "story", formatId: "portrait-4x5", basePages: 7, theme: "signal" },
  threads: { assetKind: "carousel", primaryStudio: "story", formatId: "portrait-3x4", basePages: 5, theme: "field-notes" },
  facebook: { assetKind: "carousel", primaryStudio: "story", formatId: "portrait-4x5", basePages: 5, theme: "editorial" },
  "product-hunt": { assetKind: "launch-gallery", primaryStudio: "story", formatId: "product-hunt-gallery", basePages: 5, theme: "signal" },
  wechat: { assetKind: "article-cover", primaryStudio: "cover", formatId: "wechat-2.35x1", basePages: 5, theme: "editorial" },
  "medium-substack": { assetKind: "article-cover", primaryStudio: "cover", formatId: "social-preview", basePages: 5, theme: "editorial" },
  x: { assetKind: "thread-media", primaryStudio: "story", formatId: "square-1x1", basePages: 5, theme: "signal" },
  moments: { assetKind: "social-card", primaryStudio: "cover", formatId: "square-1x1", basePages: 5, theme: "field-notes" },
  reddit: { assetKind: "social-card", primaryStudio: "cover", formatId: "square-1x1", basePages: 5, theme: "signal" },
  "hacker-news": { assetKind: "social-card", primaryStudio: "cover", formatId: "social-preview", basePages: 5, theme: "signal" },
  "indie-hackers": { assetKind: "social-card", primaryStudio: "cover", formatId: "social-preview", basePages: 5, theme: "field-notes" }
};

const TECHNICAL_SIGNAL = /\b(ai|api|data|system|software|code|developer|saas|workflow|automation|architecture|metric|benchmark)\b|人工智能|数据|系统|代码|开发|自动化|架构|指标/iu;
const HUMAN_SIGNAL = /\b(founder|journey|story|lesson|behind the scenes|building in public|reflection)\b|创始人|故事|经历|复盘|幕后|一路|感受/iu;

export function buildVisualIntelligencePlan(
  output: Pick<KitOutput, "platform" | "title" | "body" | "finalBody" | "cta">,
  locale: Locale,
  brandBrain?: Pick<BrandBrain, "toneKeywords" | "visualIdentity">
): VisualIntelligencePlan {
  const profile = PLATFORM_PROFILES[output.platform];
  const source = `${output.title}\n${output.finalBody || output.body}\n${output.cta}`.trim();
  const format = visualStoryFormats[profile.formatId];
  const skillPlan = buildContentSkillPlan(output, locale);
  const pageCount = recommendPageCount(source, profile);
  const theme = recommendTheme(source, output.platform, profile, brandBrain, skillPlan.theme);
  const title = assetTitle(profile.assetKind, pageCount, locale);
  const rationale = assetRationale(output.platform, profile.assetKind, source, locale);

  return {
    skillId: skillPlan.id,
    strategy: skillPlan.strategy,
    layout: skillPlan.layout,
    outcome: skillPlan.outcome,
    steps: skillPlan.steps,
    assetKind: profile.assetKind,
    primaryStudio: profile.primaryStudio,
    formatId: profile.formatId,
    pageCount,
    theme,
    title,
    rationale,
    formatSummary: `${format.width}×${format.height} · ${format.ratio}`,
    confidence: profile.primaryStudio === "story" || output.platform === "wechat" ? "high" : "medium",
    brandAligned: Boolean(
      brandBrain && (
        brandBrain.visualIdentity.preferredTheme !== "auto" ||
        brandBrain.visualIdentity.styleKeywords.length > 0 ||
        brandBrain.visualIdentity.learnedPreferences.length > 0 ||
        Object.values(brandBrain.visualIdentity.palette).some(Boolean)
      )
    ),
    paletteOverride: brandBrain ? buildPaletteOverride(brandBrain.visualIdentity.palette) : undefined
  };
}

function buildPaletteOverride(palette: BrandBrain["visualIdentity"]["palette"]): VisualIntelligencePlan["paletteOverride"] {
  const override = {
    paper: palette.background || undefined,
    ink: palette.primary || undefined,
    accent: palette.accent || undefined
  };
  return Object.values(override).some(Boolean) ? override : undefined;
}

function recommendPageCount(source: string, profile: PlatformVisualProfile): VisualPageCount {
  if (profile.primaryStudio === "cover") return 5;

  const visibleLength = Array.from(source.replace(/\s+/g, "")).length;
  const structuredPoints = (source.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)、])/gm) || []).length;
  if (visibleLength > 2600 || structuredPoints >= 8) return 9;
  if (visibleLength > 850 || structuredPoints >= 5 || profile.basePages === 7) return 7;
  return 5;
}

function recommendTheme(
  source: string,
  platform: PlatformId,
  profile: PlatformVisualProfile,
  brandBrain?: Pick<BrandBrain, "toneKeywords" | "visualIdentity">,
  skillTheme?: VisualStoryTheme
): VisualStoryTheme {
  const preferred = brandBrain?.visualIdentity.preferredTheme;
  if (preferred && preferred !== "auto") return preferred;
  const learned = brandBrain?.visualIdentity.learnedPreferences.find((item) => item.platform === platform && item.sampleSize >= 4 && item.liftPercent >= 25);
  if (learned) return learned.theme;
  const combined = `${source} ${brandBrain?.visualIdentity.styleKeywords.join(" ") ?? ""} ${brandBrain?.toneKeywords.join(" ") ?? ""}`;
  if (TECHNICAL_SIGNAL.test(combined)) return "signal";
  if (HUMAN_SIGNAL.test(combined)) return "field-notes";
  return skillTheme ?? profile.theme;
}

function assetTitle(kind: VisualAssetKind, pageCount: VisualPageCount, locale: Locale): string {
  const labels: Record<VisualAssetKind, { zh: string; en: string }> = {
    carousel: { zh: `${pageCount} 页平台原生图文`, en: `${pageCount}-page native carousel` },
    "article-cover": { zh: "文章封面与分享预览", en: "Article cover and social preview" },
    "social-card": { zh: "高信号社交卡片", en: "High-signal social card" },
    "launch-gallery": { zh: `${pageCount} 页产品展示组`, en: `${pageCount}-page product gallery` },
    "thread-media": { zh: `${pageCount} 张 X 串文配图`, en: `${pageCount} X thread media cards` }
  };
  return labels[kind][locale];
}

function assetRationale(platform: PlatformId, kind: VisualAssetKind, source: string, locale: Locale): string {
  const hasList = /(?:^|\n)\s*(?:[-*•]|\d+[.)、])/m.test(source);
  if (locale === "en") {
    if (kind === "article-cover") return "Prioritizes a strong article entry image while keeping a carousel draft ready for excerpts.";
    if (kind === "social-card") return "Compresses the core claim into one shareable visual; a multi-page version remains available when needed.";
    if (kind === "launch-gallery") return "Turns the launch narrative into a gallery that moves from problem to proof to action.";
    return hasList
      ? "The source already contains save-worthy points, so Finfold mapped them into a platform-native sequence."
      : `Finfold split the ${platform} narrative into a hook, evidence, conclusion, and action.`;
  }

  if (kind === "article-cover") return "优先解决文章入口图，同时保留可用于摘录传播的图文草稿。";
  if (kind === "social-card") return "先把核心判断压缩成一张可分享视觉，需要时仍可展开成多页。";
  if (kind === "launch-gallery") return "按问题、价值、证据与行动组织成产品展示序列。";
  return hasList
    ? "正文已有可收藏要点，Finfold 已自动整理为平台原生浏览顺序。"
    : "已按钩子、论证、结论与行动拆成连贯的图文叙事。";
}
