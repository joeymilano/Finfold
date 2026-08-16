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

const agentWorkRecordSchema = z.object({
  version: z.literal(1),
  stages: z.array(z.enum(AGENT_STATUS_STAGES)).max(AGENT_STATUS_STAGES.length),
  outcome: z.enum(AGENT_CHAT_OUTCOMES),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative().max(30 * 60 * 1_000)
});

export type AgentWorkRecord = z.infer<typeof agentWorkRecordSchema>;

export function createAgentWorkRecord(input: {
  stages: AgentStatusStage[];
  outcome: AgentChatOutcome;
  startedAtMs: number;
  completedAtMs?: number;
}): AgentWorkRecord {
  const completedAtMs = input.completedAtMs ?? Date.now();
  return agentWorkRecordSchema.parse({
    version: 1,
    stages: uniqueStages(input.stages),
    outcome: input.outcome,
    startedAt: new Date(input.startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - input.startedAtMs)
  });
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

function uniqueStages(stages: AgentStatusStage[]): AgentStatusStage[] {
  const seen = new Set<AgentStatusStage>();
  return stages.filter((stage) => {
    if (!isAgentStatusStage(stage) || seen.has(stage)) return false;
    seen.add(stage);
    return true;
  });
}
