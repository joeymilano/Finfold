import type { AccountDiagnosisPlatform } from "@/lib/agent/account-investigation";

export type AccountHealthConcern =
  | "general"
  | "low_reach"
  | "suspected_restriction"
  | "suspended"
  | "content_removed";

export type ParsedAccountHealthIntake = {
  accountUrl?: string;
  platform?: AccountDiagnosisPlatform;
  concern: AccountHealthConcern;
  evidenceText: string;
  analyticsText?: string;
  posts: Array<{
    url?: string;
    text: string;
  }>;
};

const URL_PATTERN = /https?:\/\/[^\s<>"“”]+/gi;
const TRAILING_PUNCTUATION = /[),.;!?，。；！？）】]+$/;
const POST_MARKER = /^(?:#{1,3}\s*)?(?:post|帖子|笔记|推文|原文)\s*(?:#?\s*[1-5])?\s*(?:[:：、.．-]\s*)?(.*)$/gim;

export function parseAccountHealthIntake(value: string): ParsedAccountHealthIntake {
  const input = value.trim();
  const urls = (input.match(URL_PATTERN) ?? []).map((item) => item.replace(TRAILING_PUNCTUATION, ""));
  const detected = urls
    .map((url) => ({ url, platform: detectAccountPlatform(url) }))
    .find((item): item is { url: string; platform: AccountDiagnosisPlatform } => Boolean(item.platform));
  const evidenceText = detected ? input.replace(detected.url, "").trim() : input;
  const platform = detected?.platform ?? inferPlatformFromText(input);

  return {
    accountUrl: detected?.url,
    platform,
    concern: inferConcern(input),
    evidenceText,
    analyticsText: containsAnalyticsOrNotice(evidenceText) ? evidenceText.slice(0, 12_000) : undefined,
    posts: extractPosts(evidenceText)
  };
}

export function extractPosts(value: string): ParsedAccountHealthIntake["posts"] {
  const input = value.replace(/\r\n/g, "\n").trim();
  if (!input) return [];

  const markers = Array.from(input.matchAll(POST_MARKER));
  if (markers.length > 0) {
    return markers.slice(0, 5).flatMap((marker, index) => {
      const start = marker.index! + marker[0].length;
      const end = markers[index + 1]?.index ?? input.length;
      const inline = marker[1]?.trim() ?? "";
      return toPost([inline, input.slice(start, end)].filter(Boolean).join("\n"));
    });
  }

  const blocks = input.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const linkedPosts = blocks.flatMap((block) => isPostUrl(firstUrl(block) ?? "") ? toPost(block) : []);
  if (linkedPosts.length > 0) return linkedPosts.slice(0, 5);

  return looksLikeAnalyticsOnly(input) ? [] : toPost(input);
}

export function detectAccountPlatform(value: string): AccountDiagnosisPlatform | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if ((host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) && parts[0] === "user" && parts[1] === "profile") {
      return "xiaohongshu";
    }
    if ((host === "x.com" || host === "twitter.com") && parts.length === 1 && !["home", "explore", "search", "i"].includes(parts[0].toLowerCase())) {
      return "x";
    }
    if (host === "reddit.com" && ["user", "u"].includes(parts[0]?.toLowerCase()) && Boolean(parts[1])) {
      return "reddit";
    }
    if (host === "linkedin.com" && parts[0]?.toLowerCase() === "in" && Boolean(parts[1])) {
      return "linkedin";
    }
    if (host === "xhslink.cn" || host === "xhslink.com") {
      return "xiaohongshu";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function inferPlatformFromText(value: string): AccountDiagnosisPlatform | undefined {
  if (/小红书|rednote|\bRED\b/i.test(value)) return "xiaohongshu";
  if (/reddit|\bsubreddit\b|\br\/[a-z0-9_]+|\bu\/[a-z0-9_-]+/i.test(value)) return "reddit";
  if (/linkedin|领英/i.test(value)) return "linkedin";
  if (/twitter|推特|\bX\s*(?:账号|account|analytics|平台)/i.test(value)) return "x";
  return undefined;
}

function toPost(value: string): ParsedAccountHealthIntake["posts"] {
  const url = firstUrl(value);
  const text = (url ? value.replace(url, "") : value)
    .replace(/^\s*[:：、-]\s*/, "")
    .trim()
    .slice(0, 5000);
  return text ? [{ ...(url && isPostUrl(url) ? { url } : {}), text }] : [];
}

function firstUrl(value: string): string | undefined {
  return value.match(URL_PATTERN)?.[0]?.replace(TRAILING_PUNCTUATION, "");
}

function isPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    return ((host === "x.com" || host === "twitter.com") && /\/status\/\d+/.test(path))
      || (host === "reddit.com" && /\/comments\/[a-z0-9]+/.test(path))
      || ((host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) && /\/(?:explore|discovery\/item)\//.test(path));
  } catch {
    return false;
  }
}

function looksLikeAnalyticsOnly(value: string): boolean {
  const compact = value.replace(/\s+/g, " ").trim();
  const hasMetric = /曝光|阅读|浏览|推荐流量|互动|点赞|收藏|评论|impressions?|views?|\breach\b|engagement/i.test(compact);
  const hasNumber = /\d[\d,.]*\s*(?:%|万|千|k|m)?/i.test(compact);
  const hasNotice = /违规通知|处罚通知|内容.{0,6}(?:移除|删除)|removed|suspend|\bbanned\b/i.test(compact);
  return hasNotice || (hasMetric && hasNumber && compact.length < 500);
}

function inferConcern(value: string): AccountHealthConcern {
  if (/封号|封禁|账号.{0,8}限制|suspend(?:ed|ion)?|account locked|\bbanned\b/i.test(value)) return "suspended";
  if (/违规通知|处罚通知|内容.{0,6}(?:移除|删除)|post.{0,6}removed|taken down|removed by (?:the )?moderator/i.test(value)) return "content_removed";
  if (/限流|shadow\s*ban/i.test(value)) return "suspected_restriction";
  if (/没流量|流量.{0,8}(?:掉|降|少)|曝光|阅读量|播放量|\breach\b|impressions?|views? (?:dropped|down)/i.test(value)) return "low_reach";
  return "general";
}

function containsAnalyticsOrNotice(value: string): boolean {
  return /曝光|阅读|浏览|推荐流量|互动|点赞|收藏|评论|违规|处罚|移除|封禁|impressions?|views?|\breach\b|engagement|notice|removed|suspend|\bban(?:ned)?\b/i.test(value);
}
