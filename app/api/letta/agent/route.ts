export const runtime = "edge";

import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabaseConfig,
} from "@/lib/supabase";
import {
  createLettaAgent,
  getLettaAgent,
  isLettaConfigured,
} from "@/lib/letta";

/**
 * GET /api/letta/agent
 *
 * Get or create the Letta agent for the current user.
 * Each user has exactly one Letta agent (1:1 mapping).
 *
 * The mapping is stored in two places:
 *  1. The `user_agents` table (if it exists) — preferred
 *  2. `user_metadata.letta_agent_id` — fallback
 *
 * If no agent exists, one is created automatically.
 */
export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  if (!isLettaConfigured()) {
    return NextResponse.json(
      { error: "Letta AI is not configured. Set LETTA_API_KEY." },
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

  // Verify the user is authenticated
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json(
      { error: "You must be logged in to use the AI assistant." },
      { status: 401 }
    );
  }

  // Step 1: Try to find existing agent mapping
  let agentId: string | null = null;

  // Try user_agents table first
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data: mapping } = await admin
      .from("user_agents")
      .select("letta_agent_id, letta_agent_name")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (mapping) {
      agentId = mapping.letta_agent_id;
    }
  }

  // Fallback to user_metadata
  if (!agentId) {
    const meta = authUser.user_metadata ?? {};
    agentId = meta.letta_agent_id ?? null;
  }

  // Step 2: If agent exists, verify it's still valid on Letta
  if (agentId) {
    try {
      const agent = await getLettaAgent(agentId);
      return NextResponse.json({
        agent: {
          id: agent.id,
          name: agent.name,
          createdAt: agent.created_at,
        },
      });
    } catch {
      // Agent was deleted on Letta side — clean up and recreate
      agentId = null;

      // Clean up stale mapping
      if (admin) {
        await admin
          .from("user_agents")
          .delete()
          .eq("user_id", authUser.id);
      }

      // Clean up stale metadata
      await supabase.auth.updateUser({
        data: { letta_agent_id: null },
      });
    }
  }

  // Step 3: Create a new agent
  try {
    const newAgent = await createLettaAgent(authUser.id, authUser.email ?? "");

    // Store the mapping in user_agents table
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

    // Also store in user_metadata as fallback
    await supabase.auth.updateUser({
      data: { letta_agent_id: newAgent.id },
    });

    return NextResponse.json({
      agent: {
        id: newAgent.id,
        name: newAgent.name,
        createdAt: newAgent.created_at,
      },
    });
  } catch (e) {
    const message = (e as Error).message || "Failed to create AI agent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/letta/agent
 *
 * Delete the current user's Letta agent and mapping.
 * A new agent will be created automatically on the next request.
 */
export async function DELETE() {
  if (!hasSupabaseConfig() || !isLettaConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not available." }, { status: 503 });
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Find the agent ID
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

  if (!agentId) {
    return NextResponse.json({ error: "No agent found." }, { status: 404 });
  }

  // Delete from Letta
  try {
    const { deleteLettaAgent } = await import("@/lib/letta");
    await deleteLettaAgent(agentId);
  } catch {
    // Agent may already be deleted — continue cleanup
  }

  // Clean up mapping
  if (admin) {
    await admin.from("user_agents").delete().eq("user_id", authUser.id);
  }

  await supabase.auth.updateUser({
    data: { letta_agent_id: null },
  });

  return NextResponse.json({ ok: true });
}
