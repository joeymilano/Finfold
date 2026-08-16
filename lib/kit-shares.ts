import { createSupabaseAdminClient } from "@/lib/supabase";
import type { KitOutput } from "@/lib/content-schema";
import { loadVisualAssetRows, mapVisualAssets } from "@/lib/kit-record";
import { canonicalContentTitle } from "@/lib/content-title";

export type PublicSharedKit = {
  slug: string;
  ideaText: string;
  goal: string;
  createdAt: string;
  outputs: KitOutput[];
};

/**
 * Server-side lookup for /share/[slug] — resolves a public share slug to
 * its kit's outputs via the service-role client, so anonymous visitors
 * never get a Postgres session that could enumerate other rows (see
 * migration 018's RLS comment). Returns null for a missing or disabled
 * (is_public = false) share.
 */
export async function getPublicSharedKit(slug: string): Promise<PublicSharedKit | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data: share, error: shareError } = await supabase
    .from("kit_shares")
    .select("kit_id, is_public")
    .eq("slug", slug)
    .maybeSingle();
  if (shareError || !share || !share.is_public) {
    return null;
  }

  const { data: kit, error: kitError } = await supabase
    .from("content_kits")
    .select(
      "id, idea_text, goal, created_at, kit_outputs(id, platform, title, body, cta, notes, strategy, image_url, final_body)"
    )
    .eq("id", share.kit_id)
    .maybeSingle();
  if (kitError || !kit) {
    return null;
  }

  type RawOutput = { id: string; platform: string; title: string; body: string; cta: string; notes: string; strategy: string; image_url: string | null; final_body: string | null };

  const rawOutputs = (kit.kit_outputs ?? []) as RawOutput[];
  const visualAssetsByOutput = await loadVisualAssetRows(supabase, rawOutputs.map((output) => output.id));

  const outputs: KitOutput[] = rawOutputs.map((output) => ({
    id: output.id,
    platform: output.platform as KitOutput["platform"],
    title: canonicalContentTitle(output.title),
    body: output.final_body ?? output.body,
    cta: output.cta,
    notes: output.notes,
    strategy: output.strategy,
    locked: false,
    publishStatus: "draft",
    imageUrl: output.image_url ?? "",
    userEdited: Boolean(output.final_body),
    visualAssets: mapVisualAssets(visualAssetsByOutput.get(output.id))
  }));

  // Awaited (not fire-and-forget) — on edge runtime an un-awaited promise
  // can be cancelled once the response streams back, silently dropping
  // the view-count increment most of the time.
  const { error: viewError } = await supabase.rpc("increment_kit_share_view", { p_slug: slug });
  if (viewError) {
    console.error("[kit-shares] increment_kit_share_view failed:", JSON.stringify(viewError));
  }

  return {
    slug,
    ideaText: String(kit.idea_text),
    goal: String(kit.goal),
    createdAt: String(kit.created_at),
    outputs
  };
}
