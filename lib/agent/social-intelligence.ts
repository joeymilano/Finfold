import { z } from "zod";
import {
  HTML_CONTENT_TYPES,
  JSON_CONTENT_TYPES,
  readTextWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";
import { stripHtmlToText } from "@/lib/html-strip";
import type { CreatorStyleSample } from "@/lib/agent/style-profile";

/**
 * Social intelligence fetch layer.
 *
 * Compliance boundary (mirrors lib/agent/xhs-data-provider.ts and
 * lib/performance-poll.ts): only provider-approved API access or genuinely
 * public, no-login pages are read. Reddit API credentials may be configured
 * only after Reddit approves access and Finfold's commercial use; anonymous
 * reads are expected to degrade. Xiaohongshu has no public API of any kind, so
 * its public note pages are fetched best-effort and every failure degrades to
 * asking the user for a paste/screenshot import — never simulated login,
 * cookies, or reverse-engineered private endpoints.
 */

const REDDIT_BASE = "https://www.reddit.com";
const REDDIT_OAUTH_BASE = "https://oauth.reddit.com";
const MAX_LISTING_POSTS = 25;
const MAX_PAGE_HTML_BYTES = 1_500_000;
const MAX_PAGE_TEXT_CHARS = 6_000;
const FETCH_TIMEOUT_MS = 12_000;

const REDDIT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Finfold/1.0 (social intelligence; +https://www.finfold.app)"
} as const;

/**
 * Reddit blocks anonymous .json reads from servers (403 HTML walls). After
 * Reddit has approved API access and Finfold's commercial use, the approved
 * OAuth client credentials can be stored as REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET. Without them we fall back only to a best-effort public
 * request, which is expected to degrade rather than be bypassed.
 */
type RedditAppToken = { value: string; expiresAt: number };
let cachedRedditToken: RedditAppToken | null = null;
let pendingRedditToken: Promise<RedditAppToken | null> | null = null;

export function isRedditAppAuthConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

/** Test-only hook: drops the cached app token between isolated runs. */
export function resetRedditTokenCacheForTests(): void {
  cachedRedditToken = null;
  pendingRedditToken = null;
}

async function fetchRedditAppToken(): Promise<RedditAppToken | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (cachedRedditToken && cachedRedditToken.expiresAt > Date.now() + 60_000) {
    return cachedRedditToken;
  }
  if (pendingRedditToken) return pendingRedditToken;
  pendingRedditToken = requestRedditAppToken(clientId, clientSecret);
  try {
    return await pendingRedditToken;
  } finally {
    pendingRedditToken = null;
  }
}

async function requestRedditAppToken(clientId: string, clientSecret: string): Promise<RedditAppToken | null> {
  const basic = globalThis.btoa
    ? globalThis.btoa(`${clientId}:${clientSecret}`)
    : Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  // Host is fixed (no user input), so the plain fetch here is SSRF-safe.
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_HEADERS["User-Agent"]
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) {
    console.error(`[social-intelligence] Reddit token request failed: HTTP ${response.status}`);
    return null;
  }
  const body = z.object({
    access_token: z.string().min(1),
    expires_in: z.number().positive()
  }).safeParse(await response.json());
  if (!body.success) return null;
  cachedRedditToken = {
    value: body.data.access_token,
    expiresAt: Date.now() + body.data.expires_in * 1000
  };
  return cachedRedditToken;
}

const PAGE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
  "User-Agent": "Mozilla/5.0 (compatible; FinfoldResearch/1.0; +https://www.finfold.app)"
} as const;

export const redditTimeRanges = ["day", "week", "month", "year", "all"] as const;
export type RedditTimeRange = (typeof redditTimeRanges)[number];

export const redditListings = ["hot", "top", "new"] as const;
export type RedditListing = (typeof redditListings)[number];

const redditPostSchema = z.object({
  id: z.string(),
  title: z.string(),
  selftext: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  num_comments: z.number().nullable().optional(),
  permalink: z.string(),
  author: z.string().nullable().optional(),
  subreddit: z.string().nullable().optional(),
  created_utc: z.number().nullable().optional(),
  over_18: z.boolean().nullable().optional(),
  stickied: z.boolean().nullable().optional(),
  distinguished: z.string().nullable().optional()
});

const redditListingSchema = z.object({
  data: z.object({
    children: z.array(z.object({ data: redditPostSchema }))
  })
});

const redditAboutSchema = z.object({
  data: z.object({
    name: z.string().nullable().optional(),
    subreddit: z
      .object({
        title: z.string().nullable().optional(),
        public_description: z.string().nullable().optional(),
        subscribers: z.number().nullable().optional(),
        over_18: z.boolean().nullable().optional()
      })
      .nullable()
      .optional(),
    link_karma: z.number().nullable().optional(),
    comment_karma: z.number().nullable().optional(),
    created_utc: z.number().nullable().optional()
  })
});

export type RedditPost = z.infer<typeof redditPostSchema>;
export type RedditCreatorAbout = z.infer<typeof redditAboutSchema>["data"];

export type SocialFetchUnavailable = {
  available: false;
  reason: string;
  /** zh-CN guidance the agent can relay verbatim when a source degrades. */
  userGuidance?: string;
};

export type RedditListingResult =
  | { available: true; source: string; capturedAt: string; posts: RedditPost[] }
  | SocialFetchUnavailable;

export type RedditCreatorResult =
  | { available: true; source: string; capturedAt: string; handle: string; about: RedditCreatorAbout | null; posts: RedditPost[] }
  | SocialFetchUnavailable;

/** Accepts "name", "u/name", "/user/name" or a full reddit.com profile URL. */
export function resolveRedditHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^https?:\/\/[^/]+/i, "");
  const match = withoutScheme.match(/^\/?u(?:ser)?\/([A-Za-z0-9_-]{3,20})\/?$/i)
    ?? trimmed.match(/^u\/([A-Za-z0-9_-]{3,20})$/i)
    ?? trimmed.match(/^([A-Za-z0-9_-]{3,20})$/);
  return match?.[1] ?? null;
}

/** Accepts "name" or "r/name" (case-insensitive); used for path safety. */
export function resolveSubredditName(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^r\/([A-Za-z0-9][A-Za-z0-9_]{2,20})$/i)
    ?? trimmed.match(/^([A-Za-z0-9][A-Za-z0-9_]{2,20})$/i);
  return match?.[1] ?? null;
}

function clampLimit(limit: unknown, fallback: number): number {
  const value = Number(limit);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_LISTING_POSTS);
}

async function fetchRedditJson(
  publicUrl: string,
  fetchJson: typeof safeExternalFetch
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; unavailable: SocialFetchUnavailable }> {
  let url = publicUrl;
  const headers: Record<string, string> = { ...REDDIT_HEADERS };
  const token = await fetchRedditAppToken().catch(() => null);
  if (token) {
    url = `${REDDIT_OAUTH_BASE}${new URL(publicUrl).pathname}${new URL(publicUrl).search}`;
    headers.Authorization = `Bearer ${token.value}`;
  }
  let response: Response;
  try {
    response = await fetchJson(url, { headers }, {
      allowedContentTypes: JSON_CONTENT_TYPES,
      timeoutMs: FETCH_TIMEOUT_MS,
      auditPurpose: token ? "reddit_official_api" : "reddit_public_listing"
    });
  } catch (error) {
    // The public .json endpoints answer server traffic with 403 HTML walls,
    // which the content-type allowlist surfaces as an exception.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("content type")) {
      return {
        ok: false,
        status: 403,
        unavailable: {
          available: false,
          reason: "Reddit 拒绝了未认证的服务端读取（403 拦截页）。",
          userGuidance: token
            ? "本次抓取被 Reddit 拦截，请稍后让我重试。"
            : "当前未配置 Reddit 官方 API，匿名读取会被拦截。可以直接粘贴你看到的帖子原文，我先基于它分析；或让管理员配置 REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET 后重试。"
        }
      };
    }
    return {
      ok: false,
      status: 0,
      unavailable: { available: false, reason: `Reddit 请求失败：${message}` }
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      unavailable: redditUnavailable(response.status)
    };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, status: response.status, unavailable: { available: false, reason: "Reddit 返回了无法解析的内容。" } };
  }
}

function redditUnavailable(status: number): SocialFetchUnavailable {
  if (status === 404) {
    return {
      available: false,
      reason: `Reddit 返回 404，没有找到这个社区或用户。`,
      userGuidance: "请确认社区名或用户名拼写无误，也可以直接粘贴 reddit.com 的主页链接。"
    };
  }
  if (status === 403 || status === 429) {
    return {
      available: false,
      reason: `Reddit 暂时拒绝了这次读取（HTTP ${status}）。`,
      userGuidance: "请稍等一两分钟再让我重试；也可以直接粘贴你看到的帖子原文，我先基于它分析。"
    };
  }
  return {
    available: false,
    reason: `Reddit 请求失败（HTTP ${status}）。`,
    userGuidance: "可以稍后让我重试，或直接粘贴帖子原文。"
  };
}

/** Post listings a user can research without any login: hot/top/new of a subreddit. */
export async function fetchRedditSubredditListing(
  input: {
    subreddit: string;
    listing?: RedditListing;
    timeRange?: RedditTimeRange;
    limit?: unknown;
  },
  fetchJson: typeof safeExternalFetch = safeExternalFetch
): Promise<RedditListingResult> {
  const name = resolveSubredditName(input.subreddit);
  if (!name) {
    return {
      available: false,
      reason: "社区名格式不正确。",
      userGuidance: "请提供 3-21 个字符的社区名，例如 r/marketing 或 marketing。"
    };
  }
  const listing: RedditListing = input.listing && redditListings.includes(input.listing)
    ? input.listing
    : "top";
  const timeRange: RedditTimeRange = input.timeRange && redditTimeRanges.includes(input.timeRange)
    ? input.timeRange
    : "month";
  const limit = clampLimit(input.limit, 10);

  const params = new URLSearchParams({ limit: String(limit) });
  if (listing === "top") params.set("t", timeRange);
  const url = `${REDDIT_BASE}/r/${name}/${listing}.json?${params.toString()}`;

  const result = await fetchRedditJson(url, fetchJson);
  if (!result.ok) return result.unavailable;
  const parsed = redditListingSchema.safeParse(result.body);
  if (!parsed.success) {
    return { available: false, reason: "Reddit 返回的列表结构与预期不符。" };
  }
  return {
    available: true,
    source: `reddit.com/r/${name}/${listing}${listing === "top" ? `?t=${timeRange}` : ""}`,
    capturedAt: new Date().toISOString(),
    posts: parsed.data.data.children
      .map((child) => child.data)
      .filter((post) => !post.stickied && !post.over_18 && !post.distinguished)
  };
}

/** A creator's public submission history plus optional public profile card. */
export async function fetchRedditCreatorPosts(
  input: { creator: string; timeRange?: RedditTimeRange; limit?: unknown },
  fetchJson: typeof safeExternalFetch = safeExternalFetch
): Promise<RedditCreatorResult> {
  const handle = resolveRedditHandle(input.creator);
  if (!handle) {
    return {
      available: false,
      reason: "无法从输入中识别 Reddit 用户名。",
      userGuidance: "请提供 Reddit 用户名（3-20 个字符），或直接粘贴 reddit.com/user/... 的主页链接。"
    };
  }
  const limit = clampLimit(input.limit, 12);
  const params = new URLSearchParams({ limit: String(limit), sort: "top" });
  if (input.timeRange && redditTimeRanges.includes(input.timeRange)) {
    params.set("t", input.timeRange);
  }
  const [postsResult, aboutResult] = await Promise.all([
    fetchRedditJson(`${REDDIT_BASE}/user/${handle}/submitted.json?${params.toString()}`, fetchJson),
    fetchRedditJson(`${REDDIT_BASE}/user/${handle}/about.json`, fetchJson).catch(
      (): { ok: false; status: 0; unavailable: SocialFetchUnavailable } => ({
        ok: false,
        status: 0,
        unavailable: { available: false, reason: "about.json 不可用" }
      })
    )
  ]);

  if (!postsResult.ok) return postsResult.unavailable;
  const parsed = redditListingSchema.safeParse(postsResult.body);
  if (!parsed.success) {
    return { available: false, reason: "Reddit 返回的发帖历史结构与预期不符。" };
  }
  const aboutParsed = aboutResult.ok ? redditAboutSchema.safeParse(aboutResult.body) : null;
  const about = aboutParsed?.success ? aboutParsed.data.data : null;
  if (about?.subreddit?.over_18) {
    return {
      available: false,
      reason: "该用户主页标记为 NSFW，Finfold 不会抓取。"
    };
  }
  return {
    available: true,
    source: `reddit.com/user/${handle}/submitted (sort=top)`,
    capturedAt: new Date().toISOString(),
    handle,
    about,
    posts: parsed.data.data.children
      .map((child) => child.data)
      .filter((post) => !post.stickied && !post.over_18)
  };
}

const XHS_NOTE_HOSTS = new Set(["xiaohongshu.com", "www.xiaohongshu.com"]);
const XHS_SHORT_HOSTS = new Set(["xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn"]);

/** Xiaohongshu only exposes public note pages (no API); best-effort read. */
export function isXiaohongshuNoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (XHS_SHORT_HOSTS.has(host)) return url.pathname !== "/";
    if (!XHS_NOTE_HOSTS.has(host)) return false;
    return /^\/(explore|discovery\/item)\/[A-Za-z0-9]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

export type PublicPageResult = {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  title: string;
  text: string;
  isXiaohongshu: boolean;
  loginWalled: boolean;
  limitation: string | null;
};

function extractHtmlTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,300})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:title["']/i);
  const tag = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  const raw = og?.[1] ?? tag?.[1] ?? "";
  return stripHtmlToText(raw, 180).trim();
}

function detectLoginWall(platform: string, status: number, text: string): boolean {
  if (status === 403 || status === 429) return true;
  if (platform !== "xiaohongshu") {
    return /login|sign in|登录|请先登录/i.test(text.slice(0, 800)) && text.trim().length < 600;
  }
  return /登录|扫码|二维码|验证你身边的真实身份|流动验证/i.test(text.slice(0, 1200))
    || text.trim().length < 60;
}

/** Reads one public page's readable text through the SSRF-safe fetch path. */
export async function fetchPublicPageText(
  rawUrl: string,
  fetchPage: typeof safeExternalFetch = safeExternalFetch
): Promise<PublicPageResult> {
  const url = rawUrl.trim();
  const isXhs = isXiaohongshuNoteUrl(url);
  let response: Response;
  try {
    response = await fetchPage(url, { headers: PAGE_HEADERS }, {
      allowedContentTypes: HTML_CONTENT_TYPES,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxRedirects: 4,
      auditPurpose: isXhs ? "xhs_public_note_read" : "public_page_read"
    });
  } catch {
    return {
      url, ok: false, httpStatus: null, title: "", text: "",
      isXiaohongshu: isXhs, loginWalled: false,
      limitation: "页面请求失败或超时。"
    };
  }
  const html = await readTextWithLimit(response, MAX_PAGE_HTML_BYTES);
  const title = extractHtmlTitle(html);
  const text = stripHtmlToText(html, MAX_PAGE_TEXT_CHARS);
  const loginWalled = detectLoginWall(isXhs ? "xiaohongshu" : "generic", response.status, text);
  let limitation: string | null = null;
  if (!response.ok) limitation = `页面返回 HTTP ${response.status}。`;
  else if (loginWalled) {
    limitation = isXhs
      ? "小红书这篇笔记需要登录才能看全文，公开页只读到了标题或极少内容。"
      : "页面疑似需要登录。";
  } else if (text.trim().length < 60) {
    limitation = isXhs
      ? "小红书公开页没有暴露可读正文（前端渲染或反爬拦截）。"
      : "页面正文过短，可能由脚本渲染。";
  }
  return { url, ok: response.ok, httpStatus: response.status, title, text, isXiaohongshu: isXhs, loginWalled, limitation };
}

const MIN_SAMPLE_TEXT = 20;

/**
 * Converts public Reddit posts into creator-style evidence samples. Posts with
 * too little readable text are skipped (never padded or invented) and reported
 * back so the agent can be honest about sample coverage.
 */
export function redditPostsToStyleSamples(
  posts: RedditPost[],
  options?: { maxSamples?: number }
): { samples: CreatorStyleSample[]; skipped: Array<{ id: string; reason: string }> } {
  const max = Math.min(options?.maxSamples ?? 8, 12);
  const samples: CreatorStyleSample[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let index = 0;
  for (const post of posts) {
    if (samples.length >= max) break;
    index += 1;
    const combined = `${post.title}\n\n${post.selftext ?? ""}`.trim();
    if (combined.length < MIN_SAMPLE_TEXT) {
      skipped.push({ id: `R${index}`, reason: "正文太短（仅标题或无文字内容），不构成风格证据" });
      continue;
    }
    samples.push({
      id: `R${index}`,
      title: post.title.slice(0, 180),
      sourceType: "public_post",
      text: combined.slice(0, 6_000),
      url: post.permalink.startsWith("http") ? post.permalink : `${REDDIT_BASE}${post.permalink}`,
      metrics: {
        ...(typeof post.score === "number" ? { likes: post.score } : {}),
        ...(typeof post.num_comments === "number" ? { comments: post.num_comments } : {})
      }
    });
  }
  return { samples, skipped };
}

export function redditAboutToCreatorName(about: RedditCreatorAbout | null, handle: string): string {
  const display = about?.subreddit?.title?.trim();
  return display && display.length > 0 ? display.slice(0, 120) : `u/${handle}`;
}
