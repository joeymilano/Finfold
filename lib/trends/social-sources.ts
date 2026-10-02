import {
  fetchRedditSubredditListing,
  isRedditAppAuthConfigured,
  type RedditPost
} from "@/lib/agent/social-intelligence";
import { stableTrendFingerprint } from "@/lib/trends/scoring";
import type {
  TrendSignalInput,
  TrendSourceAdapter,
  TrendSourceResult
} from "@/lib/trends/types";

/**
 * This catalog is intentionally fixed and public. Finfold never sends a
 * user's offer, audience, watchlist, or competitors to Reddit. Relevance is
 * calculated later against persisted evidence inside Finfold.
 */
export const PUBLIC_REDDIT_INDUSTRY_COMMUNITIES = [
  "marketing",
  "socialmedia",
  "startups",
  "SaaS",
  "smallbusiness",
  "ecommerce",
  "UXDesign",
  "freelance"
] as const;

export class RedditCommunityTrendAdapter implements TrendSourceAdapter {
  readonly id = "social_post" as const;
  readonly stateKey: string;
  readonly label: string;

  constructor(private readonly community: string, private readonly limit = 8) {
    this.stateKey = `reddit:industry:${community.toLocaleLowerCase("en-US")}`;
    this.label = `Reddit · r/${community}`;
  }

  async collect(): Promise<TrendSourceResult> {
    const fetchedAt = new Date().toISOString();
    const response = await fetchRedditSubredditListing({
      subreddit: this.community,
      listing: "top",
      timeRange: "week",
      limit: this.limit
    });
    if (!response.available) {
      return {
        source: this.id,
        label: this.label,
        ok: false,
        signals: [],
        fetchedAt,
        error: response.reason
      };
    }
    return {
      source: this.id,
      label: this.label,
      ok: true,
      signals: response.posts.flatMap((post, index) => {
        const signal = redditPostToTrendSignal(post, this.community, index + 1);
        return signal ? [signal] : [];
      }),
      fetchedAt
    };
  }
}

export function createPublicRedditTrendAdapters(): TrendSourceAdapter[] {
  if (process.env.REDDIT_SOCIAL_TRENDS_ENABLED === "false") return [];
  if (process.env.REDDIT_COMMERCIAL_USE_AUTHORIZED !== "true" || !isRedditAppAuthConfigured()) return [];
  return PUBLIC_REDDIT_INDUSTRY_COMMUNITIES.map((community) =>
    new RedditCommunityTrendAdapter(community));
}

export function redditPostToTrendSignal(
  post: RedditPost,
  community: string,
  rank: number
): TrendSignalInput | null {
  const url = redditPostUrl(post.permalink);
  const title = post.title.trim();
  if (!url || !title || post.author === "AutoModerator") return null;
  const score = Math.max(0, Number(post.score ?? 0));
  const comments = Math.max(0, Number(post.num_comments ?? 0));
  const rawAuthor = post.author?.trim();
  const author = rawAuthor && rawAuthor !== "[deleted]" ? rawAuthor : undefined;
  const sourceCommunity = post.subreddit?.trim() || community;
  const body = String(post.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 760);
  const metrics = `${score} upvotes · ${comments} comments`;
  const publishedAt = safePublishedAt(post.created_utc);
  const momentumScore = Math.min(100, Math.round(
    35 + Math.log10(score + 1) * 18 + Math.min(22, comments / 6)
  ));
  return {
    scopeKey: "global",
    source: "social_post",
    sourceItemId: `reddit:${post.id}`,
    sourceUrl: url,
    sourceLabel: `Reddit · r/${sourceCommunity}`,
    title: title.slice(0, 300),
    summary: (body ? `${body} · ${metrics}` : metrics).slice(0, 1200),
    locale: "en",
    region: "global",
    publishedAt,
    sourceRank: rank,
    sourceScore: score + comments * 2,
    momentumScore,
    evidencePayload: {
      provider: "reddit",
      contentKind: "industry_post",
      author: author ?? null,
      community: sourceCommunity,
      upvotes: score,
      comments,
      fetchStateKey: `reddit:industry:${community.toLocaleLowerCase("en-US")}`
    },
    fingerprint: stableTrendFingerprint(`${title} ${url}`)
  };
}

function safePublishedAt(value: number | null | undefined): string | undefined {
  if (!Number.isFinite(value) || Number(value) <= 0) return undefined;
  const date = new Date(Number(value) * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function redditPostUrl(permalink: string): string | null {
  try {
    const url = new URL(permalink, "https://www.reddit.com");
    return /(^|\.)reddit\.com$/i.test(url.hostname) && url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
