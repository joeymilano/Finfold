import type { PlatformId } from "@/lib/platforms";

export type VisualStoryFormatId =
  | "portrait-3x4"
  | "portrait-4x5"
  | "square-1x1"
  | "story-9x16"
  | "landscape-1.91x1"
  | "video-16x9"
  | "wechat-2.35x1"
  | "product-hunt-gallery"
  | "social-preview";

export type VisualStoryFormat = {
  id: VisualStoryFormatId;
  labelZh: string;
  labelEn: string;
  usageZh: string;
  usageEn: string;
  ratio: string;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  scale: number;
  safeInsets?: { top: number; right: number; bottom: number; left: number };
  source: {
    label: string;
    url: string;
    official: boolean;
  };
};

export const visualStoryFormats: Record<VisualStoryFormatId, VisualStoryFormat> = {
  "portrait-3x4": {
    id: "portrait-3x4",
    labelZh: "竖版图文",
    labelEn: "Portrait post",
    usageZh: "小红书 · Instagram",
    usageEn: "Xiaohongshu · Instagram",
    ratio: "3:4",
    width: 1080,
    height: 1440,
    cssWidth: 540,
    cssHeight: 720,
    scale: 2,
    source: {
      label: "Instagram Help Center",
      url: "https://www.facebook.com/help/1631821640426723/",
      official: true
    }
  },
  "portrait-4x5": {
    id: "portrait-4x5",
    labelZh: "信息流竖图",
    labelEn: "Feed portrait",
    usageZh: "LinkedIn · Facebook · Instagram",
    usageEn: "LinkedIn · Facebook · Instagram",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    cssWidth: 540,
    cssHeight: 675,
    scale: 2,
    source: {
      label: "LinkedIn Help",
      url: "https://www.linkedin.com/help/lms/answer/a527229",
      official: true
    }
  },
  "square-1x1": {
    id: "square-1x1",
    labelZh: "通用方图",
    labelEn: "Universal square",
    usageZh: "X · 朋友圈 · Reddit · Threads",
    usageEn: "X · Moments · Reddit · Threads",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    cssWidth: 540,
    cssHeight: 540,
    scale: 2,
    source: {
      label: "X Ads creative specs",
      url: "https://business.x.com/en/help/campaign-setup/creative-ad-specifications",
      official: true
    }
  },
  "story-9x16": {
    id: "story-9x16",
    labelZh: "全屏竖版",
    labelEn: "Full-screen vertical",
    usageZh: "抖音 · Reels · Stories",
    usageEn: "Douyin · Reels · Stories",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    cssWidth: 540,
    cssHeight: 960,
    scale: 2,
    safeInsets: { top: 185, right: 120, bottom: 120, left: 120 },
    source: {
      label: "X Ads creative specs",
      url: "https://business.x.com/en/help/campaign-setup/creative-ad-specifications",
      official: true
    }
  },
  "landscape-1.91x1": {
    id: "landscape-1.91x1",
    labelZh: "横版链接图",
    labelEn: "Landscape link image",
    usageZh: "X · LinkedIn · Facebook",
    usageEn: "X · LinkedIn · Facebook",
    ratio: "1.91:1",
    width: 1200,
    height: 628,
    cssWidth: 600,
    cssHeight: 314,
    scale: 2,
    source: {
      label: "X Ads creative specs",
      url: "https://business.x.com/en/help/campaign-setup/creative-ad-specifications",
      official: true
    }
  },
  "video-16x9": {
    id: "video-16x9",
    labelZh: "横屏视频封面",
    labelEn: "Widescreen cover",
    usageZh: "YouTube · Bilibili · X",
    usageEn: "YouTube · Bilibili · X",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    cssWidth: 640,
    cssHeight: 360,
    scale: 3,
    source: {
      label: "X Ads creative specs",
      url: "https://business.x.com/en/help/campaign-setup/creative-ad-specifications",
      official: true
    }
  },
  "wechat-2.35x1": {
    id: "wechat-2.35x1",
    labelZh: "公众号头条封面",
    labelEn: "WeChat article cover",
    usageZh: "微信公众号头条",
    usageEn: "WeChat Official Account",
    ratio: "2.35:1",
    width: 900,
    height: 383,
    cssWidth: 600,
    cssHeight: 255.333333,
    scale: 1.5,
    source: {
      label: "Canva WeChat size guide",
      url: "https://www.canva.cn/sizes/wechat-official-account/",
      official: false
    }
  },
  "product-hunt-gallery": {
    id: "product-hunt-gallery",
    labelZh: "Product Hunt 展示图",
    labelEn: "Product Hunt gallery",
    usageZh: "Product Hunt Gallery",
    usageEn: "Product Hunt Gallery",
    ratio: "127:76",
    width: 1270,
    height: 760,
    cssWidth: 635,
    cssHeight: 380,
    scale: 2,
    source: {
      label: "Product Hunt Help",
      url: "https://help.producthunt.com/en/articles/479557-how-to-post-a-product",
      official: true
    }
  },
  "social-preview": {
    id: "social-preview",
    labelZh: "文章分享预览",
    labelEn: "Article social preview",
    usageZh: "Substack · Medium · 独立博客",
    usageEn: "Substack · Medium · Blogs",
    ratio: "1.91:1",
    width: 1200,
    height: 630,
    cssWidth: 600,
    cssHeight: 315,
    scale: 2,
    source: {
      label: "Substack Help Center",
      url: "https://support.substack.com/hc/en-us/articles/4408381685268-What-are-the-optimal-image-dimensions-for-my-Substack-publication",
      official: true
    }
  }
};

export const visualStoryFormatOrder = Object.keys(visualStoryFormats) as VisualStoryFormatId[];

const platformFormatRecommendations: Record<PlatformId, VisualStoryFormatId[]> = {
  xiaohongshu: ["portrait-3x4", "square-1x1", "story-9x16"],
  zhihu: ["social-preview", "portrait-4x5", "square-1x1"],
  instagram: ["portrait-3x4", "portrait-4x5", "square-1x1", "story-9x16"],
  linkedin: ["portrait-4x5", "square-1x1", "landscape-1.91x1"],
  x: ["square-1x1", "portrait-4x5", "landscape-1.91x1", "story-9x16"],
  facebook: ["portrait-4x5", "square-1x1", "landscape-1.91x1"],
  threads: ["portrait-3x4", "square-1x1", "portrait-4x5"],
  wechat: ["wechat-2.35x1", "portrait-3x4", "square-1x1"],
  moments: ["square-1x1", "portrait-3x4", "story-9x16"],
  "product-hunt": ["product-hunt-gallery", "square-1x1", "landscape-1.91x1"],
  "medium-substack": ["social-preview", "video-16x9", "portrait-3x4"],
  reddit: ["square-1x1", "portrait-4x5", "landscape-1.91x1"],
  "hacker-news": ["social-preview", "landscape-1.91x1", "square-1x1"],
  "indie-hackers": ["social-preview", "landscape-1.91x1", "square-1x1"]
};

export function getRecommendedVisualStoryFormats(platform: PlatformId): VisualStoryFormat[] {
  const recommended = platformFormatRecommendations[platform];
  const remaining = visualStoryFormatOrder.filter((id) => !recommended.includes(id));
  return [...recommended, ...remaining].map((id) => visualStoryFormats[id]);
}

export function getDefaultVisualStoryFormat(platform: PlatformId): VisualStoryFormat {
  return visualStoryFormats[platformFormatRecommendations[platform][0]];
}

export function isRecommendedVisualStoryFormat(platform: PlatformId, formatId: VisualStoryFormatId): boolean {
  return platformFormatRecommendations[platform].includes(formatId);
}
