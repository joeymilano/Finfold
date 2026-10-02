import { afterEach, describe, expect, it, vi } from "vitest";
import type { safeExternalFetch } from "@/lib/safe-url";
import {
  fetchPublicPageText,
  fetchRedditCreatorPosts,
  fetchRedditSubredditListing,
  isXiaohongshuNoteUrl,
  redditAboutToCreatorName,
  redditPostsToStyleSamples,
  resetRedditTokenCacheForTests,
  resolveRedditHandle,
  resolveSubredditName,
  type RedditPost
} from "@/lib/agent/social-intelligence";
import { AGENT_TOOLS, buildOpenAiToolsPayload, getAgentTool } from "@/lib/agent/tools";
import type { AgentToolContext } from "@/lib/agent/types";

vi.mock("@/lib/agent/provider-call", () => ({
  runAgentProviderCall: vi.fn(async (_ctx: unknown, run: () => Promise<string>) => run())
}));

import { SOCIAL_INTELLIGENCE_TOOLS } from "@/lib/agent/social-intelligence-tools";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html" } });
}

function redditListing(posts: RedditPost[]): unknown {
  return { data: { children: posts.map((post) => ({ data: post })) } };
}

const basePost: RedditPost = {
  id: "abc1",
  title: "How we grew from zero to 10k subscribers",
  selftext: "We started with cold outreach, then moved to content. Here is the full playbook with numbers.",
  score: 1200,
  num_comments: 84,
  permalink: "/r/marketing/comments/abc1/how_we_grew/",
  author: "growthperson",
  subreddit: "marketing",
  created_utc: 1755000000,
  over_18: false,
  stickied: false
};

const fetchJsonOk = vi.fn<typeof safeExternalFetch>(async () =>
  jsonResponse(redditListing([basePost])));
void fetchJsonOk;

function makeCtx(enabled = true): AgentToolContext {
  return {
    userId: "user-1",
    admin: {} as never,
    plan: enabled ? "starter" : "free",
    agentToolsEnabled: enabled
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetRedditTokenCacheForTests();
});

describe("handle and subreddit resolution", () => {
  it("accepts bare names, u/ prefixes, and full profile URLs", () => {
    expect(resolveRedditHandle("growthperson")).toBe("growthperson");
    expect(resolveRedditHandle("u/growthperson")).toBe("growthperson");
    expect(resolveRedditHandle("/user/growthperson")).toBe("growthperson");
    expect(resolveRedditHandle("https://www.reddit.com/user/growthperson/")).toBe("growthperson");
    expect(resolveRedditHandle("https://reddit.com/user/growthperson")).toBe("growthperson");
  });

  it("rejects paths and invalid characters", () => {
    expect(resolveRedditHandle("https://www.reddit.com/r/marketing")).toBeNull();
    expect(resolveRedditHandle("growth person!")).toBeNull();
    expect(resolveRedditHandle("")).toBeNull();
  });

  it("accepts subreddit names with and without the r/ prefix", () => {
    expect(resolveSubredditName("marketing")).toBe("marketing");
    expect(resolveSubredditName("r/marketing")).toBe("marketing");
    expect(resolveSubredditName("me_irl")).toBe("me_irl");
    expect(resolveSubredditName("r/-bad-")).toBeNull();
    expect(resolveSubredditName("ab")).toBeNull();
    expect(resolveSubredditName("x")).toBeNull();
  });
});

describe("fetchRedditSubredditListing", () => {
  it("returns parsed public posts and filters stickied, NSFW, and moderator items", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () =>
      jsonResponse(redditListing([
        basePost,
        { ...basePost, id: "sticky", stickied: true },
        { ...basePost, id: "nsfw", over_18: true },
        { ...basePost, id: "mod", distinguished: "moderator" }
      ])));
    const result = await fetchRedditSubredditListing(
      { subreddit: "r/marketing", listing: "top", timeRange: "month", limit: 10 },
      fetchJson
    );
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("abc1");
    expect(result.source).toContain("reddit.com/r/marketing/top");
    expect(fetchJson).toHaveBeenCalledOnce();
  });

  it("reports 404 as missing community instead of throwing", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => jsonResponse({}, 404));
    const result = await fetchRedditSubredditListing({ subreddit: "nosuchsub" }, fetchJson);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toContain("404");
    expect(result.userGuidance).toBeTruthy();
  });

  it("reports anonymous rate limits (429/403) with retry guidance", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => jsonResponse({}, 429));
    const result = await fetchRedditSubredditListing({ subreddit: "marketing" }, fetchJson);
    expect(result.available).toBe(false);
  });

  it("rejects malformed subreddit names before any network call", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => jsonResponse({}));
    const result = await fetchRedditSubredditListing({ subreddit: "bad name!" }, fetchJson);
    expect(result.available).toBe(false);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("official Reddit app auth", () => {
  it("routes requests through oauth.reddit.com with a bearer token when credentials exist", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse({ access_token: "token-123", expires_in: 3600 })));
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => jsonResponse(redditListing([basePost])));
    const result = await fetchRedditSubredditListing({ subreddit: "marketing" }, fetchJson);
    expect(result.available).toBe(true);
    const [calledUrl, init] = fetchJson.mock.calls[0] as [string, { headers: Record<string, string> }, unknown];
    expect(calledUrl).toContain("https://oauth.reddit.com/r/marketing");
    expect(init.headers.Authorization).toBe("Bearer token-123");
  });

  it("shares one in-flight app token request across parallel community reads", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "test-id");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "test-secret");
    const tokenFetch = vi.fn(async () => jsonResponse({ access_token: "token-123", expires_in: 3600 }));
    vi.stubGlobal("fetch", tokenFetch);
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => jsonResponse(redditListing([basePost])));
    const [marketing, startups] = await Promise.all([
      fetchRedditSubredditListing({ subreddit: "marketing" }, fetchJson),
      fetchRedditSubredditListing({ subreddit: "startups" }, fetchJson)
    ]);
    expect(marketing.available).toBe(true);
    expect(startups.available).toBe(true);
    expect(tokenFetch).toHaveBeenCalledOnce();
  });

  it("reports the anonymous 403 HTML wall as an honest degradation, not a crash", async () => {
    // The real safeExternalFetch raises on HTML bodies here (content-type
    // allowlist), which is how anonymous Reddit 403 walls surface upstream.
    const fetchJson = vi.fn<typeof safeExternalFetch>(async () => {
      throw new Error("Remote response has an unsupported content type.");
    });
    const result = await fetchRedditSubredditListing({ subreddit: "marketing" }, fetchJson);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toContain("403");
    expect(result.userGuidance).toContain("REDDIT_CLIENT_ID");
  });
});

describe("fetchRedditCreatorPosts", () => {
  const aboutBody = {
    data: {
      name: "u/growthperson",
      subreddit: {
        title: "Growth Person",
        public_description: "Marketing experiments",
        subscribers: 4200,
        over_18: false
      },
      link_karma: 9800,
      comment_karma: 1500
    }
  };

  it("fetches submissions and the public profile card together", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async (url: string) =>
      String(url).includes("/about.json")
        ? jsonResponse(aboutBody)
        : jsonResponse(redditListing([basePost, { ...basePost, id: "def2" }])));
    const result = await fetchRedditCreatorPosts({ creator: "u/growthperson" }, fetchJson);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.handle).toBe("growthperson");
    expect(result.about?.subreddit?.subscribers).toBe(4200);
    expect(result.posts).toHaveLength(2);
  });

  it("still returns posts when the about card fails", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async (url: string) =>
      String(url).includes("/about.json") ? jsonResponse({}, 404) : jsonResponse(redditListing([basePost])));
    const result = await fetchRedditCreatorPosts({ creator: "growthperson" }, fetchJson);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.about).toBeNull();
    expect(result.posts).toHaveLength(1);
  });

  it("refuses NSFW creator profiles", async () => {
    const fetchJson = vi.fn<typeof safeExternalFetch>(async (url: string) =>
      String(url).includes("/about.json")
        ? jsonResponse({ data: { subreddit: { over_18: true } } })
        : jsonResponse(redditListing([basePost])));
    const result = await fetchRedditCreatorPosts({ creator: "growthperson" }, fetchJson);
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toContain("NSFW");
  });

  it("prefers the display name but falls back to the handle", () => {
    expect(redditAboutToCreatorName(aboutBody.data, "growthperson")).toBe("Growth Person");
    expect(redditAboutToCreatorName(null, "growthperson")).toBe("u/growthperson");
    expect(redditAboutToCreatorName({ subreddit: { title: "" } }, "growthperson")).toBe("u/growthperson");
  });
});

describe("redditPostsToStyleSamples", () => {
  it("maps score and comments into sample metrics and keeps URLs", () => {
    const { samples, skipped } = redditPostsToStyleSamples([basePost as RedditPost]);
    expect(samples).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(samples[0].sourceType).toBe("public_post");
    expect(samples[0].metrics).toEqual({ likes: 1200, comments: 84 });
    expect(samples[0].url).toBe("https://www.reddit.com/r/marketing/comments/abc1/how_we_grew/");
  });

  it("skips posts without enough readable text instead of padding them", () => {
    const { samples, skipped } = redditPostsToStyleSamples([
      { ...basePost, id: "linkonly", title: "Interesting link", selftext: "" },
      { ...basePost, id: "short", title: "Hi", selftext: "ok" }
    ]);
    expect(samples).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });

  it("truncates oversized text and caps the sample count", () => {
    const longPost = { ...basePost, selftext: "x".repeat(9_000) };
    const many = Array.from({ length: 10 }, (_unused, index) => ({ ...basePost, id: `p${index}` }));
    const capped = redditPostsToStyleSamples(many, { maxSamples: 5 });
    expect(capped.samples).toHaveLength(5);
    const long = redditPostsToStyleSamples([longPost as RedditPost]);
    expect(long.samples[0].text.length).toBeLessThanOrEqual(6_000);
  });
});

describe("Xiaohongshu note URL guard", () => {
  it("accepts explore/discovery note links and xhslink short links", () => {
    expect(isXiaohongshuNoteUrl("https://www.xiaohongshu.com/explore/6612abc")).toBe(true);
    expect(isXiaohongshuNoteUrl("https://www.xiaohongshu.com/discovery/item/6612abc")).toBe(true);
    expect(isXiaohongshuNoteUrl("https://xhslink.com/abcXYZ")).toBe(true);
  });

  it("rejects profiles, search pages, and other hosts", () => {
    expect(isXiaohongshuNoteUrl("https://www.xiaohongshu.com/user/profile/123")).toBe(false);
    expect(isXiaohongshuNoteUrl("https://www.xiaohongshu.com/search_result?keyword=x")).toBe(false);
    expect(isXiaohongshuNoteUrl("https://example.com/explore/6612abc")).toBe(false);
    expect(isXiaohongshuNoteUrl("not a url")).toBe(false);
  });
});

describe("fetchPublicPageText", () => {
  it("extracts the title and readable text of a public page", async () => {
    const fetchPage = vi.fn<typeof safeExternalFetch>(async () =>
      htmlResponse(
        "<html><head><title>营销复盘</title></head><body><p>这是一篇公开的营销复盘文章。"
        + "作者完整披露了三个月的投放预算、渠道结构、转化数据和踩坑记录，"
        + "并给出每一渠道的单位获客成本对比，足够作为调研证据。</p></body></html>"));
    const page = await fetchPublicPageText("https://example.com/post", fetchPage);
    expect(page.title).toContain("营销复盘");
    expect(page.text).toContain("营销复盘");
    expect(page.limitation).toBeNull();
    expect(page.isXiaohongshu).toBe(false);
  });

  it("flags Xiaohongshu login walls honestly with an import hint path", async () => {
    const fetchPage = vi.fn<typeof safeExternalFetch>(async () =>
      htmlResponse("<html><head><title>小红书</title></head><body>登录 注册 扫码登录</body></html>"));
    const page = await fetchPublicPageText("https://www.xiaohongshu.com/explore/6612abc", fetchPage);
    expect(page.isXiaohongshu).toBe(true);
    expect(page.loginWalled).toBe(true);
    expect(page.limitation).toContain("登录");
  });

  it("degrades gracefully when the request fails", async () => {
    const fetchPage = vi.fn<typeof safeExternalFetch>(async () => {
      throw new Error("network down");
    });
    const page = await fetchPublicPageText("https://example.com/post", fetchPage);
    expect(page.ok).toBe(false);
    expect(page.limitation).toContain("失败");
  });
});

describe("social intelligence tools registration and gating", () => {
  const toolNames = [
    "research_public_demand_signals",
    "research_platform_hot_posts",
    "research_creator_posts",
    "learn_creator_style_from_reddit",
    "fetch_public_pages"
  ];

  it("registers every tool on AGENT_TOOLS and the model payload", () => {
    for (const name of toolNames) {
      expect(getAgentTool(name)).toBeDefined();
      expect(AGENT_TOOLS.some((tool) => tool.name === name)).toBe(true);
    }
    const payload = buildOpenAiToolsPayload("starter");
    for (const name of toolNames) {
      expect(payload.some((tool) => tool.function.name === name)).toBe(true);
    }
  });

  it("persists only the reviewed demand queue and keeps other public research read-only", () => {
    expect(getAgentTool("research_public_demand_signals")?.mutates).toBe(true);
    for (const tool of SOCIAL_INTELLIGENCE_TOOLS.filter((candidate) => candidate.name !== "research_public_demand_signals")) {
      expect(tool.mutates).toBe(false);
    }
    expect(getAgentTool("fetch_public_pages")?.requiresAgentTools).toBe(false);
    expect(getAgentTool("research_public_demand_signals")?.requiresAgentTools).toBe(true);
    expect(getAgentTool("research_platform_hot_posts")?.requiresAgentTools).toBe(true);
    expect(getAgentTool("research_creator_posts")?.requiresAgentTools).toBe(true);
    expect(getAgentTool("learn_creator_style_from_reddit")?.requiresAgentTools).toBe(true);
  });

  it("returns an upgrade result for free users", async () => {
    const tool = getAgentTool("research_platform_hot_posts");
    if (!tool) throw new Error("missing tool");
    const result = await tool.execute({ subreddit: "marketing" }, makeCtx(false));
    expect(result).toMatchObject({ upgradeRequired: true });
  });
});

describe("tool execution against a stubbed network", () => {
  it("summarizes a subreddit listing with source attribution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(redditListing([basePost]))));
    try {
      const tool = getAgentTool("research_platform_hot_posts");
      if (!tool) throw new Error("missing tool");
      const result = await tool.execute(
        { subreddit: "marketing", listing: "top", timeRange: "week", limit: 10 },
        makeCtx()
      ) as Record<string, unknown>;
      expect(result.fetchUnavailable).toBeUndefined();
      expect(result.platform).toBe("reddit");
      expect(result.source).toContain("reddit.com/r/marketing");
      expect(result.reliability).toBe("measured");
      expect(Array.isArray(result.posts)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces fetch unavailability with user guidance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    const tool = getAgentTool("research_platform_hot_posts");
    if (!tool) throw new Error("missing tool");
    const result = await tool.execute({ subreddit: "marketing" }, makeCtx()) as Record<string, unknown>;
    expect(result.fetchUnavailable).toBe(true);
    expect(result.userGuidance).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("rejects invalid URLs in fetch_public_pages before fetching", async () => {
    const tool = getAgentTool("fetch_public_pages");
    if (!tool) throw new Error("missing tool");
    const result = await tool.execute({ urls: ["not a url"] }, makeCtx()) as Record<string, unknown>;
    expect(result.error).toBeTruthy();
  });

  it("allows free users to read a URL they supplied", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => htmlResponse(
      "<html><head><title>Mission Get</title></head><body><p>Mission Get helps creators turn goals into structured daily actions with visible progress and review.</p></body></html>"
    )));
    try {
      const tool = getAgentTool("fetch_public_pages");
      if (!tool) throw new Error("missing tool");
      const result = await tool.execute(
        { urls: ["www.missionget.com"], purpose: "诊断推广入口" },
        makeCtx(false)
      ) as { pages?: Array<{ ok?: boolean; text?: string }> };
      expect(result.pages?.[0]).toMatchObject({ ok: true });
      expect(result.pages?.[0]?.text).toContain("Mission Get helps creators");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("asks for more material instead of inventing samples when usable posts are short", async () => {
    const listingWithThinPosts = redditListing([
      { ...basePost, id: "l1", title: "link only", selftext: "" },
      { ...basePost, id: "l2", title: "link only 2", selftext: "" }
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/about.json")
        ? jsonResponse({ data: {} })
        : jsonResponse(listingWithThinPosts)));
    try {
      const tool = getAgentTool("learn_creator_style_from_reddit");
      if (!tool) throw new Error("missing tool");
      const result = await tool.execute({ creator: "growthperson" }, makeCtx()) as Record<string, unknown>;
      expect(result.needsInput).toBe(true);
      expect(result.usableSamples).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("produces a creator style profile from real public posts", async () => {
    const modelProfile = {
      creatorName: "Growth Person",
      profileUrl: "https://www.reddit.com/user/growthperson/",
      performanceStatus: "performance_evidence_supplied",
      confidence: "medium",
      audienceAndTopics: [{ finding: "面向独立开发者的增长问题", evidenceIds: ["R1"] }],
      hooksAndPackaging: [{ finding: "用具体数字开场", evidenceIds: ["R1"] }],
      structureAndRhythm: [{ finding: "背景、做法、结果三段推进", evidenceIds: ["R1"] }],
      proofAndTrust: [{ finding: "附完整数据表", evidenceIds: ["R1"] }],
      engagementAndConversion: [{ finding: "结尾邀请讨论", evidenceIds: ["R1"] }],
      toneKeywords: ["具体", "直接"],
      transferableRules: [{ finding: "每个结论都配一个可复制动作", evidenceIds: ["R1"] }],
      doNotCopy: ["不复制对方的身份与原句"],
      limitations: ["公开计数无法证明转化率"]
    };
    const { runAgentProviderCall } = await import("@/lib/agent/provider-call");
    vi.mocked(runAgentProviderCall).mockImplementation(
      (async (_ctx: unknown, _run?: unknown) => JSON.stringify(modelProfile)) as unknown as typeof runAgentProviderCall
    );

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("/about.json")
        ? jsonResponse({ data: { subreddit: { title: "Growth Person", subscribers: 4200 } } })
        : jsonResponse(redditListing([basePost, { ...basePost, id: "d2" }, { ...basePost, id: "d3" }]));
    }));
    try {
      const tool = getAgentTool("learn_creator_style_from_reddit");
      if (!tool) throw new Error("missing tool");
      const result = await tool.execute({ creator: "u/growthperson" }, makeCtx()) as Record<string, unknown>;
      expect(result.needsInput).toBeUndefined();
      const profile = result.creatorStyleProfile as Record<string, unknown>;
      expect(profile.creatorName).toBe("Growth Person");
      expect(result.evidence).toMatchObject({ reliability: "measured", sampleCount: 3 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
