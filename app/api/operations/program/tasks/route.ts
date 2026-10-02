import { NextResponse } from "next/server";
import { loadOperatingWeeklyQueue } from "@/lib/operations/weekly-tasks";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json({ queue: null, persisted: false });
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Operating weekly queue") },
        { status: 503 }
      );
    }

    const queue = await loadOperatingWeeklyQueue(admin, userId);
    return NextResponse.json({ queue, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load your operating queue." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load the operating queue." },
      { status: 400 }
    );
  }
}
