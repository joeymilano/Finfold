import type { KitOutput } from "@/lib/content-schema";
import type { PlatformId } from "@/lib/platforms";

export type CoverStyle = "photo" | "editorial" | "swiss";
export type CoverLayout = "hero" | "statement";

export type CoverSizeId = "xhs-3x4" | "wechat-21x9" | "wechat-1x1" | "wide-16x9" | "square-1x1";

export type CoverSize = {
  id: CoverSizeId;
  label: string;
  /** Final exported pixel dimensions */
  width: number;
  height: number;
  /** DOM node size in CSS px — captured at `scale` to hit width/height exactly */
  cssWidth: number;
  cssHeight: number;
  scale: number;
};

export const coverSizes: Record<CoverSizeId, CoverSize> = {
  "xhs-3x4": { id: "xhs-3x4", label: "1080×1440 · 3:4", width: 1080, height: 1440, cssWidth: 540, cssHeight: 720, scale: 2 },
  "wechat-21x9": { id: "wechat-21x9", label: "2100×900 · 21:9", width: 2100, height: 900, cssWidth: 700, cssHeight: 300, scale: 3 },
  "wechat-1x1": { id: "wechat-1x1", label: "1080×1080 · 1:1", width: 1080, height: 1080, cssWidth: 540, cssHeight: 540, scale: 2 },
  "wide-16x9": { id: "wide-16x9", label: "1600×900 · 16:9", width: 1600, height: 900, cssWidth: 800, cssHeight: 450, scale: 2 },
  "square-1x1": { id: "square-1x1", label: "1080×1080 · 1:1", width: 1080, height: 1080, cssWidth: 540, cssHeight: 540, scale: 2 }
};

export type PlatformCoverSpec = {
  recommendedStyle: CoverStyle;
  /** Ordered size ids to render for this platform. WeChat renders a paired set. */
  sizes: CoverSizeId[];
  defaultLayout: CoverLayout;
};

export const platformCoverSpecs: Record<PlatformId, PlatformCoverSpec> = {
  xiaohongshu: { recommendedStyle: "photo", sizes: ["xhs-3x4"], defaultLayout: "hero" },
  zhihu: { recommendedStyle: "editorial", sizes: ["wide-16x9"], defaultLayout: "hero" },
  wechat: { recommendedStyle: "editorial", sizes: ["wechat-21x9", "wechat-1x1"], defaultLayout: "hero" },
  moments: { recommendedStyle: "editorial", sizes: ["square-1x1"], defaultLayout: "hero" },
  "medium-substack": { recommendedStyle: "editorial", sizes: ["wide-16x9"], defaultLayout: "hero" },
  x: { recommendedStyle: "swiss", sizes: ["wide-16x9"], defaultLayout: "statement" },
  linkedin: { recommendedStyle: "swiss", sizes: ["wide-16x9"], defaultLayout: "statement" },
  instagram: { recommendedStyle: "photo", sizes: ["square-1x1"], defaultLayout: "hero" },
  facebook: { recommendedStyle: "swiss", sizes: ["wide-16x9"], defaultLayout: "statement" },
  "product-hunt": { recommendedStyle: "swiss", sizes: ["square-1x1"], defaultLayout: "statement" },
  "hacker-news": { recommendedStyle: "swiss", sizes: ["square-1x1"], defaultLayout: "statement" },
  "indie-hackers": { recommendedStyle: "swiss", sizes: ["square-1x1"], defaultLayout: "statement" },
  reddit: { recommendedStyle: "swiss", sizes: ["square-1x1"], defaultLayout: "statement" },
  threads: { recommendedStyle: "swiss", sizes: ["square-1x1"], defaultLayout: "statement" }
};

export type CoverConfig = {
  style: CoverStyle;
  themeId: string;
  layout: CoverLayout;
  /** Short title override for the WeChat 1:1 companion cover */
  shortTitle: string;
  /** Normalized source-image focal point used by deterministic platform crops. */
  focalPoint?: { x: number; y: number };
  /** Photo-style composition. Omitted falls back to the legacy cinematic full-bleed. */
  photoComposition?: PhotoComposition;
};

export type PhotoComposition = "cinematic" | "split" | "portrait-window" | "bottom-band";

export type PhotoCompositionOption = {
  id: PhotoComposition;
  nameZh: string;
  nameEn: string;
  hintZh: string;
  hintEn: string;
};

/**
 * Person-forward compositions for creator-lead covers. `cinematic` keeps the
 * legacy full-bleed treatment; the other three change how the source photo
 * and the copy share the canvas while every visible word stays
 * browser-rendered — the title always lands in a reserved safe zone instead
 * of fighting the subject for attention.
 */
export const photoCompositions: PhotoCompositionOption[] = [
  { id: "cinematic", nameZh: "沉浸式", nameEn: "Cinematic", hintZh: "整幅照片打底，文字叠在渐变上", hintEn: "Full-bleed photo with copy over the gradient" },
  { id: "split", nameZh: "分栏", nameEn: "Split", hintZh: "照片与文字各占一侧，互不遮挡", hintEn: "Photo and copy each own their half" },
  { id: "portrait-window", nameZh: "人物窗", nameEn: "Portrait Window", hintZh: "圆角人物窗在上，标题留在安全区", hintEn: "Rounded portrait window above a safe title zone" },
  { id: "bottom-band", nameZh: "标题带", nameEn: "Bottom Band", hintZh: "照片在上，底部色带承载标题", hintEn: "Photo on top with a solid title band" }
];

export function resolvePhotoComposition(config: Pick<CoverConfig, "photoComposition">): PhotoComposition {
  return config.photoComposition ?? "cinematic";
}

export function getPlatformCoverSpec(platform: PlatformId): PlatformCoverSpec {
  return platformCoverSpecs[platform];
}

export function isWechatPair(platform: PlatformId): boolean {
  return platformCoverSpecs[platform].sizes.length > 1;
}

export type CoverTypeScale = {
  titlePx: number;
  kickerPx: number;
  metaPx: number;
  bodyPx: number;
};

/**
 * Per-size type scale in CSS px (pre-`scale` capture multiplier). Tuned so
 * that display titles stay legible on the tightest board (wechat-21x9) while
 * scaling up on the tallest one (xhs-3x4).
 */
export const coverTypeScales: Record<CoverSizeId, CoverTypeScale> = {
  "xhs-3x4": { titlePx: 58, kickerPx: 12, metaPx: 11, bodyPx: 16 },
  "wechat-21x9": { titlePx: 42, kickerPx: 11, metaPx: 10, bodyPx: 14 },
  "wechat-1x1": { titlePx: 50, kickerPx: 11, metaPx: 10, bodyPx: 15 },
  "wide-16x9": { titlePx: 46, kickerPx: 11, metaPx: 10, bodyPx: 15 },
  "square-1x1": { titlePx: 50, kickerPx: 11, metaPx: 10, bodyPx: 15 }
};

export function getCoverTypeScale(sizeId: CoverSizeId): CoverTypeScale {
  return coverTypeScales[sizeId];
}

export function defaultCoverConfig(platform: PlatformId, output: Pick<KitOutput, "title" | "imageUrl" | "imageSource">): CoverConfig {
  const spec = getPlatformCoverSpec(platform);
  const style = spec.recommendedStyle === "photo" && !output.imageUrl ? "editorial" : spec.recommendedStyle;

  return {
    style,
    themeId: style === "swiss" ? "ikb" : style === "photo" ? "midnight-ink" : "ink-classic",
    layout: spec.defaultLayout,
    shortTitle: output.title,
    focalPoint: output.imageSource?.focalPoint
  };
}
