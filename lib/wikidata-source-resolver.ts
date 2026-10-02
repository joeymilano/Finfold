import { z } from "zod";
import {
  FEED_CONTENT_TYPES,
  JSON_CONTENT_TYPES,
  readTextWithLimit,
  safeExternalFetch,
  validateExternalHttpUrl
} from "@/lib/safe-url";
import { sha256Hex } from "@/lib/source-image-discovery";

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIMEDIA_USER_AGENT = "FinfoldSourceDiscovery/1.0 (https://www.finfold.app)";
const MAX_WIKIDATA_BYTES = 512 * 1024;
const MAX_SITEMAP_BYTES = 3 * 1024 * 1024;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const RELATED_ENTITY_PROPERTIES = ["P178", "P176", "P127", "P749"] as const;
const ENTITY_DESCRIPTION_PATTERN = /\b(?:company|corporation|organization|organisation|brand|product|software|platform|model|system|service|person|founder|executive|artist|actor|author|singer|athlete|politician|conference|event|festival|award|exhibition)\b|(?:公司|企业|组织|品牌|产品|软件|平台|模型|系统|服务|人物|创始人|高管|艺术家|演员|作家|歌手|运动员|政治人物|大会|会议|活动|节日|奖项|展览)/iu;
const SITEMAP_SECTION_PATTERN = /(?:release|product|research|publication|news|blog|post|announcement|page|company)/i;

const wikidataSearchResultSchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  label: z.string().min(1).max(300),
  description: z.string().max(500).optional(),
  match: z.object({
    type: z.string().optional(),
    language: z.string().optional(),
    text: z.string().max(300).optional()
  }).optional()
});

const wikidataSearchResponseSchema = z.object({
  search: z.array(wikidataSearchResultSchema).default([])
});

const wikidataClaimSchema = z.object({
  rank: z.enum(["preferred", "normal", "deprecated"]).optional(),
  mainsnak: z.object({
    datavalue: z.object({ value: z.unknown() }).optional()
  })
});

const wikidataEntitySchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  claims: z.record(z.array(wikidataClaimSchema)).default({})
});

const wikidataEntitiesResponseSchema = z.object({
  entities: z.record(wikidataEntitySchema)
});

type WikidataSearchResult = z.infer<typeof wikidataSearchResultSchema>;
type WikidataEntity = z.infer<typeof wikidataEntitySchema>;

export type RankedWikidataEntity = WikidataSearchResult & {
  score: number;
  confidence: "high" | "medium" | "low";
};

export type OfficialSourcePage = {
  url: string;
  title: string;
  confidence: "high" | "medium";
  wikidataEntityId: string;
};

export type WikidataOfficialSourceResolution = {
  entity: string;
  matchedEntity: {
    id: string;
    label: string;
    description?: string;
    confidence: "high" | "medium";
  } | null;
  pages: OfficialSourcePage[];
};

type BaseOfficialSite = OfficialSourcePage & {
  relationship: "direct" | "related";
};

/**
 * Resolve an explicit entity to official pages without a paid search API.
 * Wikidata is used only for entity and P856 ownership evidence. Images still
 * come from the resulting official site and pass through Finfold's normal
 * discovery, selection-token, SSRF, MIME, and storage checks.
 */
export async function resolveWikidataOfficialSourcePages(
  entity: string
): Promise<WikidataOfficialSourceResolution> {
  const normalizedEntity = entity.trim().replace(/\s+/g, " ").slice(0, 120);
  const cacheKey = `wikidata-official:${await sha256Hex(normalizedEntity.toLocaleLowerCase())}`;
  const cached = await readJsonCache<WikidataOfficialSourceResolution>(cacheKey);
  if (cached) return cached;

  const search = await fetchWikidataSearch(normalizedEntity);
  const ranked = rankWikidataEntities(normalizedEntity, search.search);
  const best = ranked[0];
  if (!best || best.confidence === "low") {
    const empty = { entity: normalizedEntity, matchedEntity: null, pages: [] };
    await writeJsonCache(cacheKey, empty, CACHE_TTL_SECONDS);
    return empty;
  }

  const entityConfidence = best.confidence === "high" ? "high" : "medium";
  const entities = await fetchWikidataEntities([best.id]);
  const matched = entities.get(best.id);
  if (!matched) {
    return { entity: normalizedEntity, matchedEntity: null, pages: [] };
  }

  const directSites: BaseOfficialSite[] = officialWebsites(matched).map((url) => ({
    url,
    title: best.label,
    confidence: entityConfidence,
    wikidataEntityId: best.id,
    relationship: "direct" as const
  }));

  const relatedIds = Array.from(new Set(
    RELATED_ENTITY_PROPERTIES.flatMap((property) => linkedEntityIds(matched, property))
  )).slice(0, 8);
  const relatedEntities = relatedIds.length > 0
    ? await fetchWikidataEntities(relatedIds)
    : new Map<string, WikidataEntity>();
  const relatedSites: BaseOfficialSite[] = relatedIds.flatMap((id) => {
    const related = relatedEntities.get(id);
    if (!related) return [];
    return officialWebsites(related).map((url) => ({
      url,
      title: best.label,
      confidence: "medium" as const,
      wikidataEntityId: id,
      relationship: "related" as const
    }));
  });

  const baseSites = dedupeBaseSites<BaseOfficialSite>([...directSites, ...relatedSites]).slice(0, 3);
  const pages: OfficialSourcePage[] = [];
  for (const site of baseSites) {
    const shouldInspectSitemap = site.relationship === "related" || entityTokens(normalizedEntity).length > 1;
    if (shouldInspectSitemap) {
      const matchedPages = await discoverMatchingSitemapPages(site.url, normalizedEntity);
      pages.push(...matchedPages.map((page) => ({
        url: page.url,
        title: best.label,
        confidence: page.score >= 100 && entityConfidence === "high" ? "high" as const : "medium" as const,
        wikidataEntityId: site.wikidataEntityId
      })));
    }
    pages.push({
      url: site.url,
      title: site.title,
      confidence: site.confidence,
      wikidataEntityId: site.wikidataEntityId
    });
  }

  const result: WikidataOfficialSourceResolution = {
    entity: normalizedEntity,
    matchedEntity: {
      id: best.id,
      label: best.label,
      description: best.description,
      confidence: entityConfidence
    },
    pages: dedupeOfficialPages(pages).slice(0, 6)
  };
  await writeJsonCache(cacheKey, result, CACHE_TTL_SECONDS);
  return result;
}

export function rankWikidataEntities(
  query: string,
  results: WikidataSearchResult[]
): RankedWikidataEntity[] {
  const normalizedQuery = normalizeEntityName(query);
  const scored = results.map((result, index) => {
    const label = normalizeEntityName(result.label);
    const matchedText = normalizeEntityName(result.match?.text ?? "");
    let score = 0;
    if (label === normalizedQuery) score += 100;
    else if (matchedText === normalizedQuery) score += 94;
    else if (label.includes(normalizedQuery) || normalizedQuery.includes(label)) score += 68;
    if (ENTITY_DESCRIPTION_PATTERN.test(result.description ?? "")) score += 12;
    score -= index * 2;
    return { ...result, score };
  }).sort((left, right) => right.score - left.score);

  return scored.map((result, index) => {
    const next = index === 0 ? scored[1] : undefined;
    const ambiguous = index === 0 && next && result.score - next.score < 8;
    const confidence = result.score >= 108 && !ambiguous
      ? "high" as const
      : result.score >= 88
        ? "medium" as const
        : "low" as const;
    return { ...result, confidence };
  });
}

export function rankSitemapPageUrls(
  entity: string,
  sitemapXml: string,
  officialSiteUrl: string
): Array<{ url: string; score: number }> {
  const official = validateExternalHttpUrl(officialSiteUrl);
  const tokens = entityTokens(entity);
  const compactEntity = normalizeEntityName(entity);
  const requiredMatches = tokens.length >= 2 ? 2 : 1;
  const seen = new Set<string>();

  return extractSitemapLocations(sitemapXml).flatMap((value) => {
    try {
      const url = validateExternalHttpUrl(value);
      if (!sameDomain(official.hostname, url.hostname)) return [];
      url.hash = "";
      const normalizedUrl = url.toString();
      if (seen.has(normalizedUrl)) return [];
      seen.add(normalizedUrl);
      const searchable = decodeURIComponent(`${url.pathname} ${url.search}`).toLocaleLowerCase();
      const compactUrl = normalizeEntityName(searchable);
      const matches = tokens.filter((token) => searchable.includes(token)).length;
      if (matches < requiredMatches && !compactUrl.includes(compactEntity)) return [];
      let score = matches * 28;
      if (compactEntity.length >= 4 && compactUrl.includes(compactEntity)) score += 70;
      if (/\/(?:index|news|research|product|release|blog)\//i.test(url.pathname)) score += 12;
      return [{ url: normalizedUrl, score }];
    } catch {
      return [];
    }
  }).sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}

async function fetchWikidataSearch(query: string): Promise<z.infer<typeof wikidataSearchResponseSchema>> {
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", /\p{Script=Han}/u.test(query) ? "zh" : "en");
  url.searchParams.set("uselang", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "5");
  url.searchParams.set("maxlag", "5");
  url.searchParams.set("format", "json");
  const response = await fetchWikimediaJson(url, "wikidata_entity_search");
  return wikidataSearchResponseSchema.parse(response);
}

async function fetchWikidataEntities(ids: string[]): Promise<Map<string, WikidataEntity>> {
  if (ids.length === 0) return new Map();
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("props", "claims");
  url.searchParams.set("maxlag", "5");
  url.searchParams.set("format", "json");
  const response = wikidataEntitiesResponseSchema.parse(
    await fetchWikimediaJson(url, "wikidata_entity_claims")
  );
  return new Map(Object.values(response.entities).map((entity) => [entity.id, entity]));
}

async function fetchWikimediaJson(url: URL, auditPurpose: string): Promise<unknown> {
  const response = await safeExternalFetch(
    url.toString(),
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "Api-User-Agent": WIKIMEDIA_USER_AGENT,
        "User-Agent": WIKIMEDIA_USER_AGENT
      }
    },
    {
      allowedContentTypes: JSON_CONTENT_TYPES,
      timeoutMs: 8_000,
      auditPurpose
    }
  );
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}.`);
  return JSON.parse(await readTextWithLimit(response, MAX_WIKIDATA_BYTES)) as unknown;
}

async function discoverMatchingSitemapPages(
  officialSiteUrl: string,
  entity: string
): Promise<Array<{ url: string; score: number }>> {
  const official = validateExternalHttpUrl(officialSiteUrl);
  const origin = official.origin;
  const sitemapUrls = new Set<string>();
  try {
    const robots = await fetchBoundedFeed(`${origin}/robots.txt`, "official_site_robots", 256 * 1024);
    for (const match of robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)) {
      const sitemapUrl = safeSameDomainUrl(match[1], official.hostname);
      if (sitemapUrl) sitemapUrls.add(sitemapUrl);
    }
  } catch {
    // A missing robots file does not prevent trying the standard sitemap path.
  }
  sitemapUrls.add(`${origin}/sitemap.xml`);

  const pageCandidates: Array<{ url: string; score: number }> = [];
  for (const sitemapUrl of Array.from(sitemapUrls).slice(0, 2)) {
    try {
      const xml = await fetchBoundedFeed(sitemapUrl, "official_site_sitemap", MAX_SITEMAP_BYTES);
      if (!/<sitemapindex\b/i.test(xml)) {
        pageCandidates.push(...rankSitemapPageUrls(entity, xml, official.toString()));
        continue;
      }
      const childSitemaps = rankSitemapSections(extractSitemapLocations(xml), entity, official.hostname).slice(0, 3);
      const childDocuments = await Promise.all(childSitemaps.map(async (url) => {
        try {
          return await fetchBoundedFeed(url, "official_site_sitemap_child", MAX_SITEMAP_BYTES);
        } catch {
          return "";
        }
      }));
      for (const child of childDocuments) {
        if (child) pageCandidates.push(...rankSitemapPageUrls(entity, child, official.toString()));
      }
    } catch {
      // Try another declared sitemap or fall back to the official home page.
    }
  }
  return dedupeRankedPages(pageCandidates).slice(0, 4);
}

async function fetchBoundedFeed(url: string, auditPurpose: string, maxBytes: number): Promise<string> {
  const response = await safeExternalFetch(
    url,
    { headers: { Accept: "application/xml,text/xml,text/plain;q=0.9", "User-Agent": WIKIMEDIA_USER_AGENT } },
    { allowedContentTypes: FEED_CONTENT_TYPES, timeoutMs: 6_000, auditPurpose }
  );
  if (!response.ok) throw new Error(`Official site returned HTTP ${response.status}.`);
  return readTextWithLimit(response, maxBytes);
}

function officialWebsites(entity: WikidataEntity): string[] {
  return stringClaimValues(entity, "P856").flatMap((value) => {
    try {
      const url = validateExternalHttpUrl(value);
      url.hash = "";
      return [url.toString()];
    } catch {
      return [];
    }
  });
}

function linkedEntityIds(entity: WikidataEntity, property: string): string[] {
  return claimValues(entity, property).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && /^Q\d+$/.test(id) ? [id] : [];
  });
}

function stringClaimValues(entity: WikidataEntity, property: string): string[] {
  return claimValues(entity, property).filter((value): value is string => typeof value === "string");
}

function claimValues(entity: WikidataEntity, property: string): unknown[] {
  return [...(entity.claims[property] ?? [])]
    .filter((claim) => claim.rank !== "deprecated")
    .sort((left, right) => rankWeight(right.rank) - rankWeight(left.rank))
    .flatMap((claim) => claim.mainsnak.datavalue ? [claim.mainsnak.datavalue.value] : []);
}

function rankWeight(rank: "preferred" | "normal" | "deprecated" | undefined): number {
  return rank === "preferred" ? 2 : rank === "normal" ? 1 : 0;
}

function rankSitemapSections(urls: string[], entity: string, officialHost: string): string[] {
  const tokens = entityTokens(entity);
  return urls.flatMap((value) => {
    const url = safeSameDomainUrl(value, officialHost);
    if (!url) return [];
    const searchable = decodeURIComponent(new URL(url).pathname).toLocaleLowerCase();
    let score = tokens.filter((token) => searchable.includes(token)).length * 50;
    if (/release/i.test(searchable)) score += 45;
    else if (/product/i.test(searchable)) score += 40;
    else if (/research/i.test(searchable)) score += 35;
    else if (/publication|news|blog|post|announcement/i.test(searchable)) score += 30;
    else if (/page/i.test(searchable)) score += 20;
    else if (SITEMAP_SECTION_PATTERN.test(searchable)) score += 10;
    return [{ url, score }];
  }).sort((left, right) => right.score - left.score || left.url.localeCompare(right.url)).map((item) => item.url);
}

function extractSitemapLocations(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi), (match) => decodeXmlEntities(match[1].trim()))
    .filter(Boolean)
    .slice(0, 20_000);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function safeSameDomainUrl(value: string, officialHost: string): string | null {
  try {
    const url = validateExternalHttpUrl(value);
    if (!sameDomain(officialHost, url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameDomain(left: string, right: string): boolean {
  const normalizedLeft = left.toLocaleLowerCase().replace(/^www\./, "");
  const normalizedRight = right.toLocaleLowerCase().replace(/^www\./, "");
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`.${normalizedRight}`)
    || normalizedRight.endsWith(`.${normalizedLeft}`);
}

function entityTokens(value: string): string[] {
  return Array.from(new Set(
    value.toLocaleLowerCase().split(/[^\p{Letter}\p{Number}]+/u).filter((token) => token.length >= 2 && !/^\d+$/.test(token))
  )).slice(0, 8);
}

function normalizeEntityName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function dedupeBaseSites<T extends { url: string; confidence: "high" | "medium" }>(sites: T[]): T[] {
  const seen = new Map<string, T>();
  for (const site of sites) {
    const key = new URL(site.url).hostname.toLocaleLowerCase().replace(/^www\./, "");
    const existing = seen.get(key);
    if (!existing || (existing.confidence === "medium" && site.confidence === "high")) seen.set(key, site);
  }
  return Array.from(seen.values()).sort((left, right) => confidenceWeight(right.confidence) - confidenceWeight(left.confidence));
}

function dedupeOfficialPages(pages: OfficialSourcePage[]): OfficialSourcePage[] {
  const seen = new Map<string, OfficialSourcePage>();
  for (const page of pages) {
    const key = page.url.replace(/\/$/, "");
    const existing = seen.get(key);
    if (!existing || (existing.confidence === "medium" && page.confidence === "high")) seen.set(key, page);
  }
  return Array.from(seen.values()).sort((left, right) => confidenceWeight(right.confidence) - confidenceWeight(left.confidence));
}

function dedupeRankedPages(pages: Array<{ url: string; score: number }>): Array<{ url: string; score: number }> {
  const seen = new Map<string, { url: string; score: number }>();
  for (const page of pages) {
    const existing = seen.get(page.url);
    if (!existing || page.score > existing.score) seen.set(page.url, page);
  }
  return Array.from(seen.values()).sort((left, right) => right.score - left.score);
}

function confidenceWeight(value: "high" | "medium"): number {
  return value === "high" ? 2 : 1;
}

async function readJsonCache<T>(key: string): Promise<T | null> {
  const cache = defaultWorkerCache();
  if (!cache) return null;
  try {
    const response = await cache.match(internalCacheRequest(key));
    return response ? await response.json() as T : null;
  } catch {
    return null;
  }
}

async function writeJsonCache(key: string, value: unknown, maxAgeSeconds: number): Promise<void> {
  const cache = defaultWorkerCache();
  if (!cache) return;
  try {
    await cache.put(internalCacheRequest(key), new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAgeSeconds}` }
    }));
  } catch {
    // Cache is an optimization. Entity resolution still returns live results.
  }
}

function defaultWorkerCache(): Cache | null {
  const storage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined;
  return storage?.default ?? null;
}

function internalCacheRequest(key: string): Request {
  return new Request(`https://finfold-cache.invalid/source-entities/${encodeURIComponent(key)}`);
}
