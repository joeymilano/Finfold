export const runtime = "edge";

import { NextResponse } from "next/server";
import type { ContentKit, KitOutput, MediaAsset } from "@/lib/content-schema";
import { contentKitSchema } from "@/lib/content-schema";
import { listMockKits, saveMockKit } from "@/lib/mock-store";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      return NextResponse.json({ kits: listMockKits() });
    }

    const { data: kits, error } = await supabase
      .from("content_kits")
      .select("id, idea_text, goal, persona, platforms, media_assets, status, created_at, kit_outputs(platform, title, body, cta, notes, strategy, locked, publish_status)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      // Supabase errors are plain objects (not Error instances), so log the
      // full detail here — otherwise the generic catch below swallows it.
      console.error("[api/kits] Supabase query failed:", JSON.stringify(error));
      throw new Error(`kits query failed: ${error.message ?? error.code ?? "unknown"}`);
    }

    const mapped: ContentKit[] =
      kits?.map((kit) => ({
        id: String(kit.id),
        ideaText: String(kit.idea_text),
        goal: kit.goal,
        persona: kit.persona,
        platforms: kit.platforms,
        mediaAssets: (kit.media_assets ?? []) as MediaAsset[],
        outputs: ((kit.kit_outputs ?? []) as Array<KitOutput & { publish_status?: string }>).map((output) => ({ ...output, publishStatus: output.publishStatus ?? output.publish_status ?? "draft", locked: output.locked ?? false })),
        status: kit.status ?? "saved",
        createdAt: String(kit.created_at)
      })) ?? [];

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

export async function POST(request: Request) {
  try {
    await getCurrentUserId();
    const body = await request.json();
    const kit = contentKitSchema.parse(body);
    saveMockKit(kit);

    return NextResponse.json({ kit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save kit." },
      { status: 400 }
    );
  }
}
