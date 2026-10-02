import { HTML_CONTENT_TYPES, readTextWithLimit, safeExternalFetch } from "@/lib/safe-url";
import { stripHtmlToText } from "@/lib/html-strip";
import { canonicalSignalUrl, type SignalCandidate } from "@/lib/signals/contracts";

export function signalSourceText(html: string): string {
  return stripHtmlToText(html, 6000).replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, value: string) => {
    const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}

export function extractSignalPage(html: string): { text: string; publishedAt: string | null; substantive: boolean } {
  const structuredBody = extractBodyElement(html);
  const article = structuredBody ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  let jsonArticle = ""; let publishedAt: string | null = null;
  for (const script of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(script[1]);
      const objects: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      for (let i = 0; i < Math.min(objects.length, 30); i++) {
        const value = objects[i]; if (!value || typeof value !== "object") continue;
        const object = value as Record<string, unknown>;
        if (Array.isArray(object["@graph"])) objects.push(...object["@graph"].slice(0, 20));
        if (typeof object.articleBody === "string") jsonArticle = object.articleBody;
        if (typeof object.datePublished === "string") publishedAt = object.datePublished;
      }
    } catch { /* Page markup is not trusted JSON. */ }
  }
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:article:published_time|datePublished|pubdate|publishdate)/i.test(tag[0])) continue;
    publishedAt ??= tag[0].match(/content=["']([^"']+)["']/i)?.[1] ?? null;
  }
  // A timezone-less publisher timestamp must not inherit the Worker's UTC zone.
  // Keep it unknown here so a dated RSS/API source can supply the timestamp.
  if (publishedAt) publishedAt = /(?:z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(publishedAt)
    && Number.isFinite(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  const cleaned = ((article ?? jsonArticle) || html).replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const text = signalSourceText(cleaned);
  const gated = /captcha|verify you are human|access denied|attention required|enable javascript|checking your browser|you have been blocked|Google Search|sign in to (?:read|continue)|登录后(?:查看|阅读)|扫码登录|安全验证|访问过于频繁/i.test(text.slice(0, 1200));
  return { text, publishedAt, substantive: text.length >= 180 && !gated };
}

export async function readSignalCandidate(candidate: SignalCandidate): Promise<SignalCandidate> {
  const url = new URL(canonicalSignalUrl(candidate.url));
  if ((/(^|\.)(google\.[a-z.]+|bing\.com|baidu\.com|duckduckgo\.com)$/.test(url.hostname) && /^\/(search|s|trending)(?:\/|$)/.test(url.pathname)) || url.hostname === "trends.google.com") {
    return { ...candidate, status: "blocked", evidenceLevel: "indexed", text: "", reason: "搜索或趋势页面不是原文证据，保留为发现线索。" };
  }
  if (candidate.evidenceLevel === "public_api" && candidate.text.length >= 180) return candidate;
  try {
    const response = await safeExternalFetch(canonicalSignalUrl(candidate.url), { headers: { "User-Agent": "FinfoldSignalReader/1.0 (+https://www.finfold.app)" } },
      { allowedContentTypes: HTML_CONTENT_TYPES, timeoutMs: 8000, maxRedirects: 4, auditPurpose: "signal_evidence_read" });
    if (!response.ok) { await response.body?.cancel(); return { ...candidate, status: "blocked", reason: `HTTP ${response.status}` }; }
    const page = extractSignalPage(await readTextWithLimit(response, 768 * 1024));
    const metadataOnly = candidate.platform === "bilibili";
    return { ...candidate, text: page.substantive ? page.text : "", publishedAt: page.publishedAt ?? candidate.publishedAt,
      evidenceLevel: page.substantive ? metadataOnly ? "metadata" : "direct" : "indexed",
      status: page.substantive && !metadataOnly ? "pending" : "blocked", reason: metadataOnly ? "仅取得视频页面信息，未取得视频正文或字幕。" : page.substantive ? undefined : "原文不可读或需要登录；仅保留索引线索。" };
  } catch { return { ...candidate, status: "blocked", reason: "原文请求失败、超时或页面类型不支持。" }; }
}

/** Find a bounded original body in common native blog/forum markup. */
function extractBodyElement(html: string): string | undefined {
  const tags = /<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let target: string | undefined; let start = 0; let depth = 0;
  for (const match of html.matchAll(tags)) {
    const tag = match[0]; const name = match[1].toLowerCase();
    if (!target) {
      if (tag.startsWith("</")) continue;
      const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
      const classes = (tag.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? "").split(/\s+/);
      if (!["js_content", "paragraph", "article_content"].includes(id ?? "") && !classes.some(c => ["article--content", "entry-content", "post-content", "post_content", "cooked", "toptext"].includes(c))) continue;
      target = name; start = match.index! + tag.length; depth = 1;
    } else if (name === target) {
      if (tag.startsWith("</")) depth--; else if (!tag.endsWith("/>")) depth++;
      if (depth === 0) return html.slice(start, match.index);
    }
  }
  return undefined;
}
