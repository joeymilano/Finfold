import { z } from "zod";
import { stripHtmlToText } from "@/lib/html-strip";
import {
  JSON_CONTENT_TYPES,
  safeExternalFetch,
  validateExternalHttpUrl
} from "@/lib/safe-url";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const HN_WEB_BASE = "https://news.ycombinator.com/item?id=";
const MAX_KEYWORDS = 8;
const MAX_SCAN_ITEMS = 100;
const MAX_SIGNALS = 20;
const FETCH_BATCH_SIZE = 8;

const newestStoryIdsSchema = z.array(z.number().int().positive()).max(1_000);
const hackerNewsItemSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().max(32),
  title: z.string().max(600).optional(),
  text: z.string().max(100_000).optional(),
  url: z.string().max(2_048).optional(),
  score: z.number().int().nonnegative().optional(),
  descendants: z.number().int().nonnegative().optional(),
  time: z.number().int().positive().optional(),
  dead: z.boolean().optional(),
  deleted: z.boolean().optional()
});

export type PublicDemandSignal = {
  sourceItemId: string;
  title: string;
  excerpt: string;
  discussionUrl: string;
  externalUrl: string | null;
  score: number | null;
  comments: number | null;
  publishedAt: string | null;
  matchedKeywords: string[];
};

export type PublicDemandSignalResult =
  | {
    available: true;
    source: string;
    capturedAt: string;
    leadStatus: "unverified_signal";
    signals: PublicDemandSignal[];
  }
  | {
    available: false;
    reason: string;
    userGuidance?: string;
  };

type DemandSignalInput = {
  keywords: unknown;
  limit?: unknown;
  scanLimit?: unknown;
};

function clampInteger(value: unknown, fallback: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), maximum);
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .flatMap((keyword) => typeof keyword === "string" ? [keyword.trim()] : [])
    .filter((keyword) => keyword.length >= 2 && keyword.length <= 50);
  return [...new Map(normalized.map((keyword) => [keyword.toLocaleLowerCase("en-US"), keyword])).values()]
    .slice(0, MAX_KEYWORDS);
}

function safeExternalItemUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return validateExternalHttpUrl(value).toString();
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  fetcher: typeof safeExternalFetch
): Promise<unknown> {
  const response = await fetcher(url, {}, {
    allowedContentTypes: JSON_CONTENT_TYPES,
    timeoutMs: 10_000,
    auditPurpose: "hacker_news_public_demand_signals"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Reads Hacker News' official public API for current demand signals. A match
 * is deliberately not a lead: it proves only that a public post contained a
 * keyword at capturedAt. Authors and contact details are never returned.
 */
export async function fetchHackerNewsDemandSignals(
  input: DemandSignalInput,
  fetcher: typeof safeExternalFetch = safeExternalFetch
): Promise<PublicDemandSignalResult> {
  const keywords = normalizeKeywords(input.keywords);
  if (keywords.length === 0) {
    return {
      available: false,
      reason: "至少需要 1 个有效关键词（每个 2-50 个字符）。",
      userGuidance: "请提供产品品类、用户问题或购买意图词，例如 creator analytics、social scheduling。"
    };
  }

  const limit = clampInteger(input.limit, 10, MAX_SIGNALS);
  const scanLimit = clampInteger(input.scanLimit, 60, MAX_SCAN_ITEMS);
  let newestStoryIds: number[];
  try {
    const parsed = newestStoryIdsSchema.safeParse(
      await fetchJson(`${HN_API_BASE}/newstories.json`, fetcher)
    );
    if (!parsed.success) {
      return { available: false, reason: "Hacker News 返回的最新帖子列表结构与预期不符。" };
    }
    newestStoryIds = parsed.data.slice(0, scanLimit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      reason: `Hacker News 官方 API 暂时不可用：${message}`,
      userGuidance: "请稍后重试；Finfold 不会用模型记忆或模拟数据替代本次抓取。"
    };
  }

  const normalizedKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase("en-US"));
  const signals: PublicDemandSignal[] = [];
  for (let offset = 0; offset < newestStoryIds.length && signals.length < limit; offset += FETCH_BATCH_SIZE) {
    const batch = newestStoryIds.slice(offset, offset + FETCH_BATCH_SIZE);
    const items = await Promise.all(batch.map(async (id) => {
      try {
        const parsed = hackerNewsItemSchema.safeParse(
          await fetchJson(`${HN_API_BASE}/item/${id}.json`, fetcher)
        );
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    }));

    for (const item of items) {
      if (!item || item.type !== "story" || item.dead || item.deleted || !item.title?.trim()) continue;
      const title = stripHtmlToText(item.title, 600).trim();
      const excerpt = stripHtmlToText(item.text ?? "", 500).trim();
      const haystack = `${title}\n${excerpt}`.toLocaleLowerCase("en-US");
      const matchedKeywords = keywords.filter(
        (_keyword, index) => haystack.includes(normalizedKeywords[index])
      );
      if (matchedKeywords.length === 0) continue;

      signals.push({
        sourceItemId: String(item.id),
        title,
        excerpt,
        discussionUrl: `${HN_WEB_BASE}${item.id}`,
        externalUrl: safeExternalItemUrl(item.url),
        score: item.score ?? null,
        comments: item.descendants ?? null,
        publishedAt: item.time ? new Date(item.time * 1_000).toISOString() : null,
        matchedKeywords
      });
      if (signals.length >= limit) break;
    }
  }

  return {
    available: true,
    source: `${HN_API_BASE}/newstories.json`,
    capturedAt: new Date().toISOString(),
    leadStatus: "unverified_signal",
    signals
  };
}
