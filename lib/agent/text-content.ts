const LEGACY_OBJECT_TOKEN = /\[object Object\]/g;

/**
 * Provider and stored-message boundaries are runtime data, even when the
 * TypeScript SDK says `content` is a string. Some OpenAI-compatible providers
 * return rich text parts instead. Coercing those values with `String(...)`
 * leaks `[object Object]` into the paid Agent experience, so every boundary
 * uses this small, fail-closed normalizer.
 */
export function normalizeAgentTextContent(value: unknown): string {
  return cleanAgentText(extractText(value, 0));
}

function extractText(value: unknown, depth: number): string {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => extractText(part, depth + 1))
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "output_text", "value", "message"] as const) {
    const text = extractText(record[key], depth + 1);
    if (text) return text;
  }
  return "";
}

function cleanAgentText(value: string): string {
  return value
    .replace(LEGACY_OBJECT_TOKEN, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
