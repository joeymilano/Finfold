import type { Locale } from "@/lib/i18n";

const BRACKET_PREFIX = /^[【「\[(][^】」\])]*[】」\])]\s*/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const SPLIT_PUNCTUATION = /[，。：；？！…—,:;?!|–\n]+/;
const TRAILING_PARTICLES = /(的|了|吗|呢|呀|啦)+$/;
const HAS_DIGIT = /\d/;

const MAX_ZH_CHARS = 12;
const MAX_EN_WORDS = 6;

/**
 * Derive a short cover title from a long platform title — used for the
 * WeChat 1:1 companion cover, which must never be a crop of the 21:9 one.
 */
export function deriveShortTitle(title: string, locale: Locale): string {
  const stripped = title.replace(BRACKET_PREFIX, "").replace(EMOJI, "").trim();

  const clauses = stripped
    .split(SPLIT_PUNCTUATION)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);

  if (clauses.length === 0) {
    return stripped;
  }

  const chosen = clauses.find((clause) => HAS_DIGIT.test(clause)) ?? clauses[0];
  const cleaned = chosen.replace(TRAILING_PARTICLES, "").replace(/[.。…]+$/, "").trim();

  return locale === "zh" ? capZh(cleaned) : capEn(cleaned);
}

function capZh(text: string): string {
  return text.length > MAX_ZH_CHARS ? `${text.slice(0, MAX_ZH_CHARS)}` : text;
}

function capEn(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > MAX_EN_WORDS ? words.slice(0, MAX_EN_WORDS).join(" ") : text;
}
