import type { AgentToolContext } from "@/lib/agent/types";

export type PendingToolMutation = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  expiresAt: string;
};

export async function createPendingToolMutation(
  ctx: AgentToolContext,
  toolName: string,
  args: Record<string, unknown>
): Promise<{
  confirmationRequired: true;
  pendingAction: PendingToolMutation;
  message: string;
}> {
  const fingerprint = `tool:${toolName}:${stableStringify(args)}`;
  const { data: existing } = await ctx.admin
    .from("agent_pending_actions")
    .select("id, payload, expires_at")
    .eq("user_id", ctx.userId)
    .eq("fingerprint", fingerprint)
    .eq("status", "pending")
    .maybeSingle();

  if (existing && new Date(String(existing.expires_at)).getTime() <= Date.now()) {
    await ctx.admin
      .from("agent_pending_actions")
      .update({ status: "expired" })
      .eq("id", existing.id)
      .eq("user_id", ctx.userId)
      .eq("status", "pending");
  }
  const activeExisting = existing && new Date(String(existing.expires_at)).getTime() > Date.now()
    ? existing
    : null;
  const row = activeExisting ?? (await ctx.admin
    .from("agent_pending_actions")
    .insert({
      id: crypto.randomUUID(),
      user_id: ctx.userId,
      session_id: ctx.sessionId ?? null,
      workflow_id: ctx.workflowId ?? null,
      action_kind: "tool_mutation",
      payload: { toolName, args },
      fingerprint
    })
    .select("id, payload, expires_at")
    .single()).data;

  if (!row) throw new Error("Unable to prepare this Agent change for confirmation.");
  const payload = asRecord(row.payload);
  return {
    confirmationRequired: true,
    pendingAction: {
      id: String(row.id),
      toolName: String(payload.toolName ?? toolName),
      args: asRecord(payload.args ?? args),
      expiresAt: String(row.expires_at)
    },
    message: "This change is ready. Confirm it in the Agent card before Finfold writes anything."
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
