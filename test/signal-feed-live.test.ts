// @vitest-environment node
import { expect, it } from "vitest";
import { FeedTrendAdapter } from "@/lib/trends/adapters";
const runLive = process.env.SIGNAL_FEED_LIVE === "true";
it.runIf(runLive)("reads real feed validators and accepts a bodyless not-modified response", async () => {
  for (const [label, url] of [["woshipm", "https://www.woshipm.com/feed"], ["ruanyifeng", "https://www.ruanyifeng.com/blog/atom.xml"]]) {
    const adapter = new FeedTrendAdapter({ label, url, scopeKey: "global", maxEntries: 1 });
    const first = await adapter.collect();
    expect(first.ok, first.error).toBe(true);
    expect(first.signals.length).toBeGreaterThan(0);
    const evidence = first.signals[0].evidencePayload;
    const state = { etag: typeof evidence.etag === "string" ? evidence.etag : undefined,
      lastModified: typeof evidence.lastModified === "string" ? evidence.lastModified : undefined };
    expect(Boolean(state.etag || state.lastModified)).toBe(true);
    const second = await adapter.collect(state);
    expect(second, second.error).toMatchObject({ ok: true, notModified: true, signals: [] });
  }
}, 60000);
