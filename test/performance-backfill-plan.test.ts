import { describe, expect, it } from "vitest";
import { decidePerformanceBackfillPlan } from "@/lib/performance-backfill-plan";

describe("performance backfill plan", () => {
  it("keeps platforms without a usable public metrics API on truthful manual import", () => {
    expect(decidePerformanceBackfillPlan({
      platform: "xiaohongshu",
      publishedUrl: "https://www.xiaohongshu.com/explore/example",
      proactiveMonitoring: true
    })).toEqual({ mode: "manual", reason: "platform_unsupported" });
  });

  it("requires a real matching post URL before promising automatic backfill", () => {
    expect(decidePerformanceBackfillPlan({
      platform: "reddit",
      publishedUrl: "",
      proactiveMonitoring: true
    })).toEqual({ mode: "needs_setup", reason: "published_url_required" });
    expect(decidePerformanceBackfillPlan({
      platform: "reddit",
      publishedUrl: "https://example.com/not-a-reddit-post",
      proactiveMonitoring: true
    })).toEqual({ mode: "needs_setup", reason: "invalid_platform_url" });
  });

  it("gates unattended collection to the Digital Employee entitlement", () => {
    expect(decidePerformanceBackfillPlan({
      platform: "hacker-news",
      publishedUrl: "https://news.ycombinator.com/item?id=123",
      proactiveMonitoring: false
    })).toEqual({ mode: "needs_setup", reason: "upgrade_required" });
  });

  it("reports missing user or provider credentials instead of faking a connection", () => {
    expect(decidePerformanceBackfillPlan({
      platform: "x",
      publishedUrl: "https://x.com/finfold/status/123",
      proactiveMonitoring: true,
      hasRequiredCredential: false
    })).toEqual({ mode: "needs_setup", reason: "credential_required" });
    expect(decidePerformanceBackfillPlan({
      platform: "product-hunt",
      publishedUrl: "https://www.producthunt.com/posts/finfold",
      proactiveMonitoring: true,
      providerConfigured: false
    })).toEqual({ mode: "needs_setup", reason: "integration_unavailable" });
  });

  it("promises only public likes and comments on the real three-hour schedule", () => {
    expect(decidePerformanceBackfillPlan({
      platform: "reddit",
      publishedUrl: "https://www.reddit.com/r/startups/comments/abc/finfold/",
      proactiveMonitoring: true
    })).toEqual({
      mode: "automatic",
      cadenceHours: 3,
      metrics: ["likes", "comments"]
    });
  });
});
