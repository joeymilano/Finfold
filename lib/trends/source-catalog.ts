/** Public native feeds verified on 2026-09-08. No third-party subscription. */
export const FREE_SIGNAL_FEEDS = [
  { key: "woshipm", label: "人人都是产品经理", url: "https://www.woshipm.com/feed", locale: "zh-CN" },
  { key: "ruanyifeng", label: "阮一峰周刊", url: "https://www.ruanyifeng.com/blog/atom.xml", locale: "zh-CN" },
  { key: "oschina", label: "OSCHINA", url: "https://www.oschina.net/news/rss", locale: "zh-CN" },
  { key: "ithome", label: "IT之家", url: "https://www.ithome.com/rss/", locale: "zh-CN" },
  { key: "n8n", label: "n8n 功能请求", url: "https://community.n8n.io/c/feature-requests/5.rss", locale: "en" }
] as const;

/** Domains describe discovery coverage, not a claim of full platform access. */
export const DISCOVERY_PLATFORMS = [
  { key: "public_web", label: "公开网页", domains: [] as string[], locale: "zh" },
  { key: "xiaohongshu", label: "小红书", domains: ["xiaohongshu.com"], locale: "zh" },
  { key: "bilibili", label: "B站", domains: ["bilibili.com"], locale: "zh" },
  { key: "wechat_search", label: "公众号", domains: ["mp.weixin.qq.com"], locale: "zh" },
  { key: "weibo", label: "微博", domains: ["weibo.com", "weibo.cn"], locale: "zh" },
  { key: "x", label: "X", domains: ["x.com", "twitter.com"], locale: "en" },
  { key: "linkedin", label: "LinkedIn", domains: ["linkedin.com"], locale: "en" },
  { key: "reddit", label: "Reddit", domains: ["reddit.com"], locale: "en" }
] as const;
