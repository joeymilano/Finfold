export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabaseConfig,
} from "@/lib/supabase";
import {
  sendLettaMessage,
  streamLettaMessage,
  getLettaAgent,
  createLettaAgent,
  isLettaConfigured,
} from "@/lib/letta";

/**
 * POST /api/letta/chat
 *
 * Send a message to the user's Letta agent and return the response.
 *
 * Expected body: { message: string }
 *
 * Supports two modes:
 *  - Normal: returns the full response as JSON
 *  - Streaming: set `Accept: text/event-stream` to get SSE
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  if (!isLettaConfigured()) {
    return NextResponse.json(
      { error: "Letta AI is not configured." },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json(
      { error: "You must be logged in to chat with AI." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
  };

  const userMessage = body.message?.trim();
  if (!userMessage) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 }
    );
  }

  // Resolve the user's agent ID
  let agentId: string | null = null;
  const admin = createSupabaseAdminClient();

  if (admin) {
    const { data: mapping } = await admin
      .from("user_agents")
      .select("letta_agent_id")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (mapping) agentId = mapping.letta_agent_id;
  }

  if (!agentId) {
    const meta = authUser.user_metadata ?? {};
    agentId = meta.letta_agent_id ?? null;
  }

  // If no agent, create one on the fly
  if (!agentId) {
    try {
      const newAgent = await createLettaAgent(authUser.id, authUser.email ?? "");

      if (admin) {
        await admin.from("user_agents").upsert(
          {
            user_id: authUser.id,
            letta_agent_id: newAgent.id,
            letta_agent_name: newAgent.name,
          },
          { onConflict: "user_id" }
        );
      }

      await supabase.auth.updateUser({
        data: { letta_agent_id: newAgent.id },
      });

      agentId = newAgent.id;
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to create AI agent: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  // Verify the agent still exists
  try {
    await getLettaAgent(agentId);
  } catch {
    // Agent was deleted — recreate
    try {
      const newAgent = await createLettaAgent(authUser.id, authUser.email ?? "");

      if (admin) {
        await admin.from("user_agents").upsert(
          {
            user_id: authUser.id,
            letta_agent_id: newAgent.id,
            letta_agent_name: newAgent.name,
          },
          { onConflict: "user_id" }
        );
      }

      await supabase.auth.updateUser({
        data: { letta_agent_id: newAgent.id },
      });

      agentId = newAgent.id;
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to recreate AI agent: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  // Check if the client wants streaming
  const accept = request.headers.get("accept") ?? "";
  const wantsStream = accept.includes("text/event-stream");

  if (wantsStream) {
    // ── Streaming response ──────────────────────────────────────
    try {
      const stream = await streamLettaMessage(agentId, userMessage);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Stream failed: ${(e as Error).message}` },
        { status: 500 }
      );
    }
  }

  // ── Normal (non-streaming) response ───────────────────────────
  try {
    const result = await sendLettaMessage(agentId, userMessage);

    return NextResponse.json({
      reply: result.assistantMessage,
      messages: result.allMessages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        date: m.date,
      })),
    });
  } catch (e) {
    const message = (e as Error).message || "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
