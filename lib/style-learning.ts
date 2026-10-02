import { sendRawPrompt } from "@/lib/llm";

const MAX_LEARNED_STYLE_RULES = 10;

function buildDistillationPrompt(before: string, after: string): string {
  return `A user edited AI-generated social media copy. Compare the before/after and decide whether the edit reveals a GENERALIZABLE, REUSABLE style preference (not a one-off fact fix).

Examples of generalizable preferences: "prefers shorter sentences", "removes exclamation points", "always cuts the closing CTA down to one line", "replaces 'we' with 'I'", "adds a specific number instead of a vague claim".

Examples that are NOT generalizable (return empty): fixing a typo, correcting a specific fact (a date, a price, a name), a one-time wording swap with no discernible pattern.

If generalizable, return a single, short, actionable style rule (<=25 words) written as an instruction for future generations, e.g. "Use short, punchy sentences — avoid compound sentences over 20 words." If NOT generalizable, return exactly: NONE

=== BEFORE ===
${before}

=== AFTER ===
${after}

Return ONLY the rule text or the word NONE. No explanation, no markdown.`;
}

/**
 * Distills one edit's before/after pair into a persistent style rule, if
 * the edit reveals a generalizable pattern. Returns null when it doesn't
 * (a typo fix, a one-off fact correction) — most edits should return null,
 * which is fine; this only needs to catch the ones that DO generalize.
 *
 * Failure is non-fatal by design: the caller (the PUT outputs route) has
 * already saved the user's edit by the time this runs, so a distillation
 * failure should never surface as an error to the user — it just means
 * this particular edit doesn't get folded into learned_style.
 */
export async function distillStyleRule(before: string, after: string): Promise<string | null> {
  if (before.trim() === after.trim()) {
    return null;
  }

  const raw = (await sendRawPrompt(buildDistillationPrompt(before, after))).trim();
  if (!raw || raw.toUpperCase() === "NONE") {
    return null;
  }
  return raw.slice(0, 200);
}

/**
 * Merges a newly distilled rule into the existing learned_style list:
 * dedupes near-identical rules (case-insensitive exact match — an LLM
 * distillation step already normalizes phrasing, so exact match catches
 * the common repeat case without over-engineering fuzzy matching), then
 * caps at MAX_LEARNED_STYLE_RULES by dropping the oldest entries so the
 * prompt injection this feeds (lib/brand-brain.ts buildBrainPromptSection)
 * stays small and the list stays high-signal.
 */
export function mergeLearnedStyle(existing: string[], newRule: string): string[] {
  const withoutDuplicate = existing.filter((rule) => rule.toLowerCase() !== newRule.toLowerCase());
  const merged = [...withoutDuplicate, newRule];
  return merged.slice(-MAX_LEARNED_STYLE_RULES);
}
