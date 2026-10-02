// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fetchRedditSubredditListing, fetchRedditCreatorPosts } from "@/lib/agent/social-intelligence";

// Manual live smoke test. Not part of the default suite run:
//   LIVE=1 npx vitest run test/social-intelligence-live-smoke.test.ts
// Verifies the real Reddit public JSON path end to end, then delete or skip.
const live = process.env.LIVE === "1";

describe.skipIf(!live)("social intelligence live smoke", () => {
  it("fetches a real subreddit top listing", async () => {
    const result = await fetchRedditSubredditListing({
      subreddit: "marketing",
      listing: "top",
      timeRange: "month",
      limit: 5
    });
    if (!result.available) {
      console.log("[live] unavailable:", result.reason);
      return;
    }
    expect(result.posts.length).toBeGreaterThan(0);
    console.log("[live] first post:", result.posts[0].title, "score:", result.posts[0].score);
  }, 30_000);

  it("fetches a real creator's submissions", async () => {
    const result = await fetchRedditCreatorPosts({ creator: "kn0thing", limit: 5 });
    if (!result.available) {
      console.log("[live] unavailable:", result.reason);
      return;
    }
    console.log("[live] creator:", result.handle, "about:", Boolean(result.about), "posts:", result.posts.length);
    expect(result.handle).toBe("kn0thing");
  }, 30_000);
});
