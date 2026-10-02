import { NextResponse } from "next/server";
import { loadOwnedResearchMission } from "@/lib/operations/research-store";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json({ error: "Research mission not found." }, { status: 404 });
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Research Center") },
        { status: 503 }
      );
    }
    const mission = await loadOwnedResearchMission(admin, userId, id);
    if (!mission) {
      return NextResponse.json({ error: "Research mission not found." }, { status: 404 });
    }
    return NextResponse.json({ mission });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to use Research Center." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load research mission." },
      { status: 400 }
    );
  }
}
