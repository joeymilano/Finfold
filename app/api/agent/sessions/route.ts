
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ sessions: [] });
      return NextResponse.json({ error: persistenceUnavailableMessage("Agent session history") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("agent_sessions")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    return NextResponse.json({ sessions: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load agent sessions." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load sessions." }, { status: 400 });
  }
}

export async function POST() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Agent sessions") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("agent_sessions")
      .insert({ user_id: userId, title: "新对话" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ session: data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to create an agent session." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create session." }, { status: 400 });
  }
}
