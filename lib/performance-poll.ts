import { z } from "zod";
import type { PlatformId } from "@/lib/platforms";
import { JSON_CONTENT_TYPES, safeExternalFetch } from "@/lib/safe-url";
import {
  isAllowedPlatformUrl,
  isPollablePlatform
} from "@/lib/performance-platforms";

export {
  POLLABLE_PLATFORMS,
  isAllowedPlatformUrl,
  isPollablePlatform
} from "@/lib/performance-platforms";

/**
 * Platforms with a metrics source that a server can poll without the user
 * clicking through an OAuth flow: genuinely public (Reddit, Hacker News),
 * app-level (Product Hunt, with a developer token), or user-supplied
 * (X/Twitter — the user brings their own bearer token, since X has no free
 * public read tier; see app/api/settings/integrations/route.ts). WeChat post
 * URLs and Xiaohongshu posts have no public polling path. Certified WeChat
 * accounts can separately authorize aggregate account-level user analytics;
 * article metrics still use paste import.
 */
export type PolledMetrics = {
  likes: number;
  comments: number;
};

const redditSchema = z.array(
  z.object({
    data: z.object({
      children: z.array(
        z.object({
          data: z.object({
            score: z.number().nullable().optional(),
            num_comments: z.number().nullable().optional()
          })
        })
      )
    })
  })
);

async function pollReddit(url: string): Promise<PolledMetrics | null> {
  const jsonUrl = url.replace(/\/$/, "") + ".json";
  const response = await safeExternalFetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Finfold/1.0 (performance poll; +https://finfold.app)"
    }
  }, {
    allowedContentTypes: JSON_CONTENT_TYPES,
    timeoutMs: 10_000,
    auditPurpose: "reddit_metrics_poll"
  });
  if (!response.ok) return null;

  const parsed = redditSchema.safeParse(await response.json());
  const post = parsed.success ? parsed.data[0]?.data.children[0]?.data : undefined;
  if (!post) return null;

  return { likes: post.score ?? 0, comments: post.num_comments ?? 0 };
}

const hackerNewsSchema = z.object({
  score: z.number().nullable().optional(),
  descendants: z.number().nullable().optional()
});

async function pollHackerNews(url: string): Promise<PolledMetrics | null> {
  const id = new URL(url).searchParams.get("id");
  if (!id) return null;

  const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  if (!response.ok) return null;

  const parsed = hackerNewsSchema.safeParse(await response.json());
  if (!parsed.success) return null;

  return { likes: parsed.data.score ?? 0, comments: parsed.data.descendants ?? 0 };
}

const productHuntSchema = z.object({
  data: z
    .object({
      post: z
        .object({
          votesCount: z.number().nullable().optional(),
          commentsCount: z.number().nullable().optional()
        })
        .nullable()
        .optional()
    })
    .optional()
});

/**
 * Product Hunt's public post data requires an app-level developer token
 * (from producthunt.com/v2/oauth/applications, "test token" — read-only,
 * no per-user OAuth). Without PRODUCT_HUNT_API_TOKEN set, this platform
 * is simply not pollable — same as WeChat/Xiaohongshu public post URLs.
 */
async function pollProductHunt(url: string): Promise<PolledMetrics | null> {
  const token = process.env.PRODUCT_HUNT_API_TOKEN;
  if (!token) return null;

  const slug = new URL(url).pathname.replace(/^\/posts\//, "").replace(/\/$/, "");
  if (!slug) return null;

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: `query($slug: String!) { post(slug: $slug) { votesCount commentsCount } }`,
      variables: { slug }
    })
  });
  if (!response.ok) return null;

  const parsed = productHuntSchema.safeParse(await response.json());
  const post = parsed.success ? parsed.data.data?.post : undefined;
  if (!post) return null;

  return { likes: post.votesCount ?? 0, comments: post.commentsCount ?? 0 };
}

const xTweetSchema = z.object({
  data: z
    .object({
      public_metrics: z
        .object({
          like_count: z.number().nullable().optional(),
          reply_count: z.number().nullable().optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional()
});

/**
 * X (Twitter) has no free public read tier, so unlike Reddit/HN/Product
 * Hunt this requires a bearer token the USER supplies (Basic tier, $200/mo,
 * paid by the user directly — see app/api/settings/integrations/route.ts).
 * Uses only app-only auth against public_metrics, which needs no OAuth
 * user-context — that means impression_count is not available (X restricts
 * it to the tweet's own author via user-context auth), so only like/reply
 * counts are read here, same two-field shape as every other poller.
 */
async function pollX(url: string, bearerToken: string): Promise<PolledMetrics | null> {
  const match = url.match(/status(?:es)?\/(\d+)/);
  const tweetId = match?.[1];
  if (!tweetId) return null;

  const response = await fetch(`https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`, {
    headers: { Authorization: `Bearer ${bearerToken}` }
  });
  if (response.status === 429) {
    console.warn("[performance-poll] X API rate limited");
    return null;
  }
  if (!response.ok) return null;

  const parsed = xTweetSchema.safeParse(await response.json());
  const metrics = parsed.success ? parsed.data.data?.public_metrics : undefined;
  if (!metrics) return null;

  return { likes: metrics.like_count ?? 0, comments: metrics.reply_count ?? 0 };
}

/**
 * Fetches whatever a platform's own public post exposes (upvotes/score and
 * comment count) — never the full 9-field funnel, since none of these
 * platforms expose impressions, leads, signups, or revenue. Returns null
 * when the platform isn't pollable, the URL doesn't parse, or the request
 * fails — callers treat that as "no update this round", not an error.
 *
 * `opts.xBearerToken` is required for the "x" platform (a user-supplied
 * credential, unlike the other three) and ignored for every other
 * platform; polling "x" without one returns null rather than throwing.
 */
export async function pollPublicMetrics(
  platform: PlatformId,
  url: string,
  opts?: { xBearerToken?: string }
): Promise<PolledMetrics | null> {
  if (!url || !isPollablePlatform(platform)) return null;
  if (!isAllowedPlatformUrl(platform, url)) return null;

  try {
    switch (platform) {
      case "reddit":
        return await pollReddit(url);
      case "hacker-news":
        return await pollHackerNews(url);
      case "product-hunt":
        return await pollProductHunt(url);
      case "x":
        return opts?.xBearerToken ? await pollX(url, opts.xBearerToken) : null;
    }
  } catch (error) {
    console.error(`[performance-poll] ${platform} poll failed:`, error);
    return null;
  }
}
