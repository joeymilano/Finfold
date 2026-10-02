/**
 * Shared fan-out helper for Jev item-list reviews.
 *
 * Wraps the "speculative fan-out" pattern for the common shape
 * "a list of homogeneous items × a fixed question set per item": chunks the
 * items (state + questions share the 64k token budget), asks each chunk in
 * one call with chunk-local positions, and maps answers back to global item
 * indexes so callers never see the chunking.
 *
 * Question instructions may contain the token "{i}"; it is replaced with the
 * item's global index before the call — question IDs never reach the model,
 * so the instruction text is the only item linkage and must stay numbered.
 *
 * Throws on any failure (disabled, outage, parse) — fail semantics belong to
 * the caller: fail-closed gates persist an unavailable record, fail-open
 * optimizers skip the step entirely.
 */
import { askJev, type JevQuestion, type JevQuestions } from "@/lib/jev";

/** Conservative per-call item ceiling under the 64k token state budget. */
export const JEV_REVIEW_MAX_ITEMS_PER_CALL = 40;

export function indexedQuestion(question: JevQuestion, index: number): JevQuestion {
  return { ...question, instructions: question.instructions.replaceAll("{i}", String(index)) };
}

export async function runJevItemReviewBatch(input: {
  items: Array<Record<string, unknown>>;
  /** stem → question; actual question keys become `${stem}_${globalIndex}`. */
  questions: Record<string, JevQuestion>;
  /** State key for the item list; defaults to "items" (X passes "drafts"). */
  itemsKey?: string;
  brandContext?: string | null;
  note?: string | null;
  operation: string;
  userId?: string;
}): Promise<{ model: string; answers: Record<string, unknown> }> {
  const itemsKey = input.itemsKey ?? "items";
  const stems = Object.keys(input.questions);
  const answers: Record<string, unknown> = {};
  let model = "unknown";
  for (let offset = 0; offset < input.items.length; offset += JEV_REVIEW_MAX_ITEMS_PER_CALL) {
    const chunk = input.items.slice(offset, offset + JEV_REVIEW_MAX_ITEMS_PER_CALL);
    const questions: JevQuestions = {};
    for (let local = 0; local < chunk.length; local += 1) {
      for (const stem of stems) {
        questions[`${stem}_${offset + local}`] = indexedQuestion(input.questions[stem], offset + local);
      }
    }
    // Key order mirrors the pre-helper X layout: brand_context, note, items.
    const state: Record<string, unknown> = {};
    if (input.brandContext != null) state.brand_context = input.brandContext;
    if (input.note) state.note = input.note;
    state[itemsKey] = chunk.map((item, local) => ({ ...item, index: offset + local }));
    // Any chunk failure fails the whole batch; the caller decides fail semantics.
    const result = await askJev(state, questions, { operation: input.operation, userId: input.userId });
    model = result.model;
    for (const [key, answer] of Object.entries(result.answers as Record<string, unknown>)) {
      answers[key] = answer;
    }
  }
  return { model, answers };
}
