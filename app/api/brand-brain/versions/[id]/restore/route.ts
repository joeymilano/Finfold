import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { parseBrandMemoryVersionSnapshot } from "@/lib/brand-memory-versions";

const idSchema = z.string().uuid();
const restoreSchema = z.object({
  expectedLatestVersionId: z.string().uuid().nullable().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const { expectedLatestVersionId } = restoreSchema.parse(await request.json().catch(() => ({})));
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Brand Memory history is temporarily unavailable." }, { status: 503 });

    if (expectedLatestVersionId) {
      const { data: latest, error: latestError } = await admin
        .from("brand_memory_versions")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latest?.id !== expectedLatestVersionId) {
        return NextResponse.json(
          { error: "Brand Memory changed after this history view was loaded. Refresh history before restoring." },
          { status: 409 }
        );
      }
    }

    const { data: version, error: versionError } = await admin
      .from("brand_memory_versions")
      .select("snapshot")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!version) return NextResponse.json({ error: "Memory version not found." }, { status: 404 });

    const brain = parseBrandMemoryVersionSnapshot(version.snapshot);
    const { data, error } = await admin
      .from("brand_brains")
      .upsert(
        { user_id: userId, ...mapBrandBrainToRow(brain), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ restored: true, brain: parseBrandMemoryVersionSnapshot(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to restore Brand Memory." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to restore this Brand Memory version." },
      { status: 400 }
    );
  }
}