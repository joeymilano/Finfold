/** 展示层格式化：生命周期/平台文案、相对时间。 */

const LIFECYCLE_LABELS: Record<string, string> = {
  new: "新信号",
  rising: "上升中",
  hot: "火热",
  cooling: "降温"
};

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "公众号",
  xiaohongshu: "小红书",
  moments: "朋友圈",
  zhihu: "知乎",
  x: "X",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  "hacker-news": "Hacker News",
  "product-hunt": "Product Hunt"
};

export function lifecycleLabel(lifecycle: string): string {
  return LIFECYCLE_LABELS[lifecycle] ?? lifecycle;
}

export function lifecycleClass(lifecycle: string): string {
  return `dot-${lifecycle}`;
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
