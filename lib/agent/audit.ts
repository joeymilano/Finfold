import type { AgentToolContext } from "@/lib/agent/types";

export type AgentAuditTarget = "guardrails" | "brand_brain";

type AgentAuditInput = {
  toolName: string;
  targetType: AgentAuditTarget;
  args: Record<string, unknown>;
  beforeState: unknown;
  afterState: unknown;
};

/**
 * Audit logging is best-effort during the migration rollout so an older
 * database does not apply the user mutation and then surface a false failure.
 * Once migration 029 is present, every successful mutating tool returns the
 * audit id used by the UI's guarded undo endpoint.
 */
export async function recordAgentMutation(ctx: AgentToolContext, input: AgentAuditInput): Promise<string | null> {
  const id = crypto.randomUUID();
  const { error } = await ctx.admin.from("agent_action_audit").insert({
    id,
    user_id: ctx.userId,
    session_id: ctx.sessionId ?? null,
    tool_name: input.toolName,
    target_type: input.targetType,
    action_args: input.args,
    before_state: input.beforeState,
    after_state: input.afterState,
    status: "applied"
  });

  if (error) {
    console.error("[agent/audit] failed to record mutation:", JSON.stringify(error));
    return null;
  }
  return id;
}

