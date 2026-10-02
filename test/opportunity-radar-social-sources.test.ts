import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RedditPost } from "@/lib/agent/social-intelligence";
import {
  PUBLIC_REDDIT_INDUSTRY_COMMUNITIES,
  RedditCommunityTrendAdapter,
  createPublicRedditTrendAdapters,
  redditPostToTrendSignal
} from "@/lib/trends/social-sources";

const post: RedditPost = {
  id: "post-1",
  title: "How a small SaaS team changed its content workflow",
  selftext: "We replaced a weekly spreadsheet ritual with a smaller research and publishing loop.",
  score: 420,
  num_comments: 68,
  permalink: "/r/SaaS/comments/post1/content_workflow/",
  author: "saasoperator",
  subreddit: "SaaS",
  created_utc: 1_788_000_000,
  over_18: false,
  stickied: false
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Opportunity Radar public social sources", () => {
  it("uses a fixed public industry catalog instead of sending user context to Reddit", () => {
    vi.stubEnv("REDDIT_COMMERCIAL_USE_AUTHORIZED", "true");
    vi.stubEnv("REDDIT_SOCIAL_TRENDS_ENABLED", "true");
    vi.stubEnv("REDDIT_CLIENT_ID", "approved-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "approved-secret");
    expect(PUBLIC_REDDIT_INDUSTRY_COMMUNITIES).toContain("marketing");
    expect(PUBLIC_REDDIT_INDUSTRY_COMMUNITIES).toContain("SaaS");
    expect(createPublicRedditTrendAdapters()).toHaveLength(PUBLIC_REDDIT_INDUSTRY_COMMUNITIES.length);
    expect(createPublicRedditTrendAdapters()[0]).toBeInstanceOf(RedditCommunityTrendAdapter);
  });

  it("can disable public social collection without affecting the other trend sources", () => {
    vi.stubEnv("REDDIT_SOCIAL_TRENDS_ENABLED", "false");
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "");
    expect(createPublicRedditTrendAdapters()).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("stays disabled until commercial use is authorized and official credentials exist", () => {
    vi.stubEnv("REDDIT_SOCIAL_TRENDS_ENABLED", "true");
    vi.stubEnv("REDDIT_COMMERCIAL_USE_AUTHORIZED", "false");
    expect(createPublicRedditTrendAdapters()).toEqual([]);
  });

  it("reduces a real public post to bounded evidence with the original link and author", () => {
    const signal = redditPostToTrendSignal(post, "SaaS", 1);
    expect(signal).toMatchObject({
      scopeKey: "global",
      source: "social_post",
      sourceItemId: "reddit:post-1",
      sourceLabel: "Reddit · r/SaaS",
      title: post.title,
      publishedAt: expect.any(String),
      evidencePayload: {
        provider: "reddit",
        contentKind: "industry_post",
        author: "saasoperator",
        community: "SaaS",
        upvotes: 420,
        comments: 68
      }
    });
    expect(signal?.sourceUrl).toBe("https://www.reddit.com/r/SaaS/comments/post1/content_workflow/");
    expect(signal?.summary.length).toBeLessThanOrEqual(1200);
  });

  it("rejects off-domain permalinks rather than storing arbitrary links", () => {
    expect(redditPostToTrendSignal({ ...post, permalink: "https://example.com/fake" }, "SaaS", 1)).toBeNull();
  });

  it("adds social_post to the database source constraint", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/099_social_post_trend_sources.sql"),
      "utf8"
    );
    expect(migration).toContain("'social_post'");
    expect(migration).toContain("trend_signals_source_check");
  });
});
