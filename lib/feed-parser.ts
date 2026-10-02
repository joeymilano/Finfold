/**
 * Minimal, edge-safe feed reading for watch sources — no DOM, no XML
 * parser dependency. Good enough to pull "the latest entry" out of RSS,
 * Atom, and GitHub Releases feeds (all of which GitHub/most changelog
 * tools expose as RSS/Atom anyway); not a general-purpose feed parser.
 */
import { FEED_CONTENT_TYPES, readTextWithLimit, safeExternalFetch } from "@/lib/safe-url";

export type FeedEntry = {
  title: string;
  summary: string;
  link: string;
  /** Best-effort stable identifier for de-duping across polls — prefers
   * <id>/<guid>, falls back to the link, then the title. */
  id: string;
};

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return decodeEntities(stripCData(match[1]).trim());
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?>`, "i"));
  return match ? match[1] : null;
}

function stripCData(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts the single most recent entry from an RSS 2.0 or Atom feed XML
 * string. Returns null if no <item>/<entry> could be found (malformed or
 * unrecognized feed format).
 */
export function parseLatestFeedEntry(xml: string): FeedEntry | null {
  // RSS 2.0: <item>...</item>
  const itemMatch = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/i);
  if (itemMatch) {
    const block = itemMatch[1];
    const title = extractTag(block, "title") ?? "";
    const link = extractTag(block, "link") ?? "";
    const guid = extractTag(block, "guid");
    const description = extractTag(block, "description") ?? "";
    return {
      title,
      summary: description.slice(0, 2000),
      link,
      id: guid || link || title
    };
  }

  // Atom: <entry>...</entry>, link is an attribute not a text node
  const entryMatch = xml.match(/<entry[^>]*>([\s\S]*?)<\/entry>/i);
  if (entryMatch) {
    const block = entryMatch[1];
    const title = extractTag(block, "title") ?? "";
    const link = extractAttr(block, "link", "href") ?? extractTag(block, "link") ?? "";
    const id = extractTag(block, "id");
    const summary = extractTag(block, "summary") ?? extractTag(block, "content") ?? "";
    return {
      title,
      summary: summary.slice(0, 2000),
      link,
      id: id || link || title
    };
  }

  return null;
}

/** Fetches a feed URL and returns its latest entry, or null on any failure. */
export async function fetchLatestFeedEntry(url: string): Promise<FeedEntry | null> {
  try {
    const response = await safeExternalFetch(url, {
      headers: {
        Accept: "application/atom+xml,application/rss+xml,application/xml,text/xml,application/json,text/plain;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; FinfoldWatchBot/1.0)"
      }
    }, {
      allowedContentTypes: FEED_CONTENT_TYPES,
      timeoutMs: 10_000,
      auditPurpose: "feed_read"
    });
    if (!response.ok) {
      return null;
    }
    const xml = await readTextWithLimit(response, 1024 * 1024);
    return parseLatestFeedEntry(xml);
  } catch (error) {
    console.error("[feed-parser] fetch failed:", error);
    return null;
  }
}
