// @vitest-environment node
// Opt-in, public read-only probes. No model calls, credentials, or database writes.
import { writeFile, mkdir } from "node:fs/promises";
import { it, expect } from "vitest";
import { createHighQualityPublicFeedAdapters, HackerNewsAdapter } from "@/lib/trends/adapters";
import { GitHubTrendAdapter } from "@/lib/trends/github-source";
import { FREE_SIGNAL_FEEDS } from "@/lib/trends/source-catalog";
import { readSignalCandidate } from "@/lib/signals/evidence";
it.skipIf(process.env.SIGNAL_LIVE_PROBE !== "true")("probes real free sources and separately records readable evidence", async () => {
  const freeKeys = new Set<string>(FREE_SIGNAL_FEEDS.map(f => `public-feed:${f.key}`));
  const adapters = [...createHighQualityPublicFeedAdapters().filter(a => freeKeys.has(a.stateKey ?? "")),new GitHubTrendAdapter("gitroomhq/postiz-app"),new HackerNewsAdapter(8,"askstories"),new HackerNewsAdapter(8,"showstories")];
  const sources=[]; const samples=[];
  for (const adapter of adapters) {
    const result=await adapter.collect();
    sources.push({label:result.label ?? adapter.stateKey,ok:result.ok,count:result.signals.length,error:result.error ?? null});
    for (const signal of result.signals.slice(0,3)) {
      const api=signal.evidencePayload?.evidenceLevel === "public_api";
      const read=await readSignalCandidate({url:signal.sourceUrl,title:signal.title,snippet:signal.summary,sourceLabel:signal.sourceLabel,platform:api?"github":signal.source,publishedAt:signal.publishedAt??null,evidenceLevel:api?"public_api":"indexed",text:api?signal.summary:"",status:"pending"});
      samples.push({title:read.title,url:read.url,source:read.sourceLabel,publishedAt:read.publishedAt,evidenceLevel:read.evidenceLevel,readable:read.status!=="blocked",characters:read.text.length,reason:read.reason ?? null,excerpt:read.text.slice(0,220)});
    }
  }
  await mkdir("docs/verification",{recursive:true});
  await writeFile("docs/verification/signal-free-source-probe-2026-09-08.json",JSON.stringify({capturedAt:new Date().toISOString(),kind:"live read-only source/access probe, not a semantic-quality or recall benchmark",sources,samples},null,2)+"\n");
  console.log(JSON.stringify({sources,samples:samples.length,readable:samples.filter(s=>s.readable).length}));
  expect(sources.some(s=>s.ok)).toBe(true);
},180000);
