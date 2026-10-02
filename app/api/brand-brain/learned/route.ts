import { NextResponse } from "next/server";
import { brandMemoryBulkRemovalSchema, removeLearnedBrandMemoryRules } from "@/lib/brand-memory-bulk";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

/** Removes only explicitly selected system-learned rules. The history trigger
 * records the resulting full snapshot; the event ledger remains immutable. */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const removal = brandMemoryBulkRemovalSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand Memory") }, { status: 503 });
    }

    const { data: existing, error: existingError } = await admin
      .from("brand_brains")
      .select(BRAND_BRAIN_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "Brand Memory has no learned rules yet." }, { status: 404 });

    const result = removeLearnedBrandMemoryRules(mapBrandBrainFromRow(existing), removal);
    if (result.removedCount === 0) {
      return NextResponse.json({ error: "Those learned rules have already changed. Refresh Brand Memory and try again." }, { status: 409 });
    }

    const { data, error } = await admin
      .from("brand_brains")
      .upsert(
        { user_id: userId, ...mapBrandBrainToRow(result.brain), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select(BRAND_BRAIN_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ brain: mapBrandBrainFromRow(data), removedCount: result.removedCount });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to manage learned Brand Memory rules." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update learned Brand Memory rules." },
      { status: 400 }
    );
  }
}