import type { ContentKit, KitOutput, MediaAsset, VisualAsset } from "@/lib/content-schema";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { canonicalContentTitle } from "@/lib/content-title";

export const KIT_SELECT_FIELDS =
  "id, growth_mission_id, xhs_workflow_id, xhs_artifact_version_ids, idea_text, goal, persona, platforms, media_assets, status, created_at, kit_outputs(id, platform, title, body, cta, notes, strategy, locked, publish_status, image_url, image_prompt, final_body, user_edited, published_url, published_at)";
export const LEGACY_KIT_SELECT_FIELDS =
  "id, growth_mission_id, idea_text, goal, persona, platforms, media_assets, status, created_at, kit_outputs(id, platform, title, body, cta, notes, strategy, locked, publish_status, image_url, image_prompt, final_body, user_edited, published_url, published_at)";

export type RawVisualAsset = {
  id?: string;
  asset_type?: string;
  position_index?: number;
  visual_role?: string;
  source_excerpt?: string;
  placement_hint?: string;
  prompt?: string;
  image_url?: string;
  alt_text?: string;
  metadata?: unknown;
  revision?: number;
  is_current?: boolean;
  created_at?: string;
  updated_at?: string;
  output_id?: string;
};

type RawOutput = KitOutput & {
  publish_status?: string;
  image_url?: string;
  image_prompt?: string;
  final_body?: string;
  user_edited?: boolean;
  published_url?: string;
  published_at?: string;
  visual_assets?: RawVisualAsset[];
};

type RawKitRow = {
  id: unknown;
  growth_mission_id?: unknown;
  xhs_workflow_id?: unknown;
  xhs_artifact_version_ids?: unknown;
  idea_text: unknown;
  goal: ContentKit["goal"];
  persona: ContentKit["persona"];
  platforms: ContentKit["platforms"];
  media_assets?: unknown;
  status?: ContentKit["status"];
  created_at: unknown;
  kit_outputs?: unknown;
};

export function mapContentKitRow(row: RawKitRow): ContentKit {
  return {
    id: String(row.id),
    growthMissionId: row.growth_mission_id ? String(row.growth_mission_id) : undefined,
    xhsWorkflowId: row.xhs_workflow_id ? String(row.xhs_workflow_id) : undefined,
    artifactVersionIds: Array.isArray(row.xhs_artifact_version_ids)
      ? row.xhs_artifact_version_ids.map(String)
      : undefined,
    ideaText: String(row.idea_text),
    goal: row.goal,
    persona: row.persona,
    platforms: row.platforms,
    mediaAssets: (row.media_assets ?? []) as MediaAsset[],
    outputs: ((row.kit_outputs ?? []) as RawOutput[]).map((output) => ({
      ...output,
      title: canonicalContentTitle(output.title),
      publishStatus: output.publishStatus ?? output.publish_status ?? "draft",
      locked: output.locked ?? false,
      imageUrl: output.imageUrl ?? output.image_url ?? "",
      imagePrompt: output.imagePrompt ?? output.image_prompt ?? "",
      finalBody: output.finalBody ?? output.final_body ?? undefined,
      userEdited: output.userEdited ?? output.user_edited ?? false,
      publishedUrl: output.publishedUrl ?? output.published_url ?? "",
      publishedAt: output.publishedAt ?? output.published_at ?? undefined,
      visualAssets: mapVisualAssets(output.visual_assets)
    })),
    status: row.status ?? "saved",
    createdAt: String(row.created_at)
  };
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function attachVisualAssets(admin: AdminClient, kits: ContentKit[]): Promise<ContentKit[]> {
  const outputIds = kits.flatMap((kit) => kit.outputs.map((output) => output.id).filter((id): id is string => Boolean(id)));
  if (outputIds.length === 0) return kits;
  const rowsByOutput = await loadVisualAssetRows(admin, outputIds);
  return kits.map((kit) => ({
    ...kit,
    outputs: kit.outputs.map((output) => ({
      ...output,
      visualAssets: output.id ? mapVisualAssets(rowsByOutput.get(output.id)) : []
    }))
  }));
}

export async function loadVisualAssetRows(admin: AdminClient, outputIds: string[]): Promise<Map<string, RawVisualAsset[]>> {
  const currentFields = "id, output_id, asset_type, position_index, visual_role, source_excerpt, placement_hint, prompt, image_url, alt_text, metadata, revision, is_current, created_at, updated_at";
  const legacyFields = "id, output_id, asset_type, position_index, visual_role, source_excerpt, placement_hint, prompt, image_url, alt_text, metadata, created_at, updated_at";
  const currentResult = await admin.from("visual_assets").select(currentFields).in("output_id", outputIds);
  let data: unknown[] | null = currentResult.data;
  let error = currentResult.error;
  if (error) {
    const legacyResult = await admin.from("visual_assets").select(legacyFields).in("output_id", outputIds);
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) return new Map();

  const grouped = new Map<string, RawVisualAsset[]>();
  for (const row of (data ?? []) as RawVisualAsset[]) {
    if (!row.output_id) continue;
    const items = grouped.get(row.output_id) ?? [];
    items.push(row);
    grouped.set(row.output_id, items);
  }
  return grouped;
}

export function mapVisualAssets(rows: RawVisualAsset[] | undefined): VisualAsset[] {
  return (rows ?? []).map((asset) => ({
    id: asset.id,
    assetType: "article_illustration" as const,
    positionIndex: asset.position_index ?? 0,
    role: (asset.visual_role ?? "concept") as VisualAsset["role"],
    sourceExcerpt: asset.source_excerpt ?? "",
    placementHint: asset.placement_hint ?? "",
    prompt: asset.prompt ?? "",
    imageUrl: asset.image_url ?? "",
    altText: asset.alt_text ?? "",
    metadata: asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Record<string, unknown> : {},
    revision: asset.revision ?? 1,
    isCurrent: asset.is_current ?? true,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at
  })).filter((asset) => Boolean(asset.imageUrl) && asset.isCurrent);
}
