import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { PlanId } from "@/lib/payment/types";

export type AgentModelTurnBilling = {
  /** Reserve the bounded cost of the next provider model call. */
  reserve: () => Promise<boolean>;
  /** Mark the pending reservation as a successful provider model result. */
  confirmSuccessfulTurn: () => Promise<void>;
  /** Release the reservation when the provider did not return a model result. */
  refundFailedTurn: () => Promise<void>;
};

export type AgentToolContext = {
  userId: string;
  sessionId?: string;
  workflowId?: string;
  dataImportIds?: string[];
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  plan: PlanId | "free";
  agentToolsEnabled: boolean;
  /** Propagates a user's pause/stop action into model and tool execution. */
  signal?: AbortSignal;
  /** Optional route-owned billing lifecycle for each provider model turn. */
  modelTurnBilling?: AgentModelTurnBilling;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  /** False keeps a tool executable for stored pending actions and old chat
   * history while removing it from new model tool selection. */
  exposedToModel?: boolean;
  /** JSON Schema for the tool's arguments, sent verbatim as the OpenAI
   * `function.parameters` field. */
  parameters: Record<string, unknown>;
  /** True for tools that write data (guardrails, brand brain, packs) — used
   * by the system prompt playbook to decide when to summarize a change back
   * to the user instead of just answering. Read-only tools never mutate. */
  mutates: boolean;
  /** Gated behind PLAN_FEATURES.agentTools when true. Read-only lookups
   * (get_guardrails, list_industry_packs, get_recent_kits) stay ungated so a
   * free user's agent can still explain the current state. */
  requiresAgentTools: boolean;
  execute: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<unknown>;
};
