/**
 * Minimal, edge-safe HTML-to-text reduction — no DOM, no external deps.
 * Good enough to feed a marketing/landing page into an LLM extraction
 * prompt; not a general-purpose HTML parser.
 */
export function stripHtmlToText(html: string, maxLength = 6000): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withoutTags = withoutNoise
    .replace(/<(title|h1|h2|h3|h4|h5|h6|p|li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const decoded = withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const collapsed = decoded
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return collapsed.slice(0, maxLength);
}
