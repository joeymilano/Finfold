import { describe, expect, it, vi } from "vitest";
import { fetchHackerNewsDemandSignals } from "@/lib/agent/public-demand-signals";
import type { safeExternalFetch } from "@/lib/safe-url";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("fetchHackerNewsDemandSignals", () => {
  it("returns current keyword matches as unverified signals without author data", async () => {
    const fetcher = vi.fn<typeof safeExternalFetch>(async (url: string) => {
      if (url.endsWith("/newstories.json")) return jsonResponse([101, 102, 103, 104]);
      if (url.endsWith("/101.json")) {
        return jsonResponse({
          id: 101,
          type: "story",
          by: "private-handle-not-for-output",
          title: "Ask HN: a better social scheduling workflow?",
          text: "We need creator analytics without another spreadsheet.",
          url: "https://example.com/product",
          score: 42,
          descendants: 12,
          time: 1_756_000_000
        });
      }
      if (url.endsWith("/102.json")) {
        return jsonResponse({ id: 102, type: "job", title: "Social scheduling engineer", time: 1_756_000_001 });
      }
      if (url.endsWith("/103.json")) {
        return jsonResponse({ id: 103, type: "story", title: "Unrelated database release", time: 1_756_000_002 });
      }
      return jsonResponse({ id: 104, type: "story", deleted: true, title: "creator analytics", time: 1_756_000_003 });
    });

    const result = await fetchHackerNewsDemandSignals({
      keywords: ["social scheduling", "creator analytics"],
      limit: 10,
      scanLimit: 10
    }, fetcher);

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.leadStatus).toBe("unverified_signal");
    expect(result.source).toBe("https://hacker-news.firebaseio.com/v0/newstories.json");
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      sourceItemId: "101",
      title: "Ask HN: a better social scheduling workflow?",
      discussionUrl: "https://news.ycombinator.com/item?id=101",
      externalUrl: "https://example.com/product",
      score: 42,
      comments: 12,
      matchedKeywords: ["social scheduling", "creator analytics"]
    });
    expect(result.signals[0]).not.toHaveProperty("author");
    expect(JSON.stringify(result)).not.toContain("private-handle-not-for-output");
  });

  it("rejects invalid keywords before making a network request", async () => {
    const fetcher = vi.fn<typeof safeExternalFetch>();
    const result = await fetchHackerNewsDemandSignals({ keywords: ["", "x"] }, fetcher);
    expect(result.available).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports upstream failure instead of substituting mock results", async () => {
    const fetcher = vi.fn<typeof safeExternalFetch>(async () => jsonResponse({}, 503));
    const result = await fetchHackerNewsDemandSignals({ keywords: ["analytics"] }, fetcher);
    expect(result).toMatchObject({ available: false });
    if (result.available) return;
    expect(result.reason).toContain("503");
  });

  it("skips malformed items and strips unsafe external URLs", async () => {
    const fetcher = vi.fn<typeof safeExternalFetch>(async (url: string) => {
      if (url.endsWith("/newstories.json")) return jsonResponse([201, 202]);
      if (url.endsWith("/201.json")) return jsonResponse({ id: "bad", type: "story" });
      return jsonResponse({
        id: 202,
        type: "story",
        title: "Analytics for creators",
        url: "file:///etc/passwd",
        time: 1_756_000_000
      });
    });
    const result = await fetchHackerNewsDemandSignals({ keywords: ["analytics"] }, fetcher);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].externalUrl).toBeNull();
  });
});
