// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { searchNativeHackerNews } from "@/lib/signals/native-search";
const now = new Date("2026-09-08T12:00:00Z");
const original = "How can an independent developer build organic traction without an advertising budget? ".repeat(4);
afterEach(() => vi.unstubAllGlobals());
function stub(items: Record<string, unknown>, ids = Object.keys(items)) {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("hn.algolia.com")) return Response.json({ hits: ids.map(objectID => ({ objectID, story_text: "Untrusted stale index text" })) });
    return Response.json(items[url.match(/item\/(\d+)\.json/)?.[1] ?? ""] ?? null);
  });
  vi.stubGlobal("fetch", mock); return mock;
}
const item = (id: number) => ({ id, type: "story", title: "Ask HN: Organic traction", text: `<p>${original}</p>`, time: now.getTime() / 1000 - 3600 });
it("uses current authoritative text, deduplicates index IDs and bounds collection to five requests", async () => {
  const fetchMock = stub(Object.fromEntries([1,2,3,4,5].map(id => [String(id), item(id)])), ["1", "1", "2", "3", "4", "5"]);
  const result = await searchNativeHackerNews("marketing", now);
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(result.report).toMatchObject({ status: "available", found: 4 });
  expect(result.candidates[0]).toMatchObject({ evidenceLevel: "public_api", sourceLabel: "Ask HN", url: "https://news.ycombinator.com/item?id=1" });
  expect(result.candidates[0].text).toContain(original.trim());
  expect(result.candidates[0].text).not.toContain("index text");
});
it("drops deleted, mismatched, stale and link-only posts", async () => {
  stub({ "1": { ...item(1), deleted: true }, "2": item(8), "3": { ...item(3), time: 1 }, "4": { ...item(4), text: "" } });
  expect(await searchNativeHackerNews("marketing", now)).toMatchObject({ report: { status: "no_results", found: 0 }, candidates: [] });
});
it("reports network failure without falling back to unverified index text", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503, headers: { "content-type": "application/json" } })));
  expect(await searchNativeHackerNews("marketing", now)).toMatchObject({ report: { status: "failed", found: 0 }, candidates: [] });
});
it("rejects query operators without making a request", async () => {
  const fetchMock = stub({});
  expect((await searchNativeHackerNews("site:example.com", now)).candidates).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("recovers an empty over-specific topic within the same five-request ceiling", async () => {
  const queries: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "hn.algolia.com") {
      queries.push(url.searchParams.get("query")!);
      return Response.json({ hits: queries.length === 1 ? [] : [1, 2, 3, 4].map(id => ({ objectID: String(id) })) });
    }
    return Response.json(item(Number(url.pathname.match(/item\/(\d+)\.json/)?.[1])));
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await searchNativeHackerNews("indie-product-narrative", now);
  expect(queries).toEqual(["indie product", "indie"]);
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(result.report).toMatchObject({ status: "available", found: 3 });
  expect(result.candidates.every(candidate => candidate.text.includes(original.trim()))).toBe(true);
});
it("does not retry a failed broadening request or exceed its request allowance", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ hits: [] }))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await searchNativeHackerNews("indie developer", now)).toMatchObject({ report: { status: "failed" }, candidates: [] });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.skipIf(process.env.SIGNAL_NATIVE_LIVE !== "true")("reads current native HN evidence without credentials", async () => {
  const result = await searchNativeHackerNews(process.env.SIGNAL_NATIVE_QUERY ?? "marketing");
  console.log(JSON.stringify({ report: result.report, sources: result.candidates.map(({ url, title, publishedAt, text }) => ({ url, title, publishedAt, excerpt: text.slice(0, 240) })) }));
  expect(result.report.status).toBe("available");
  expect(result.candidates.length).toBeGreaterThan(0);
}, 30000);
