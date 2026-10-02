
import { NextResponse } from "next/server";
import { listMockKits } from "@/lib/mock-store";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { attachVisualAssets, KIT_SELECT_FIELDS, LEGACY_KIT_SELECT_FIELDS, mapContentKitRow } from "@/lib/kit-record";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ kits: listMockKits() });
      return NextResponse.json({ error: persistenceUnavailableMessage("Content history") }, { status: 503 });
    }

    const currentResult = await supabase
      .from("content_kits")
      .select(KIT_SELECT_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    let kits = currentResult.data as unknown[] | null;
    let error = currentResult.error;
    if (error && /xhs_workflow_id|xhs_artifact_version_ids|schema cache/i.test(error.message ?? "")) {
      const legacyResult = await supabase
        .from("content_kits")
        .select(LEGACY_KIT_SELECT_FIELDS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      kits = legacyResult.data as unknown[] | null;
      error = legacyResult.error;
    }

    if (error) {
      // Supabase errors are plain objects (not Error instances), so log the
      // full detail here — otherwise the generic catch below swallows it.
      console.error("[api/kits] Supabase query failed:", JSON.stringify(error));
      throw new Error(`kits query failed: ${error.message ?? error.code ?? "unknown"}`);
    }

    const mapped = await attachVisualAssets(
      supabase,
      kits?.map((kit) => mapContentKitRow(kit as Parameters<typeof mapContentKitRow>[0])) ?? []
    );

    return NextResponse.json({ kits: mapped });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view content kits." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load kits." },
      { status: 400 }
    );
  }
}
