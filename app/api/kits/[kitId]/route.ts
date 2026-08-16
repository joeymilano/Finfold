
import { NextResponse } from "next/server";
import type { MediaAsset } from "@/lib/content-schema";
import { collectOwnedMediaStoragePaths } from "@/lib/kit-deletion";
import { attachVisualAssets, KIT_SELECT_FIELDS, LEGACY_KIT_SELECT_FIELDS, mapContentKitRow } from "@/lib/kit-record";
import { deleteMockKit, listMockKits } from "@/lib/mock-store";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kitId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId } = await params;
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      if (isLocalMockMode()) {
        const kit = listMockKits().find((item) => item.id === kitId);
        return kit
          ? NextResponse.json({ kit })
          : NextResponse.json({ error: "Content kit not found." }, { status: 404 });
      }
      return NextResponse.json({ error: persistenceUnavailableMessage("Content kit") }, { status: 503 });
    }

    let result = await supabase
      .from("content_kits")
      .select(KIT_SELECT_FIELDS)
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error && /xhs_workflow_id|xhs_artifact_version_ids|schema cache/i.test(result.error.message ?? "")) {
      result = await supabase
        .from("content_kits")
        .select(LEGACY_KIT_SELECT_FIELDS)
        .eq("id", kitId)
        .eq("user_id", userId)
        .maybeSingle();
    }
    const { data: kit, error } = result;

    if (error) {
      console.error("[api/kits/:kitId] Supabase query failed:", JSON.stringify(error));
      throw new Error("Failed to load content kit.");
    }

    if (!kit) {
      return NextResponse.json({ error: "Content kit not found." }, { status: 404 });
    }

    const [hydrated] = await attachVisualAssets(supabase, [mapContentKitRow(kit)]);
    return NextResponse.json({ kit: hydrated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view this content kit." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load content kit." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kitId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId } = await params;
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      if (isLocalMockMode()) {
        // Idempotent: an already-absent kit is in the desired end-state.
        deleteMockKit(kitId);
        return NextResponse.json({ deleted: true, kitId });
      }
      return NextResponse.json({ error: persistenceUnavailableMessage("Content kit") }, { status: 503 });
    }

    // Read only the current user's row before deletion. Besides proving
    // ownership, this captures uploaded media paths for best-effort cleanup.
    const { data: kit, error: kitError } = await supabase
      .from("content_kits")
      .select("id, media_assets")
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();

    if (kitError) {
      console.error("[api/kits/:kitId] Delete lookup failed:", JSON.stringify(kitError));
      throw new Error("Failed to delete content kit.");
    }
    // Idempotent delete: a kit that no longer exists is already in the desired
    // end-state. Returning success (instead of 404) keeps concurrent/repeated
    // DELETEs from surfacing as failures — the root cause of the
    // "部分内容删除失败，已恢复" toast storm on the content library.
    if (!kit) {
      return NextResponse.json({ deleted: true, kitId });
    }

    const [{ data: outputs, error: outputsError }, { data: visualAssets, error: visualAssetsError }] = await Promise.all([
      supabase.from("kit_outputs").select("image_url").eq("kit_id", kitId).eq("user_id", userId),
      supabase.from("visual_assets").select("image_url").eq("kit_id", kitId).eq("user_id", userId)
    ]);

    if (outputsError || visualAssetsError) {
      console.error(
        "[api/kits/:kitId] Media cleanup lookup failed:",
        JSON.stringify(outputsError ?? visualAssetsError)
      );
      throw new Error("Failed to delete content kit.");
    }

    const mediaAssets = Array.isArray(kit.media_assets) ? kit.media_assets as MediaAsset[] : [];
    const storagePaths = collectOwnedMediaStoragePaths([
      ...mediaAssets.map((asset) => asset.url),
      ...(outputs ?? []).map((output) => output.image_url ?? undefined),
      ...(visualAssets ?? []).map((asset) => asset.image_url ?? undefined)
    ], userId);

    // All dependent database records use ON DELETE CASCADE. Keep the user-id
    // filter on the destructive query even with the admin client.
    const { data: deleted, error: deleteError } = await supabase
      .from("content_kits")
      .delete()
      .eq("id", kitId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      console.error("[api/kits/:kitId] Delete failed:", JSON.stringify(deleteError));
      throw new Error("Failed to delete content kit.");
    }
    // Lost a race with another concurrent DELETE: the row vanished between our
    // ownership lookup and the destructive query. Treat as success (idempotent).
    if (!deleted) {
      return NextResponse.json({ deleted: true, kitId });
    }

    // The database is the source of truth, so storage cleanup happens after a
    // successful delete. A storage outage must not resurrect a deleted kit.
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from("media").remove(storagePaths);
      if (storageError) {
        console.error("[api/kits/:kitId] Storage cleanup failed:", JSON.stringify(storageError));
      }
    }

    return NextResponse.json({ deleted: true, kitId });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to delete this content kit." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete content kit." },
      { status: 400 }
    );
  }
}
