import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiscoveryQueries, canonicalSignalUrl, mergeCandidates, verifiedAssessment, type SignalCandidate } from "@/lib/signals/contracts";
import { extractSignalPage, readSignalCandidate } from "@/lib/signals/evidence";
import { GoogleTrendsAdapter, parseFeedEntries } from "@/lib/trends/adapters";
import { GitHubTrendAdapter } from "@/lib/trends/github-source";
import { parseSearchEventStream, searchPublicWebByQuery } from "@/lib/agent/web-search-evidence";
import type { LLMProvider } from "@/lib/llm-providers";
const excerpt = "Our small team needs a reliable content approval workflow across multiple accounts.";
const candidate: SignalCandidate = { url: "https://example.com/post", title: "A request for content approval", snippet: excerpt, sourceLabel: "公开网页", platform: "public_web", publishedAt: "2026-09-07T01:00:00Z", evidenceLevel: "direct", text: excerpt.repeat(3), status: "pending" };
const assessment = { contentKind: "question", demandStatus: "unresolved", kind: "demand", relevant: true, matchScore: 84, fact: excerpt, excerpt, whyYou: "This source describes your customer's specific workflow problem.", whyNow: "A recent original request.", action: "Review the approval workflow and evaluate whether your product solves it." };
const provider: LLMProvider = { name: "test", apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "test", models: { haiku: "qwen3.8-flash", sonnet: "qwen3.8-flash", opus: "qwen3.8-flash" }, jsonMode: "none", costClass: "free_pool" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("business signal evidence", () => {
  it("rotates intent across enabled platforms and includes the business rather than generic hot words", () => {
    const profile = { businessText: "创作者内容审批", watchlist: ["Postiz"] };
    const queries = buildDiscoveryQueries(profile, 0, new Set(["xiaohongshu", "linkedin"]));
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ platform: "xiaohongshu", language: "zh", domains: ["xiaohongshu.com"] });
    expect(queries[1]).toMatchObject({ language: "en" });
    expect(queries.every(q => q.query.includes("Postiz") && q.query.includes("创作者内容审批"))).toBe(true);
    expect(buildDiscoveryQueries(profile, 1, new Set(["xiaohongshu"]))[0].kind).not.toBe(queries[0].kind);
    expect(buildDiscoveryQueries({}, 0, new Set(["linkedin"]))).toEqual([]);
  });
  it("deduplicates tracking URLs and syndicated titles; never accepts local or non-HTTPS evidence", () => {
    expect(canonicalSignalUrl("https://example.com/post?utm_source=x&key=abc#section")).toBe("https://example.com/post?key=abc");
    for (const url of ["http://example.com", "https://127.0.0.1/a", "https://localhost/a"]) expect(() => canonicalSignalUrl(url)).toThrow();
    expect(mergeCandidates([], [{...candidate,url:"https://www.baidu.com/s?wd=hot"}])).toEqual([]);
    expect(mergeCandidates([candidate], [{ ...candidate, url: candidate.url + "?utm_source=x" }, { ...candidate, url: "https://another.com/post" }])).toHaveLength(1);
    expect(mergeCandidates([], Array.from({ length: 40 }, (_, i) => ({ ...candidate, url: `https://example.com/${i}`, title: `Title ${i}` })))).toHaveLength(30);
  });
  it("requires literal source evidence and rejects indexed summaries, invented excerpts, stale and future dates", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    expect(verifiedAssessment(assessment, candidate, now)).not.toBeNull();
    expect(verifiedAssessment(assessment, { ...candidate, evidenceLevel: "indexed" }, now)).toBeNull();
    expect(verifiedAssessment({ ...assessment, excerpt: "An invented quotation that does not appear in the source." }, candidate, now)).toBeNull();
    for (const publishedAt of ["2020-01-01", "2027-01-01", "invalid"]) expect(verifiedAssessment(assessment, { ...candidate, publishedAt }, now)).toBeNull();
    expect(verifiedAssessment(assessment, { ...candidate, publishedAt: null }, now)?.whyNow).toContain("Publication date is unknown");
  });
  it("extracts original article body and publication time, but rejects a long login wall", () => {
    const page = extractSignalPage(`<meta property="article:published_time" content="2026-09-07T01:00:00Z"><nav>irrelevant menu</nav><article><p>${candidate.text}</p></article><footer>irrelevant legal</footer>`);
    expect(page).toMatchObject({ substantive: true, publishedAt: candidate.publishedAt!.replace("Z", ".000Z") });
    expect(page.text).not.toContain("irrelevant");
    expect(extractSignalPage(`<main>Sign in to continue ${"promotional menu ".repeat(40)}</main>`).substantive).toBe(false);
  });
  it("retains video-page metadata as a candidate, never as full video evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<article>${candidate.text}</article>`, { headers: { "Content-Type": "text/html" } })));
    expect(await readSignalCandidate({ ...candidate, platform: "bilibili", evidenceLevel: "indexed" })).toMatchObject({ status: "blocked", evidenceLevel: "metadata" });
  });
  it("does not interpret a publisher's local clock as UTC or replace dated feed evidence", async () => {
    const html = `<script type="application/ld+json">{"datePublished":"2026-09-08T16:09:36"}</script><article>${candidate.text}</article>`;
    expect(extractSignalPage(html).publishedAt).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { headers: { "Content-Type": "text/html" } })));
    expect(await readSignalCandidate({ ...candidate, publishedAt: "2026-09-08T08:49:36Z", evidenceLevel: "indexed" }))
      .toMatchObject({ publishedAt: "2026-09-08T08:49:36Z", evidenceLevel: "direct" });
    expect(extractSignalPage(html.replace("2026-09-08T16:09:36", "2026-09-08T16:09:36+08:00")).publishedAt)
      .toBe("2026-09-08T08:09:36.000Z");
  });
  it("uses Atom alternate permalinks over self links and never fabricates a search-page fallback", () => {
    const entries = parseFeedEntries(`<feed><entry><title>Weekly business signals</title><id>one</id><link rel="self" href="https://example.com/api/one"/><link rel="alternate" href="http://example.com/blog/one"/></entry><entry><title>Missing permalink</title><id>two</id></entry></feed>`);
    expect(entries).toHaveLength(1); expect(entries[0].url).toBe("https://example.com/blog/one");
  });
  it("blocks search landing pages before any original-source read", async () => {
    const fetchMock=vi.fn(); vi.stubGlobal("fetch",fetchMock);
    expect(await readSignalCandidate({...candidate,url:"https://www.google.com/search?q=workflow"})).toMatchObject({status:"blocked",evidenceLevel:"indexed"});
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("extracts nested article and forum bodies without the navigation shell", () => {
    const page=extractSignalPage(`<nav>menu</nav><div class="cooked"><div>First paragraph.</div><p>${candidate.text}</p></div><div>other discussions</div>`);
    expect(page.substantive).toBe(true); expect(page.text).toContain("First paragraph."); expect(page.text).not.toContain("other discussions");
  });
  it("preserves every Google trend even when the feed reuses one URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<rss><channel>${["Alpha", "Beta", "Gamma"].map(t => `<item><title>${t}</title><link>https://trends.google.com/trending/rss?geo=US</link></item>`).join("")}</channel></rss>`, { headers: { "Content-Type": "application/rss+xml" } })));
    const result = await new GoogleTrendsAdapter("US").collect();
    expect(result.ok).toBe(true); expect(new Set(result.signals.map(s => s.sourceItemId)).size).toBe(3);
  });
  it("reads public issue evidence and ignores pull requests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { number: 1, title: "Approval request", html_url: "https://github.com/gitroomhq/postiz-app/issues/1", body: excerpt, created_at: candidate.publishedAt, comments: 3 },
      { number: 2, title: "Pull request", html_url: "https://github.com/gitroomhq/postiz-app/pull/2", pull_request: {} }
    ]), { headers: { "Content-Type": "application/json" } })));
    const result = await new GitHubTrendAdapter("gitroomhq/postiz-app").collect();
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({ summary: excerpt, publishedAt: candidate.publishedAt, evidencePayload: { evidenceLevel: "public_api", comments: 3 } });
  });
});
describe("search attribution and quotas", () => {
  const frame = (output: unknown) => `data: ${JSON.stringify({ output })}\n\n`;
  it("merges split multimodal chunks and early attribution; rejects stream errors", () => {
    const stream = frame({ search_info: { search_results: [{ url: candidate.url }] } }) + frame({ choices: [{ message: { content: [{ text: "hello " }] } }] }) + frame({ choices: [{ message: { content: [{ text: "world" }] } }] }) + "data: [DONE]\n\n";
    expect(parseSearchEventStream(stream)).toMatchObject({ output: { choices: [{ message: { content: "hello world" } }], search_info: { search_results: [{ url: candidate.url }] } } });
    expect(() => parseSearchEventStream('data: {"code":"QuotaExceeded"}\n\n')).toThrow("QuotaExceeded");
  });
  it("uses SSE, validates returned domains, and reserves before the network request", async () => {
    const reserve = vi.fn(async () => true);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(reserve).toHaveBeenCalledTimes(1);
      expect(init?.headers).toMatchObject({ "X-DashScope-SSE": "enable" });
      expect(JSON.parse(String(init?.body)).parameters.incremental_output).toBe(true);
      return new Response(frame({ search_info: { search_results: [
        { url: "https://www.reddit.com/r/saas/comments/abc", title: "Original request" },
        { url: "https://reddit.com.evil.example/post", title: "Wrong host" }
      ] }, choices: [{ message: { content: [{ text: "Search result" }] } }] }), { headers: { "Content-Type": "text/event-stream" } });
    });
    const result = await searchPublicWebByQuery({ query: "content approval", domains: ["reddit.com"] }, { providers: [provider], fetchImpl, beforeAttempt: reserve });
    expect(result).toMatchObject({ available: true, sources: [{ url: "https://www.reddit.com/r/saas/comments/abc" }] });
    if (result.available) expect(result.sources).toHaveLength(1);
  });
  it("makes no request after budget denial and counts failed fallback attempts", async () => {
    const fetchImpl = vi.fn(async () => new Response("error", { status: 503 }));
    const reserve = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await searchPublicWebByQuery({ query: "creator workflow" }, { providers: [provider, { ...provider, name: "fallback", models: { ...provider.models, haiku: "qwen3.7-flash" } }], fetchImpl, beforeAttempt: reserve });
    expect(result).toMatchObject({ available: false, reason: "budget_exhausted" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(2);
  });
});
