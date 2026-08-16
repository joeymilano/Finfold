/** Escapes untrusted text before it is interpolated into generated HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Removes visible Markdown bold markers for plain-text export surfaces. */
export function stripMarkdownBold(value: string): string {
  return value
    .replace(/\*\*([^*\n][\s\S]*?)\*\*/gu, "$1")
    .replace(/\*\*/gu, "");
}

/** Renders paired Markdown bold syntax after HTML escaping the source text. */
export function renderMarkdownBoldHtml(
  value: string,
  renderBold: (escapedContent: string) => string
): string {
  return escapeHtml(value)
    .replace(/\*\*([^*\n][\s\S]*?)\*\*/gu, (_match, content: string) => renderBold(content))
    .replace(/\*\*/gu, "");
}