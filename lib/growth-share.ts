import type { PlatformId } from "@/lib/platforms";

export type GrowthShareChannelId = Extract<
  PlatformId,
  "x" | "linkedin" | "threads" | "facebook" | "wechat" | "xiaohongshu"
>;

export type GrowthShareChannel = {
  id: GrowthShareChannelId;
  region: "global" | "china";
  label: string;
};

export const GROWTH_SHARE_CHANNELS: readonly GrowthShareChannel[] = [
  { id: "x", region: "global", label: "X" },
  { id: "linkedin", region: "global", label: "LinkedIn" },
  { id: "threads", region: "global", label: "Threads" },
  { id: "facebook", region: "global", label: "Facebook" },
  { id: "wechat", region: "china", label: "微信" },
  { id: "xiaohongshu", region: "china", label: "小红书" }
] as const;

type GrowthShareCopyInput = {
  locale: "zh" | "en";
  totalFollowers: number | null;
  monthlyGrowth: number | null;
  goalProgress: number | null;
  hidden: boolean;
};

function compact(value: number, locale: "zh" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function buildGrowthShareCaption(input: GrowthShareCopyInput): string {
  if (input.hidden || input.totalFollowers === null) {
    return input.locale === "en"
      ? "My social growth portfolio, powered by Finfold."
      : "我的社交媒体增长战报，由 Finfold 生成。";
  }

  const followers = compact(input.totalFollowers, input.locale);
  const growth = input.monthlyGrowth === null ? null : compact(Math.abs(input.monthlyGrowth), input.locale);
  const progress = input.goalProgress === null ? null : Math.round(input.goalProgress * 100);

  if (input.locale === "en") {
    const details = [
      `${followers} followers across platforms`,
      growth ? `${input.monthlyGrowth! >= 0 ? "+" : "−"}${growth} this month` : null,
      progress === null ? null : `${progress}% of my goal`
    ].filter(Boolean).join(" · ");
    return `${details}. Tracking the journey with Finfold.`;
  }

  const details = [
    `全网粉丝 ${followers}`,
    growth ? `本月${input.monthlyGrowth! >= 0 ? "新增 +" : "减少 −"}${growth}` : null,
    progress === null ? null : `目标完成 ${progress}%`
  ].filter(Boolean).join(" · ");
  return `${details}。用 Finfold 记录我的增长。`;
}

export function buildGrowthShareIntent(
  channel: GrowthShareChannelId,
  caption: string,
  publicUrl = "https://www.finfold.app"
): string | null {
  const text = encodeURIComponent(caption);
  const url = encodeURIComponent(publicUrl);

  switch (channel) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(`${caption} ${publicUrl}`)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case "wechat":
    case "xiaohongshu":
      return null;
  }
}
