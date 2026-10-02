
import { NextResponse } from "next/server";
import { brandBrainSchema, visualIdentitySchema } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { logMemoryEvent } from "@/lib/memory-events";

/** Fields a manual Brand Memory save can grow — logged as context_field
 * memory events (diff of new vs. existing entries) so the ledger reflects
 * hand-entered context alongside the system-learned rules. */
const DIFFABLE_LIST_FIELDS = ["toneKeywords", "bannedPhrases", "approvedExamples", "competitors"] as const;

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ brain: brandBrainSchema.parse({}), persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand Memory") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ brain: mapBrandBrainFromRow(data), persisted: Boolean(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load Brand Memory." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Brand Memory." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = brandBrainSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ brain: input, persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand Memory") }, { status: 503 });
    }

    // learnedStyle/learnedNegative are system-managed (distilled from
    // output_edits / underperforming posts — see lib/style-learning.ts and
    // lib/negative-learning.ts); performanceRules is written only via the
    // explicit "adopt" action (app/api/iterate/adopt/route.ts). None of the
    // three are edited by the user's own Brand Memory form. Preserve
    // whatever is already in the DB rather than letting a manual save from
    // a stale client payload silently wipe them out.
    const { data: existing } = await supabase
      .from("brand_brains")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const row = mapBrandBrainToRow(input);
    row.learned_style = existing?.learned_style ?? input.learnedStyle;
    row.learned_negative = existing?.learned_negative ?? input.learnedNegative;
    row.performance_rules = existing?.performance_rules ?? input.performanceRules;
    const existingVisualIdentity = visualIdentitySchema.parse(existing?.visual_identity ?? {});
    row.visual_identity = {
      ...input.visualIdentity,
      learnedPreferences: existingVisualIdentity.learnedPreferences
    };

    let { data, error } = await supabase
      .from("brand_brains")
      .upsert(
        {
          user_id: userId,
          ...row,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select(BRAND_BRAIN_COLUMNS)
      .maybeSingle();
    if (isMissingVisualIdentityColumn(error)) {
      const legacyRow: Record<string, unknown> = { user_id: userId, ...row, updated_at: new Date().toISOString() };
      delete legacyRow.visual_identity;
      const legacyResult = await supabase
        .from("brand_brains")
        .upsert(legacyRow, { onConflict: "user_id" })
        .select(BRAND_BRAIN_COLUMNS)
        .maybeSingle();
      data = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw error;

    await logNewContextFieldEntries(userId, existing, input);

    return NextResponse.json({ brain: mapBrandBrainFromRow(data), persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save Brand Memory." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save Brand Memory." },
      { status: 400 }
    );
  }
}

/**
 * Diffs the manually-editable list fields (tone keywords, banned phrases,
 * approved examples, competitors) against what was already saved, and logs
 * a context_field memory event for each newly-added entry. Best-effort —
 * failures are swallowed inside logMemoryEvent itself.
 */
async function logNewContextFieldEntries(
  userId: string,
  existing: Record<string, unknown> | null | undefined,
  input: ReturnType<typeof brandBrainSchema.parse>
): Promise<void> {
  const rowKeyByField: Record<(typeof DIFFABLE_LIST_FIELDS)[number], string> = {
    toneKeywords: "tone_keywords",
    bannedPhrases: "banned_phrases",
    approvedExamples: "approved_examples",
    competitors: "competitors"
  };

  const events: Array<Promise<void>> = [];
  for (const field of DIFFABLE_LIST_FIELDS) {
    const previous = new Set(
      Array.isArray(existing?.[rowKeyByField[field]])
        ? (existing[rowKeyByField[field]] as unknown[]).filter((v): v is string => typeof v === "string")
        : []
    );
    for (const value of input[field]) {
      if (!previous.has(value)) {
        events.push(logMemoryEvent(userId, "context_field", value));
      }
    }
  }
  await Promise.all(events);
}

function isMissingVisualIdentityColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (message.includes("visual_identity") && message.includes("column"));
}
