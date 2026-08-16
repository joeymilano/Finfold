
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getAgentTool } from "@/lib/agent/tools";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { getPlanFeatures } from "@/lib/payment/entitlements";

const idSchema = z.string().uuid();

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent confirmations require persistent storage." }, { status: 503 });
    }

    const { data: pending, error } = await admin
      .from("agent_pending_actions")
      .select("id, session_id, workflow_id, action_kind, payload, status, result, expires_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!pending) return NextResponse.json({ error: "Action not found." }, { status: 404 });
    if (pending.status === "executed") {
      return NextResponse.json({ executed: true, alreadyExecuted: true, result: pending.result });
    }
    if (pending.action_kind !== "tool_mutation") {
      return NextResponse.json({ error: "Use the Xiaohongshu confirmation endpoint for this action." }, { status: 400 });
    }
    if (pending.status !== "pending") {
      return NextResponse.json({ error: "This action is already being processed." }, { status: 409 });
    }
    if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
      await admin.from("agent_pending_actions").update({ status: "expired" }).eq("id", id).eq("user_id", userId);
      return NextResponse.json({ error: "This confirmation expired. Ask the Agent to prepare it again." }, { status: 410 });
    }

    const { data: claimed, error: claimError } = await admin
      .from("agent_pending_actions")
      .update({ status: "executing" })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: "This action is already being processed." }, { status: 409 });

    const payload = asRecord(pending.payload);
    const toolName = String(payload.toolName ?? "");
    const tool = getAgentTool(toolName);
    if (!tool || !tool.mutates) {
      await admin.from("agent_pending_actions").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId);
      return NextResponse.json({ error: "The requested Agent change is no longer available." }, { status: 400 });
    }

    try {
      const plan = await resolveAgentPlan(admin, userId);
      const result = await tool.execute(asRecord(payload.args), {
        userId,
        sessionId: pending.session_id ?? undefined,
        workflowId: pending.workflow_id ?? undefined,
        admin,
        plan,
        agentToolsEnabled: getPlanFeatures(plan).agentTools
      });
      if (result && typeof result === "object" && "upgradeRequired" in result) {
        await admin.from("agent_pending_actions").update({ status: "cancelled", result }).eq("id", id).eq("user_id", userId);
        return NextResponse.json({ error: "This action requires an upgraded plan.", result }, { status: 403 });
      }
      const { error: finishError } = await admin
        .from("agent_pending_actions")
        .update({ status: "executed", result, executed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "executing");
      if (finishError) throw finishError;
      return NextResponse.json({ executed: true, alreadyExecuted: false, result });
    } catch (caught) {
      await admin
        .from("agent_pending_actions")
        .update({ status: "pending" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "executing");
      throw caught;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to confirm this Agent action." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to confirm this Agent action." },
      { status: 400 }
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
