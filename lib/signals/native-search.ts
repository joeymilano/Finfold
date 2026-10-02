import { z } from "zod";
import { JSON_CONTENT_TYPES, readTextWithLimit, safeExternalFetch } from "@/lib/safe-url";
import { signalSourceText } from "@/lib/signals/evidence";
import type { DiscoverySourceReport, SignalCandidate } from "@/lib/signals/contracts";

const itemSchema = z.object({ id: z.number().int().positive(), type: z.literal("story"), title: z.string().max(600),
  text: z.string().max(100000).optional(), time: z.number().int().positive(), deleted: z.boolean().optional(), dead: z.boolean().optional() });

async function readJson(url: string): Promise<unknown> {
  const response = await safeExternalFetch(url, { headers: { "User-Agent": "FinfoldSignalReader/1.0 (+https://www.finfold.app)" } },
    { allowedContentTypes: JSON_CONTENT_TYPES, timeoutMs: 8000, maxRedirects: 0, auditPurpose: "signal_native_hn" });
  if (!response.ok) { await response.body?.cancel(); throw new Error("native_source_failed"); }
  return JSON.parse(await readTextWithLimit(response, 256 * 1024));
}

/** At most five free HTTP requests, including any empty-query broadening. */
export async function searchNativeHackerNews(query: string, now = new Date()): Promise<{ report: DiscoverySourceReport; candidates: SignalCandidate[] }> {
  const report: DiscoverySourceReport = { platform: "hacker_news", label: "HN 业务讨论", status: "no_results", found: 0 };
  if (!/^[a-z0-9 -]{2,60}$/i.test(query.trim())) return { report, candidates: [] };
  try {
    // The planner can emit a slug (for example three hyphenated concepts).
    // Keep the index query broad; the existing assessment decides business fit.
    const words = query.trim().replace(/-/g, " ").split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return { report, candidates: [] };
    const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
    url.searchParams.set("query", words.join(" ")); url.searchParams.set("tags", "(ask_hn,show_hn)");
    url.searchParams.set("numericFilters", `created_at_i>${Math.floor(now.getTime() / 1000 - 30 * 86400)}`);
    url.searchParams.set("hitsPerPage", "4");
    const indexSchema = z.object({ hits: z.array(z.object({ objectID: z.string().regex(/^\d{1,12}$/) })).max(100) });
    let index = indexSchema.parse(await readJson(url.toString()));
    let readLimit = 4;
    if (!index.hits.length && words.length > 1) {
      // A second index request uses one of the same five request slots. Do not
      // broaden after a network failure or use index snippets as original text.
      url.searchParams.set("query", words[0]);
      index = indexSchema.parse(await readJson(url.toString()));
      readLimit = 3;
    }
    const ids = [...new Set(index.hits.map(hit => hit.objectID))].slice(0, readLimit);
    const reads = await Promise.allSettled(ids.map(id => readJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
    const candidates: SignalCandidate[] = [];
    for (let i = 0; i < reads.length; i++) {
      const result = reads[i]; if (result.status !== "fulfilled") continue;
      const parsed = itemSchema.safeParse(result.value); if (!parsed.success) continue;
      const item = parsed.data, age = now.getTime() - item.time * 1000;
      if (String(item.id) !== ids[i] || item.dead || item.deleted || age < -3600000 || age > 30 * 86400000) continue;
      const text = signalSourceText(item.text ?? "");
      if (text.length < 180) continue; // Link-only posts are already covered by the native feeds.
      candidates.push({ url: `https://news.ycombinator.com/item?id=${item.id}`, title: item.title.slice(0, 300),
        snippet: text.slice(0, 1200), text, publishedAt: new Date(item.time * 1000).toISOString(), platform: "hacker_news",
        sourceLabel: /^Show HN:/i.test(item.title) ? "Show HN" : /^Ask HN:/i.test(item.title) ? "Ask HN" : "Hacker News",
        evidenceLevel: "public_api", status: "pending" });
    }
    report.found = candidates.length;
    report.status = candidates.length ? "available" : reads.some(result => result.status === "rejected") ? "failed" : "no_results";
    return { report, candidates };
  } catch { return { report: { ...report, status: "failed" }, candidates: [] }; }
}
