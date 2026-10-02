import { z } from "zod";
import {
  AGENT_CHAT_OUTCOMES,
  isAgentChatOutcome,
  type AgentChatOutcome
} from "@/lib/agent/chat-outcome";
import {
  AGENT_STATUS_STAGES,
  isAgentStatusStage,
  type AgentStatusEvent,
  type AgentStatusStage
} from "@/lib/agent/status";

// V2 adds an optional `collaboration` block recording the subagent groups that
// ran during the request. V1 rows keep parsing unchanged; a V2 row without
// collaboration is a plain single-agent run. No new table — this still lives
// inside agent_messages.content.work JSONB.
//
// V3 adds an optional `usage` summary (net credits, steps, refunds, balance
// snapshot) so a restored session can show the per-run credits hint again.

const subagentTaskRecordSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.string().min(1).max(40),
  label: z.string().min(1).max(24),
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  durationMs: z.number().int().nonnegative().max(30 * 60 * 1_000).optional(),
  evidenceCount: z.number().int().nonnegative().max(64).optional(),
  summary: z.string().max(500).optional()
});

const collaborationGroupRecordSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.enum(["running", "completed", "partial", "failed", "cancelled"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().max(30 * 60 * 1_000).optional(),
  tasks: z.array(subagentTaskRecordSchema).min(1).max(3)
});

const agentWorkRecordBase = {
  stages: z.array(z.enum(AGENT_STATUS_STAGES)).max(AGENT_STATUS_STAGES.length),
  outcome: z.enum(AGENT_CHAT_OUTCOMES),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative().max(30 * 60 * 1_000)
};

const agentWorkRecordV1Schema = z.object({
  version: z.literal(1),
  ...agentWorkRecordBase
});

const collaborationBlockSchema = z
  .object({ groups: z.array(collaborationGroupRecordSchema).min(1).max(4) })
  .optional();

const agentWorkRecordV2Schema = z.object({
  version: z.literal(2),
  ...agentWorkRecordBase,
  collaboration: collaborationBlockSchema
});

const agentUsageRecordSchema = z.object({
  /** Net credits charged for the run (refunds already subtracted). */
  credits: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  refunded: z.number().nonnegative(),
  /** Balance snapshot after the run; -1 when unknown at persistence time. */
  available: z.number().int()
});

const agentWorkRecordV3Schema = z.object({
  version: z.literal(3),
  ...agentWorkRecordBase,
  collaboration: collaborationBlockSchema,
  usage: agentUsageRecordSchema.optional()
});

const agentWorkRecordSchema = z.discriminatedUnion("version", [
  agentWorkRecordV1Schema,
  agentWorkRecordV2Schema,
  agentWorkRecordV3Schema
]);

export type AgentWorkRecordV1 = z.infer<typeof agentWorkRecordV1Schema>;
export type AgentWorkRecordV2 = z.infer<typeof agentWorkRecordV2Schema>;
export type AgentWorkRecordV3 = z.infer<typeof agentWorkRecordV3Schema>;
export type AgentWorkRecord = AgentWorkRecordV1 | AgentWorkRecordV2 | AgentWorkRecordV3;
export type AgentUsageRecord = z.infer<typeof agentUsageRecordSchema>;

export type SubagentTaskRecord = z.infer<typeof subagentTaskRecordSchema>;
export type CollaborationGroupRecord = z.infer<typeof collaborationGroupRecordSchema>;

export function createAgentWorkRecord(input: {
  stages: AgentStatusStage[];
  outcome: AgentChatOutcome;
  startedAtMs: number;
  completedAtMs?: number;
  collaboration?: { groups: CollaborationGroupRecord[] };
  usage?: AgentUsageRecord;
}): AgentWorkRecord {
  const completedAtMs = input.completedAtMs ?? Date.now();
  // V3 is written from now on; parseAgentWorkRecord keeps V1/V2 rows readable.
  return agentWorkRecordV3Schema.parse({
    version: 3,
    stages: uniqueStages(input.stages),
    outcome: input.outcome,
    startedAt: new Date(input.startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - input.startedAtMs),
    ...(input.collaboration ? { collaboration: input.collaboration } : {}),
    ...(input.usage ? { usage: input.usage } : {})
  });
}

/** Usage summary attached to a V3 work record, for restoring the per-run
 * credits hint when a session is reloaded. */
export function workRecordUsage(value: unknown): AgentUsageRecord | null {
  const record = parseAgentWorkRecord(value);
  return record?.version === 3 ? record.usage ?? null : null;
}

/** Everything the restored chat needs to re-render the per-run credits hint:
 * the usage summary plus the run's wall-clock timing. Null for V1/V2 rows. */
export function workRecordRunMeta(value: unknown): {
  usage: AgentUsageRecord;
  startedAtMs: number;
  durationMs: number;
} | null {
  const usage = workRecordUsage(value);
  if (!usage) return null;
  const record = parseAgentWorkRecord(value);
  if (!record) return null;
  return {
    usage,
    startedAtMs: Date.parse(record.startedAt),
    durationMs: record.durationMs
  };
}

export function parseAgentWorkRecord(value: unknown): AgentWorkRecord | null {
  const parsed = agentWorkRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function workRecordStatusEvents(value: unknown): AgentStatusEvent[] {
  const record = parseAgentWorkRecord(value);
  return record?.stages
    .filter(isAgentStatusStage)
    .map((stage) => ({ stage, completed: true })) ?? [];
}

export function workRecordOutcome(value: unknown): AgentChatOutcome | null {
  const record = parseAgentWorkRecord(value);
  return record && isAgentChatOutcome(record.outcome) ? record.outcome : null;
}

/** Collaboration groups recorded for this run, or [] for single-agent runs. */
export function workRecordCollaboration(value: unknown): CollaborationGroupRecord[] {
  const record = parseAgentWorkRecord(value);
  // V2 introduced the block; V3 keeps it and adds the usage summary.
  if (!record || record.version === 1) return [];
  return record.collaboration?.groups ?? [];
}

function uniqueStages(stages: AgentStatusStage[]): AgentStatusStage[] {
  const seen = new Set<AgentStatusStage>();
  return stages.filter((stage) => {
    if (!isAgentStatusStage(stage) || seen.has(stage)) return false;
    seen.add(stage);
    return true;
  });
}
