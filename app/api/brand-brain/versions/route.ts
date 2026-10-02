import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { mapBrandMemoryVersion } from "@/lib/brand-memory-versions";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ versions: [] });
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand Memory history") }, { status: 503 });
    }
    const { data, error } = await admin
      .from("brand_memory_versions")
      .select("id, snapshot, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return NextResponse.json({ versions: (data ?? []).map(mapBrandMemoryVersion) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view Brand Memory history." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Brand Memory history." },
      { status: 400 }
    );
  }
}