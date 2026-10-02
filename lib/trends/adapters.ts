import {
  FEED_CONTENT_TYPES,
  HTML_CONTENT_TYPES,
  JSON_CONTENT_TYPES,
  readTextWithLimit,
  safeExternalFetch
} from "@/lib/safe-url";
import { GitHubTrendAdapter } from "@/lib/trends/github-source";
import { FREE_SIGNAL_FEEDS } from "@/lib/trends/source-catalog";
import { stableTrendFingerprint } from "@/lib/trends/scoring";
import { createPublicRedditTrendAdapters } from "@/lib/trends/social-sources";
import type {
  TrendSignalInput,
  TrendSource,
  TrendSourceAdapter,
  TrendSourceFetchState,
  TrendSourceResult
} from "@/lib/trends/types";

const USER_AGENT = "FinfoldOpportunityRadar/1.0 (+https://www.finfold.app)";
const MAX_FEED_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const BAIDU_HOT_SEARCH_URL = "https://top.baidu.com/board?tab=realtime";

type FeedAdapterOptions = {
  source?: Extract<TrendSource, "rss">;
  url: string;
  label: string;
  ownerUserId?: string;
  scopeKey: string;
  locale?: string;
  maxEntries?: number;
  sourceItemPrefix?: string;
  stateKey?: string;
  trustedFeedContentSniffing?: boolean;
  /** Marks curated editorial feeds so radar selection treats them as industry content, not generic hot trends. */
  contentKind?: "industry_post";
};

type ParsedFeedEntry = {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt?: string;
  approximateTraffic?: number;
};

export class GoogleTrendsAdapter implements TrendSourceAdapter {
  readonly id = "google_trends" as const;
  readonly stateKey: string;

  constructor(private readonly region = "US") {
    this.stateKey = `google_trends:${region.toUpperCase()}`;
  }

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(this.region)}`;
    try {
      const response = await fetchBounded(url, FEED_CONTENT_TYPES, state, "google_trends_rss");
      if (response.status === 304) return { source: this.id, ok: true, signals: [], fetchedAt, notModified: true };
      if (!response.ok) throw new Error(`Google Trends returned ${response.status}.`);
      const xml = await readTextWithLimit(response, MAX_FEED_BYTES);
      const validators = responseValidators(response);
      const signals = parseFeedEntries(xml, 25).map((entry, index) => {
        entry.id = `${this.region}:${stableTrendFingerprint(entry.title)}`;
        const traffic = entry.approximateTraffic;
        const momentumScore = traffic
          ? Math.min(100, Math.round(28 + Math.log10(Math.max(10, traffic)) * 17))
          : Math.max(45, 82 - index * 2);
        return toSignal(entry, {
          source: this.id,
          sourceLabel: "Google Trends",
          scopeKey: "global",
          locale: "en",
          region: this.region,
          sourceRank: index + 1,
          sourceScore: traffic,
          momentumScore,
          evidencePayload: { ...validators, fetchStateKey: this.stateKey, approximateTraffic: traffic ?? null }
        });
      });
      return { source: this.id, ok: true, signals, fetchedAt };
    } catch (error) {
      return { ...failedResult(this.id, fetchedAt, error), label: "label" in this ? String(this.label) : undefined };
    }
  }
}

export class HackerNewsAdapter implements TrendSourceAdapter {
  readonly id = "hacker_news" as const;
  get stateKey() { return `hacker_news:${this.listing}`; }
  get label() { return this.listing === "askstories" ? "Ask HN" : this.listing === "showstories" ? "Show HN" : "Hacker News"; }

  constructor(private readonly limit = 30, private readonly listing: "topstories" | "askstories" | "showstories" = "topstories") {}

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const listResponse = await fetchBounded(
        `https://hacker-news.firebaseio.com/v0/${this.listing}.json`,
        JSON_CONTENT_TYPES,
        state,
        "hacker_news_topstories"
      );
      if (listResponse.status === 304) return { source: this.id, label: this.label, ok: true, signals: [], fetchedAt, notModified: true };
      if (!listResponse.ok) throw new Error(`Hacker News returned ${listResponse.status}.`);
      const ids = parseNumberArray(await readTextWithLimit(listResponse, MAX_JSON_BYTES)).slice(0, this.limit);
      const validators = responseValidators(listResponse);
      const items: HackerNewsItem[] = [];
      for (let index = 0; index < ids.length; index += 8) {
        const batch = ids.slice(index, index + 8);
        const rows = await Promise.all(batch.map((id) => fetchHackerNewsItem(id)));
        items.push(...rows.filter((item): item is HackerNewsItem => Boolean(item?.title) && item?.type === "story"));
      }
      const signals = items.map((item, index) => {
        const title = item.title ?? "";
        const discussionUrl = `https://news.ycombinator.com/item?id=${item.id}`;
        const sourceUrl = validHttpsUrl(item.url) ?? discussionUrl;
        return {
          scopeKey: "global",
          source: this.id,
          sourceItemId: String(item.id),
          sourceUrl,
          sourceLabel: this.label,
          title: title.trim().slice(0, 300),
          summary: `${typeof item.text === "string" ? item.text.replace(/<[^>]*>/g, " ").slice(0, 700) : ""} · ${item.score ?? 0} points · ${item.descendants ?? 0} comments · discussion ${discussionUrl}`,
          locale: "en",
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
          sourceRank: index + 1,
          sourceScore: item.score ?? 0,
          momentumScore: Math.min(100, Math.round(35 + Math.log10(Math.max(1, item.score ?? 1)) * 24 + Math.min(18, (item.descendants ?? 0) / 8))),
          evidencePayload: {
            ...validators,
            fetchStateKey: this.stateKey,
            points: item.score ?? 0,
            comments: item.descendants ?? 0,
            discussionUrl
          },
          fingerprint: stableTrendFingerprint(`${title} ${sourceUrl}`)
        } satisfies TrendSignalInput;
      });
      return { source: this.id, label: this.label, ok: true, signals, fetchedAt };
    } catch (error) {
      return { ...failedResult(this.id, fetchedAt, error), label: "label" in this ? String(this.label) : undefined };
    }
  }
}

export class FeedTrendAdapter implements TrendSourceAdapter {
  readonly id: Extract<TrendSource, "rss">;
  readonly stateKey: string;
  readonly label: string;

  constructor(private readonly options: FeedAdapterOptions) {
    this.id = options.source ?? "rss";
    this.stateKey = options.stateKey ?? `${this.id}:${options.scopeKey}:${options.label}`;
    this.label = options.label;
  }

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    try {
      let usedContentSniffing = false;
      let response: Response;
      try {
        response = await fetchBounded(this.options.url, FEED_CONTENT_TYPES, state, `${this.id}_feed`);
      } catch (error) {
        if (!this.options.trustedFeedContentSniffing || !isUnsupportedContentTypeError(error)) throw error;
        response = await fetchBoundedFeedWithoutMimeCheck(this.options.url, state, `${this.id}_feed_sniffed`);
        usedContentSniffing = true;
      }
      if (response.status === 304) return { source: this.id, label: this.label, ok: true, signals: [], fetchedAt, notModified: true };
      if (!response.ok) throw new Error(`${this.options.label} returned ${response.status}.`);
      const xml = await readTextWithLimit(response, MAX_FEED_BYTES);
      if (usedContentSniffing && !looksLikeSyndicationFeed(xml)) {
        throw new Error(`${this.options.label} did not return a readable RSS or Atom feed.`);
      }
      const validators = responseValidators(response);
      const signals = parseFeedEntries(xml, this.options.maxEntries ?? 8).map((entry, index) => toSignal({
        ...entry,
        id: this.options.sourceItemPrefix ? `${this.options.sourceItemPrefix}:${entry.id}` : entry.id
      }, {
        source: this.id,
        sourceLabel: this.options.label,
        ownerUserId: this.options.ownerUserId,
        scopeKey: this.options.scopeKey,
        locale: this.options.locale ?? "auto",
        sourceRank: index + 1,
        momentumScore: Math.max(35, 68 - index * 4),
        evidencePayload: {
          ...validators,
          fetchStateKey: this.stateKey,
          ...(this.options.contentKind ? { contentKind: this.options.contentKind } : {})
        }
      }));
      return { source: this.id, label: this.label, ok: true, signals, fetchedAt };
    } catch (error) {
      return { ...failedResult(this.id, fetchedAt, error), label: this.label };
    }
  }
}

type BaiduHotSearchEntry = {
  word: string;
  desc: string;
  url: string;
  hotScore: number;
  hotChange: string;
};

/**
 * Public, official Baidu Hot Search board. This is deliberately separate
 * from Baidu Index: the latter is never collected unless Finfold has an
 * authorized feed configured below.
 */
export class BaiduHotSearchAdapter implements TrendSourceAdapter {
  readonly id = "rss" as const;
  readonly stateKey = "baidu:official_hot_search";
  readonly label = "百度热搜趋势";

  constructor(private readonly limit = 25) {}

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const response = await fetchBounded(
        BAIDU_HOT_SEARCH_URL,
        HTML_CONTENT_TYPES,
        state,
        "baidu_official_hot_search"
      );
      if (response.status === 304) return { source: this.id, ok: true, signals: [], fetchedAt, notModified: true };
      if (!response.ok) throw new Error(`Baidu Hot Search returned ${response.status}.`);
      const html = await readTextWithLimit(response, MAX_FEED_BYTES);
      const validators = responseValidators(response);
      const entries = parseBaiduHotSearchPage(html, this.limit);
      if (!entries.length) throw new Error("Baidu Hot Search page did not contain readable trend entries.");
      const topScore = Math.max(1, ...entries.map((entry) => entry.hotScore));
      const signals = entries.map((entry, index) => ({
        scopeKey: "global",
        source: this.id,
        sourceItemId: `baidu-hot:${stableTrendFingerprint(entry.word)}`,
        sourceUrl: entry.url,
        sourceLabel: "百度热搜趋势",
        title: entry.word.slice(0, 300),
        summary: entry.desc.slice(0, 1200),
        locale: "zh-CN",
        region: "CN",
        sourceRank: index + 1,
        sourceScore: entry.hotScore,
        momentumScore: Math.min(100, Math.round(48 + entry.hotScore / topScore * 52)),
        evidencePayload: {
          ...validators,
          fetchStateKey: this.stateKey,
          provider: "baidu_hot_search",
          officialBoardUrl: BAIDU_HOT_SEARCH_URL,
          hotScore: entry.hotScore,
          hotChange: entry.hotChange
        },
        fingerprint: stableTrendFingerprint(`${entry.word} ${entry.url}`)
      } satisfies TrendSignalInput));
      return { source: this.id, ok: true, signals, fetchedAt };
    } catch (error) {
      return { ...failedResult(this.id, fetchedAt, error), label: "label" in this ? String(this.label) : undefined };
    }
  }
}

export function parseBaiduHotSearchPage(html: string, limit = 25): BaiduHotSearchEntry[] {
  const unique = new Map<string, BaiduHotSearchEntry>();
  for (const match of html.matchAll(/<!--s-data:([\s\S]*?)-->/g)) {
    let payload: unknown;
    try {
      payload = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const data = asRecord(asRecord(payload).data);
    const cards = Array.isArray(data.cards) ? data.cards : [];
    for (const cardValue of cards) {
      const card = asRecord(cardValue);
      if (!Array.isArray(card.content)) continue;
      for (const itemValue of card.content) {
        const item = asRecord(itemValue);
        const word = typeof item.word === "string" ? item.word.trim() : "";
        const url = validHttpsUrl(typeof item.url === "string" ? item.url : undefined);
        if (!word || !url || unique.has(word)) continue;
        unique.set(word, {
          word,
          desc: typeof item.desc === "string" ? item.desc.trim() : "",
          url,
          hotScore: finiteNumber(item.hotScore),
          hotChange: typeof item.hotChange === "string" ? item.hotChange : "unknown"
        });
        if (unique.size >= limit) return [...unique.values()];
      }
    }
  }
  return [...unique.values()];
}

const AIHOT_ITEMS_URL = "https://aihot.news/api/v1/items?mode=selected&window=24h&by=timeline&limit=20";

/**
 * AIHOT (aihot.news) is an MIT-licensed aggregator over primary AI vendor
 * blogs and tech media. Its anonymous public JSON API attaches an editorial
 * AI score and the original article link to every curated item, so momentum
 * comes from their rubric instead of positional decay, and evidence points
 * at the original article rather than the aggregator page.
 */
export class AihotAdapter implements TrendSourceAdapter {
  readonly id = "aihot" as const;
  readonly stateKey = "aihot:public_api";
  readonly label = "AIHOT";

  constructor(private readonly url = AIHOT_ITEMS_URL) {}

  async collect(state?: TrendSourceFetchState): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const response = await fetchBounded(this.url, JSON_CONTENT_TYPES, state, "aihot_items");
      if (response.status === 304) {
        return { source: this.id, label: this.label, ok: true, signals: [], fetchedAt, notModified: true };
      }
      if (!response.ok) throw new Error(`AIHOT returned ${response.status}.`);
      const payload = JSON.parse(await readTextWithLimit(response, MAX_JSON_BYTES)) as unknown;
      const rawItems = Array.isArray(asRecord(payload).items) ? asRecord(payload).items as unknown[] : [];
      // A 200 with zero readable items means the payload shape drifted (or the
      // feed went dark); surface it as a source failure instead of a silent
      // success so the run ledger and retry behavior stay honest.
      if (!rawItems.length) throw new Error("AIHOT returned no readable items.");
      const validators = responseValidators(response);
      const signals = rawItems.flatMap((value, index) => {
        const item = asRecord(value);
        const id = textOf(item.id);
        const title = textOf(item.title).trim();
        if (!id || !title) return [];
        // Prefer the original article as evidence; the aggregator page is a
        // fallback so a missing outbound link still yields a usable signal.
        const sourceUrl = validHttpsUrl(textOf(asRecord(item.links).original))
          ?? validHttpsUrl(textOf(asRecord(item.links).aihot));
        if (!sourceUrl) return [];
        const score = finiteNumber(item.score);
        const published = textOf(item.publishedAt);
        const publishedAt = published && Number.isFinite(Date.parse(published))
          ? new Date(published).toISOString()
          : undefined;
        const reason = textOf(item.reason).trim();
        const originalTitle = textOf(item.originalTitle).trim();
        const aihotUrl = validHttpsUrl(textOf(asRecord(item.links).aihot))?.toString() ?? null;
        const attribution = asRecord(item.attribution);
        return [{
          scopeKey: "global",
          source: this.id,
          sourceItemId: `aihot:${id}`.slice(0, 500),
          sourceUrl,
          sourceLabel: this.label,
          title: title.slice(0, 300),
          summary: [
            textOf(item.summary).trim(),
            reason ? `推荐理由：${reason}` : "",
            originalTitle ? `原文标题：${originalTitle}` : ""
          ].filter(Boolean).join(" · ").slice(0, 1200),
          locale: "zh-CN",
          publishedAt,
          sourceRank: index + 1,
          sourceScore: score > 0 ? score : undefined,
          momentumScore: score > 0
            ? Math.min(100, Math.max(40, Math.round(score)))
            : Math.max(40, 68 - index * 4),
          evidencePayload: {
            ...validators,
            fetchStateKey: this.stateKey,
            // AIHOT is a curated industry digest; classifying its evidence as
            // industry content guarantees radar visibility next to viral boards.
            contentKind: "industry_post",
            provider: "aihot_public_api",
            aihotScore: score > 0 ? score : null,
            category: textOf(item.category) || null,
            reason: reason || null,
            aihotUrl,
            attributionName: textOf(attribution.name) || "AIHOT",
            attributionUrl: validHttpsUrl(textOf(attribution.url))?.toString() ?? aihotUrl,
            sourceName: textOf(asRecord(item.source).name) || null
          },
          fingerprint: stableTrendFingerprint(`${title} ${sourceUrl}`)
        } satisfies TrendSignalInput];
      });
      return { source: this.id, label: this.label, ok: true, signals, fetchedAt };
    } catch (error) {
      return { ...failedResult(this.id, fetchedAt, error), label: this.label };
    }
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createDefaultTrendAdapters(): TrendSourceAdapter[] {
  const adapters: TrendSourceAdapter[] = [
    new GoogleTrendsAdapter("US"),
    new HackerNewsAdapter(20),
    new HackerNewsAdapter(8, "askstories"),
    new HackerNewsAdapter(8, "showstories"),
    new GitHubTrendAdapter("gitroomhq/postiz-app"),
    ...createHighQualityPublicFeedAdapters(),
    ...createPublicRedditTrendAdapters()
  ];
  if (process.env.BAIDU_HOT_SEARCH_ENABLED !== "false") adapters.push(new BaiduHotSearchAdapter(25));
  const baiduIndex = createAuthorizedBaiduIndexAdapter();
  if (baiduIndex) adapters.push(baiduIndex);
  const wechatSearch = createAuthorizedWechatSearchAdapter();
  if (wechatSearch) adapters.push(wechatSearch);
  const aihot = createAihotAdapter();
  if (aihot) adapters.push(aihot);
  return adapters;
}

export function createHighQualityPublicFeedAdapters(): TrendSourceAdapter[] {
  if (process.env.PUBLIC_EDITORIAL_TRENDS_ENABLED === "false") return [];
  const sources: FeedAdapterOptions[] = [
    ...FREE_SIGNAL_FEEDS.map((feed) => ({
      ...feed,
      scopeKey: "global",
      maxEntries: 6,
      stateKey: `public-feed:${feed.key}`,
      sourceItemPrefix: feed.key,
      // n8n rows are a feature-request queue (demand signals), not editorial
      // industry coverage, so they stay generic trends.
      ...(feed.key === "n8n" ? {} : { contentKind: "industry_post" as const })
    })),
    {
      url: "https://www.producthunt.com/feed",
      label: "Product Hunt",
      scopeKey: "global",
      locale: "en",
      maxEntries: 6,
      sourceItemPrefix: "product-hunt",
      stateKey: "public-feed:product-hunt",
      contentKind: "industry_post"
    },
    {
      url: "https://www.theverge.com/rss/index.xml",
      label: "The Verge",
      scopeKey: "global",
      locale: "en",
      maxEntries: 5,
      sourceItemPrefix: "the-verge",
      stateKey: "public-feed:the-verge",
      trustedFeedContentSniffing: true,
      contentKind: "industry_post"
    },
    {
      url: "https://blog.google/innovation-and-ai/technology/ai/rss/",
      label: "Google AI",
      scopeKey: "global",
      locale: "en",
      maxEntries: 5,
      sourceItemPrefix: "google-ai",
      stateKey: "public-feed:google-ai",
      contentKind: "industry_post"
    },
    {
      url: "https://sspai.com/feed",
      label: "少数派",
      scopeKey: "global",
      locale: "zh-CN",
      maxEntries: 5,
      sourceItemPrefix: "sspai",
      stateKey: "public-feed:sspai",
      contentKind: "industry_post"
    },
    {
      url: "https://www.ifanr.com/feed",
      label: "爱范儿",
      scopeKey: "global",
      locale: "zh-CN",
      maxEntries: 5,
      sourceItemPrefix: "ifanr",
      stateKey: "public-feed:ifanr",
      contentKind: "industry_post"
    }
  ];
  return sources.map((source) => new FeedTrendAdapter(source));
}

export function createAuthorizedBaiduIndexAdapter(): TrendSourceAdapter | null {
  if (process.env.BAIDU_INDEX_COMMERCIAL_USE_AUTHORIZED !== "true") return null;
  const url = process.env.BAIDU_INDEX_TREND_FEED_URL?.trim();
  if (!url) return null;
  return new FeedTrendAdapter({
    url,
    label: "百度指数（授权）",
    scopeKey: "global",
    locale: "zh-CN",
    maxEntries: 20,
    sourceItemPrefix: "baidu-index",
    stateKey: "baidu:authorized_index_feed"
  });
}

export function createAuthorizedWechatSearchAdapter(): TrendSourceAdapter | null {
  if (process.env.WECHAT_SEARCH_COMMERCIAL_USE_AUTHORIZED !== "true") return null;
  const url = process.env.WECHAT_SEARCH_TREND_FEED_URL?.trim();
  if (!url) return null;
  return new FeedTrendAdapter({
    url,
    label: "微信搜一搜趋势（授权）",
    scopeKey: "global",
    locale: "zh-CN",
    maxEntries: 20,
    sourceItemPrefix: "wechat-search",
    stateKey: "wechat:authorized_search_trend_feed"
  });
}

/**
 * AIHOT is enabled by default: the aggregator is MIT-licensed and its JSON
 * API is documented for anonymous programmatic use (llms.txt). Set
 * AIHOT_TRENDS_ENABLED=false to drop it from collection entirely.
 */
export function createAihotAdapter(): TrendSourceAdapter | null {
  if (process.env.AIHOT_TRENDS_ENABLED === "false") return null;
  return new AihotAdapter();
}

export function parseFeedEntries(xml: string, limit = 10): ParsedFeedEntry[] {
  const blocks = [
    ...(xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) ?? [])
  ].slice(0, limit);
  return blocks.flatMap((block) => {
    const title = extractTag(block, "title");
    const atomLinks = block.match(/<link\b[^>]*>/gi) ?? [];
    const alternate = atomLinks.find(tag => /rel=["']alternate["']/i.test(tag))
      ?? atomLinks.find(tag => !/rel=/i.test(tag));
    const link = extractTag(block, "link") || (alternate ? extractAttribute(alternate, "link", "href") : "");
    // Older feeds advertise HTTP permalinks. Read their HTTPS equivalent, never
    // substitute an unrelated search page for missing article evidence.
    const url = validHttpsUrl(link.replace(/^http:/i, "https:"));
    if (!url) return [];
    const id = extractTag(block, "guid") || extractTag(block, "id") || `${link}:${stableTrendFingerprint(title)}`;
    if (!title || !id) return [];
    const published = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const parsedDate = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : undefined;
    const approximateTraffic = parseMetric(extractTag(block, "ht:approx_traffic"));
    return [{
      id: id.slice(0, 500),
      title: title.slice(0, 300),
      summary: (extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content") || "").slice(0, 1200),
      url,
      publishedAt: parsedDate,
      approximateTraffic
    }];
  });
}

async function fetchBounded(
  url: string,
  contentTypes: readonly string[],
  state: TrendSourceFetchState | undefined,
  purpose: string
): Promise<Response> {
  const headers = new Headers({
    Accept: contentTypes.join(","),
    "User-Agent": USER_AGENT
  });
  if (state?.etag) headers.set("If-None-Match", state.etag);
  if (state?.lastModified) headers.set("If-Modified-Since", state.lastModified);
  return safeExternalFetch(url, { headers }, {
    allowedContentTypes: contentTypes,
    timeoutMs: 12_000,
    auditPurpose: purpose
  });
}

async function fetchBoundedFeedWithoutMimeCheck(
  url: string,
  state: TrendSourceFetchState | undefined,
  purpose: string
): Promise<Response> {
  const headers = new Headers({
    Accept: FEED_CONTENT_TYPES.join(","),
    "User-Agent": USER_AGENT
  });
  if (state?.etag) headers.set("If-None-Match", state.etag);
  if (state?.lastModified) headers.set("If-Modified-Since", state.lastModified);
  return safeExternalFetch(url, { headers }, {
    timeoutMs: 12_000,
    auditPurpose: purpose
  });
}

function isUnsupportedContentTypeError(error: unknown): boolean {
  return error instanceof Error && /unsupported content type/i.test(error.message);
}

function looksLikeSyndicationFeed(value: string): boolean {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?<(?:rss|feed|(?:rdf:)?RDF)\b/i.test(value);
}

async function fetchHackerNewsItem(id: number): Promise<HackerNewsItem | null> {
  try {
    const response = await safeExternalFetch(
      `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      { headers: { Accept: "application/json", "User-Agent": USER_AGENT } },
      { allowedContentTypes: JSON_CONTENT_TYPES, timeoutMs: 8_000, auditPurpose: "hacker_news_item" }
    );
    if (!response.ok) return null;
    return JSON.parse(await readTextWithLimit(response, 64 * 1024)) as HackerNewsItem;
  } catch {
    return null;
  }
}

function toSignal(entry: ParsedFeedEntry, options: {
  source: TrendSource;
  sourceLabel: string;
  ownerUserId?: string;
  scopeKey: string;
  locale: string;
  region?: string;
  sourceRank?: number;
  sourceScore?: number;
  momentumScore: number;
  evidencePayload: Record<string, unknown>;
}): TrendSignalInput {
  return {
    ownerUserId: options.ownerUserId,
    scopeKey: options.scopeKey,
    source: options.source,
    sourceItemId: entry.id,
    sourceUrl: entry.url,
    sourceLabel: options.sourceLabel,
    title: entry.title,
    summary: entry.summary,
    locale: options.locale,
    region: options.region,
    publishedAt: entry.publishedAt,
    sourceRank: options.sourceRank,
    sourceScore: options.sourceScore,
    momentumScore: options.momentumScore,
    evidencePayload: options.evidencePayload,
    fingerprint: stableTrendFingerprint(`${entry.title} ${entry.url}`)
  };
}

function extractTag(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function extractAttribute(xml: string, tag: string, attribute: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attribute}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetric(value: string): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return undefined;
  const upper = value.toUpperCase();
  if (upper.includes("M")) return numeric * 1_000_000;
  if (upper.includes("K") || value.includes("千")) return numeric * 1_000;
  if (value.includes("万")) return numeric * 10_000;
  return numeric;
}

function parseNumberArray(value: string): number[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is number => Number.isInteger(item) && item > 0);
}

function validHttpsUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function responseValidators(response: Response): Record<string, unknown> {
  return {
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified")
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function failedResult(source: TrendSource, fetchedAt: string, error: unknown): TrendSourceResult {
  return {
    source,
    ok: false,
    signals: [],
    fetchedAt,
    error: error instanceof Error ? error.message : "Source collection failed."
  };
}

type HackerNewsItem = {
  text?: string;
  id: number;
  type?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
};
