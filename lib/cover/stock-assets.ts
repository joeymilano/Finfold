import type { Locale } from "@/lib/i18n";

export type CoverAssetProvider = "pexels" | "pixabay" | "upload" | "ai" | "existing";

export type CoverAsset = {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  alt: string;
  provider: CoverAssetProvider;
  photographer?: string;
  photographerUrl?: string;
  sourceUrl?: string;
  licenseName: string;
  licenseUrl?: string;
  attributionRequired: boolean;
};

export const stockSearchPresets = [
  { id: "curated", query: "", labelZh: "编辑精选", labelEn: "Curated" },
  { id: "people", query: "creative people", labelZh: "人物", labelEn: "People" },
  { id: "workspace", query: "creative workspace", labelZh: "工作空间", labelEn: "Workspace" },
  { id: "technology", query: "technology product", labelZh: "科技产品", labelEn: "Technology" },
  { id: "lifestyle", query: "modern lifestyle", labelZh: "生活方式", labelEn: "Lifestyle" },
  { id: "travel", query: "travel city", labelZh: "旅行城市", labelEn: "Travel" },
  { id: "nature", query: "nature texture", labelZh: "自然", labelEn: "Nature" }
] as const;

export type StockProvider = "pexels" | "pixabay";

export function stockProviderName(provider: StockProvider): string {
  return provider === "pixabay" ? "Pixabay" : "Pexels";
}

export function stockPresetLabel(preset: (typeof stockSearchPresets)[number], locale: Locale): string {
  return locale === "en" ? preset.labelEn : preset.labelZh;
}
export function coverAssetAttribution(asset: CoverAsset, locale: Locale): string {
  if (asset.provider === "pexels" && asset.photographer) {
    return locale === "en"
      ? `Photo by ${asset.photographer} on Pexels`
      : `摄影：${asset.photographer} · Pexels`;
  }
  if (asset.provider === "pixabay" && asset.photographer) {
    return locale === "en"
      ? `Image by ${asset.photographer} from Pixabay`
      : `图片作者：${asset.photographer} · Pixabay`;
  }
  if (asset.provider === "upload") return locale === "en" ? "Your upload" : "你的上传";
  if (asset.provider === "ai") return locale === "en" ? "AI-generated visual" : "AI 生成视觉";
  return locale === "en" ? "Existing cover visual" : "现有封面视觉";
}
