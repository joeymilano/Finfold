import type { Locale } from "@/lib/i18n";

const PLACEHOLDER_TITLE = /^(?:n\s*\/?\s*a|not\s+applicable|none|null|undefined|unknown|untitled|无标题|暂无标题|暂无|无)(?:[\s:：\-—–_.…]*)$/iu;
const BROKEN_ENCODING = /(?:\uFFFD|ï¿½|Ã[\u0080-\u00ff]|Â[\u0080-\u00ff\s]|â(?:€|€™|€œ|€“|€”|€¦)|(?:ä¸|æ–|å­|çš|è¿|é¢))/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu;

export function cleanContentTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isUsableContentTitle(value: unknown): boolean {
  const title = cleanContentTitle(value);
  if (!title || PLACEHOLDER_TITLE.test(title)) return false;
  if (BROKEN_ENCODING.test(title)) return false;
  if (!/[\p{L}\p{N}]/u.test(title)) return false;
  return true;
}

/** Stable value for persistence and non-localized server-side consumers. */
export function canonicalContentTitle(value: unknown): string {
  const title = cleanContentTitle(value);
  return isUsableContentTitle(title) ? title : "Untitled";
}

/** Honest localized fallback for UI, copy, share, and export surfaces. */
export function displayContentTitle(value: unknown, locale: Locale): string {
  return isUsableContentTitle(value)
    ? cleanContentTitle(value)
    : locale === "zh"
      ? "无标题"
      : "Untitled";
}
