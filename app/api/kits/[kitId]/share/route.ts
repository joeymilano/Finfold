
import { NextResponse } from "next/server";
import { generateShareSlug } from "@/lib/slug";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

/**
 * Creates (or re-enables) a public share link for a kit the caller owns.
 * Returns the existing slug if one already exists rather than minting a
 * new one every time — a kit has at most one share slug for its lifetime
 * (migration 018's unique(kit_id)), so re-sharing doesn't fragment view
 * counts across multiple links.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kitId: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { kitId } = await params;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Sharing is not available in this environment." }, { status: 503 });
    }

    const { data: kit, error: kitError } = await supabase
      .from("content_kits")
      .select("id")
      .eq("id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (kitError) throw kitError;
    if (!kit) {
      return NextResponse.json({ error: "Kit not found." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("kit_shares")
      .select("slug, is_public, view_count")
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      if (!existing.is_public) {
        const { error: reenableError } = await supabase
          .from("kit_shares")
          .update({ is_public: true, updated_at: new Date().toISOString() })
          .eq("kit_id", kitId)
          .eq("user_id", userId);
        if (reenableError) throw reenableError;
      }
      return NextResponse.json({ slug: existing.slug, viewCount: existing.view_count });
    }

    // Retry on the rare slug collision — generateShareSlug is short enough
    // that collisions, while unlikely, aren't impossible at scale.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = generateShareSlug();
      const { error: insertError } = await supabase
        .from("kit_shares")
        .insert({ kit_id: kitId, user_id: userId, slug });

      if (!insertError) {
        return NextResponse.json({ slug, viewCount: 0 });
      }
      if (insertError.code !== "23505") {
        throw insertError;
      }
    }

    throw new Error("Failed to generate a unique share link. Please try again.");
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to share content." }, { status: 401 });
    }

    console.error("[kits/share] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create share link." },
      { status: 400 }
    );
  }
}

/** Disables a kit's share link without deleting it (slug + view_count survive a future re-share). */
export async function DELETE(request: Request, { params }: { params: Promise<{ kitId: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { kitId } = await params;

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Sharing is not available in this environment." }, { status: 503 });
    }

    const { error } = await supabase
      .from("kit_shares")
      .update({ is_public: false, updated_at: new Date().toISOString() })
      .eq("kit_id", kitId)
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disable share link." },
      { status: 400 }
    );
  }
}
