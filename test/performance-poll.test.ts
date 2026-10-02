import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedPlatformUrl, isPollablePlatform, pollPublicMetrics } from "@/lib/performance-poll";

const originalToken = process.env.PRODUCT_HUNT_API_TOKEN;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.PRODUCT_HUNT_API_TOKEN;
  } else {
    process.env.PRODUCT_HUNT_API_TOKEN = originalToken;
  }
  vi.restoreAllMocks();
});

describe("isPollablePlatform", () => {
  it("accepts reddit, hacker-news, product-hunt, x", () => {
    expect(isPollablePlatform("reddit")).toBe(true);
    expect(isPollablePlatform("hacker-news")).toBe(true);
    expect(isPollablePlatform("product-hunt")).toBe(true);
    expect(isPollablePlatform("x")).toBe(true);
  });

  it("rejects platforms with no public API, like wechat and xiaohongshu", () => {
    expect(isPollablePlatform("wechat")).toBe(false);
    expect(isPollablePlatform("xiaohongshu")).toBe(false);
  });
});

describe("pollPublicMetrics", () => {
  it("rejects a user-supplied URL that does not belong to the selected platform", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(isAllowedPlatformUrl("reddit", "http://169.254.169.254/latest/meta-data")).toBe(false);
    await expect(pollPublicMetrics("reddit", "https://attacker.example/post")).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses Reddit's .json endpoint for score and comment count", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { data: { children: [{ data: { score: 142, num_comments: 37 } }] } },
          { data: { children: [] } }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await pollPublicMetrics("reddit", "https://reddit.com/r/test/comments/abc123/title/");
    expect(result).toEqual({ likes: 142, comments: 37 });
  });

  it("parses Hacker News's Firebase item endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ score: 88, descendants: 21 }), { status: 200 })
    );

    const result = await pollPublicMetrics("hacker-news", "https://news.ycombinator.com/item?id=999");
    expect(result).toEqual({ likes: 88, comments: 21 });
  });

  it("returns null for Product Hunt when no API token is configured", async () => {
    delete process.env.PRODUCT_HUNT_API_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await pollPublicMetrics("product-hunt", "https://www.producthunt.com/posts/finfold");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for non-pollable platforms without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await pollPublicMetrics("wechat", "https://mp.weixin.qq.com/s/abc");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null (not a throw) when the upstream request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
    const result = await pollPublicMetrics("reddit", "https://reddit.com/r/test/comments/abc123/title/");
    expect(result).toBeNull();
  });

  it("returns null for X when no bearer token is supplied, without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await pollPublicMetrics("x", "https://x.com/someone/status/123456789");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses X's public_metrics when a bearer token is supplied", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { public_metrics: { like_count: 12, reply_count: 3 } } }), { status: 200 })
    );

    const result = await pollPublicMetrics("x", "https://x.com/someone/status/123456789", { xBearerToken: "test-token" });
    expect(result).toEqual({ likes: 12, comments: 3 });
  });

  it("returns null for X on a 429 rate limit without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
    const result = await pollPublicMetrics("x", "https://x.com/someone/status/123456789", { xBearerToken: "test-token" });
    expect(result).toBeNull();
  });
});
