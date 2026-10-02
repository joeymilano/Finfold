
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import type { AgentAttachment } from "@/lib/agent/attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ messages: [] });
      return NextResponse.json({ error: persistenceUnavailableMessage("Agent session history") }, { status: 503 });
    }

    const { data: session } = await supabase.from("agent_sessions").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("agent_messages")
      .select("id, role, content, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const messages = await Promise.all((data ?? []).map(async (message) => {
      const content = message.content && typeof message.content === "object" && !Array.isArray(message.content)
        ? message.content as { attachments?: AgentAttachment[] }
        : null;
      if (!content?.attachments?.length) return message;

      const attachments = await Promise.all(content.attachments.map(async (attachment) => {
        if (!attachment.storagePath.startsWith(`${userId}/`)) return attachment;
        const { data: signed } = await supabase.storage
          .from("agent-attachments")
          .createSignedUrl(attachment.storagePath, 60 * 60);
        return signed?.signedUrl ? { ...attachment, url: signed.signedUrl } : attachment;
      }));
      return { ...message, content: { ...content, attachments } };
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load this session." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load session." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Agent sessions") }, { status: 503 });
    }

    const { error } = await supabase.from("agent_sessions").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to delete this session." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete session." }, { status: 400 });
  }
}
