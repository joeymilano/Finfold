import { sendRawPrompt } from "@/lib/llm";

const MAX_NEGATIVE_RULES = 5;

function buildNegativeDistillationPrompt(
  underperformers: Array<{ title: string; body: string }>,
  topPerformers: Array<{ title: string; body: string }>
): string {
  return `A creator's posts on the same platform got very different engagement. Compare the UNDERPERFORMING posts against the TOP-PERFORMING posts and decide whether there's a GENERALIZABLE, REUSABLE pattern in what made the underperformers weaker — not a one-off fact or topic difference.

Examples of generalizable anti-patterns: "opens with a generic greeting instead of a hook", "buries the ask in the last paragraph", "uses corporate tone instead of first person", "no specific number or result mentioned".

Examples that are NOT generalizable (return empty): a difference that's just about topic/subject matter, timing, or luck rather than the writing itself.

If generalizable, return a single, short, actionable rule (<=25 words) written as an instruction to AVOID that pattern in future generations, e.g. "Avoid opening with a generic greeting — start with a specific hook or result instead." If NOT generalizable, return exactly: NONE

=== UNDERPERFORMING POSTS ===
${underperformers.map((p, i) => `[${i + 1}] ${p.title}\n${p.body}`).join("\n\n")}

=== TOP-PERFORMING POSTS (for contrast) ===
${topPerformers.map((p, i) => `[${i + 1}] ${p.title}\n${p.body}`).join("\n\n")}

Return ONLY the rule text or the word NONE. No explanation, no markdown.`;
}

/**
 * Distills a set of underperforming posts (contrasted against the same
 * user's top performers on the same platform) into a persistent
 * "avoid this" rule, if the gap reveals a generalizable pattern. Returns
 * null when it doesn't — most comparisons should return null, which is
 * fine; this only needs to catch the ones that DO generalize.
 *
 * Failure is non-fatal by design, same as lib/style-learning.ts
 * distillStyleRule — callers run this as a best-effort background pass,
 * never blocking on it.
 */
export async function distillNegativeRule(
  underperformers: Array<{ title: string; body: string }>,
  topPerformers: Array<{ title: string; body: string }>
): Promise<string | null> {
  if (underperformers.length === 0 || topPerformers.length === 0) {
    return null;
  }

  try {
    const raw = (await sendRawPrompt(buildNegativeDistillationPrompt(underperformers, topPerformers))).trim();
    if (!raw || raw.toUpperCase() === "NONE") {
      return null;
    }
    return raw.slice(0, 200);
  } catch (error) {
    console.error("[negative-learning] distillation failed:", error);
    return null;
  }
}

/**
 * Merges a newly distilled negative rule into the existing list: dedupes
 * near-identical rules (case-insensitive exact match, same rationale as
 * mergeLearnedStyle), then caps at MAX_NEGATIVE_RULES by dropping the
 * oldest entries so the prompt injection this feeds
 * (lib/brand-brain.ts buildBrainPromptSection) stays small and high-signal.
 */
export function mergeNegativeRules(existing: string[], newRule: string): string[] {
  const withoutDuplicate = existing.filter((rule) => rule.toLowerCase() !== newRule.toLowerCase());
  const merged = [...withoutDuplicate, newRule];
  return merged.slice(-MAX_NEGATIVE_RULES);
}
