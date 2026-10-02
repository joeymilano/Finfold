import type { Platform } from "./types";

export function recommendPlatform(page: {
  url: string;
  title: string;
  description: string;
  language: string;
  text: string;
}): Platform {
  const host = new URL(page.url).hostname.toLowerCase();
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host.endsWith("reddit.com")) return "reddit";
  if (host === "x.com" || host.endsWith("twitter.com")) return "x";
  if (host.endsWith("xiaohongshu.com")) return "xiaohongshu";

  const sample = `${page.title} ${page.description} ${page.text.slice(0, 1_500)}`;
  if (/^(zh|zh-|cmn)/i.test(page.language) || (sample.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 12) {
    return "xiaohongshu";
  }
  if (/\b(career|leadership|workplace|b2b|enterprise|industry|founder|professional)\b/i.test(sample)) {
    return "linkedin";
  }
  if (/\?|\b(how do i|what should|help me|community|discussion|anyone else)\b/i.test(sample)) {
    return "reddit";
  }
  return "x";
}
