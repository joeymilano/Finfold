import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { PlanId } from "@/lib/payment/types";

export type AgentModelTurnBilling = {
  /** Reserve the bounded cost of the next provider model call. */
  reserve: () => Promise<boolean>;
  /** Mark the pending reservation as a successful provider model result. */
  confirmSuccessfulTurn: () => Promise<void>;
  /** Release the reservation when the provider did not return a model result. */
  refundFailedTurn: () => Promise<void>;
  /** V2 concurrently-safe entry point: reserve one named step (root or
   * subagent) without disturbing any other in-flight reservation. Legacy
   * reserve/confirm/refund keep driving the sequential root loop. Optional so
   * existing billing stubs keep typechecking; delegation requires it and
   * silently falls back to the single-agent flow when absent. */
  open?: (stepKey: string) => Promise<AgentStepReservation | null>;
};

/**
 * One independently settled Credit reservation. Provider failover and retries
 * happen INSIDE a reservation, so a busy provider never double-charges. settle
 * and refund are idempotent at the ledger level; calling either twice is safe
 * but only the first call flips the in-memory state.
 */
export type AgentStepReservation = {
  /** Monotonic order of open() calls across the whole request. */
  sequence: number;
  /** Stable step identity, e.g. "root:1" or "subagent:{groupId}:{taskId}:1". */
  stepKey: string;
  /** Settle after a provider model result was received. */
  confirm: () => Promise<void>;
  /** Release after a known pre-result failure or cancellation. */
  refund: (reason: string) => Promise<void>;
};

/**
 * Concurrency-safe billing surface for parallel delegation. Returns null when
 * Credits are unavailable or the step key is already open/settled — callers
 * must treat null as "do not invoke the provider for this step".
 */
export type AgentBillingCoordinator = {
  open: (stepKey: string) => Promise<AgentStepReservation | null>;
};

export type AgentToolContext = {
  userId: string;
  sessionId?: string;
  workflowId?: string;
  dataImportIds?: string[];
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  plan: PlanId | "free";
  /** Thinking depth chosen for this request. Absent means `low` (legacy
   *  behavior) so stored-tool replays and internal callers stay unchanged. */
  depth?: import("@/lib/agent/depth").AgentDepth;
  agentToolsEnabled: boolean;
  /** Propagates a user's pause/stop action into model and tool execution. */
  signal?: AbortSignal;
  /** Optional route-owned billing lifecycle for each provider model turn. */
  modelTurnBilling?: AgentModelTurnBilling;
  /** Route-owned, request-scoped delegation state. The route creates one
   * mutable object per request; delegate_parallel marks it once a group has
   * run, which is how "one group per user request" and no-retry are enforced. */
  delegation?: {
    fingerprint?: string;
    groupId?: string;
    status?: "running" | "completed" | "partial" | "failed" | "cancelled";
  };
  /** Route hook forwarding subagent lifecycle events to SSE persistence. */
  onSubagentEvent?: (event: import("@/lib/agent/subagents").SubagentEvent) => void;
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
