export const AGENT_STATUS_STAGES = [
  "understanding_request",
  "connecting_workspace",
  "preparing_context",
  "choosing_capabilities",
  "reviewing_results",
  "composing_response"
] as const;

export type AgentStatusStage = (typeof AGENT_STATUS_STAGES)[number];

export type AgentStatusEvent = {
  stage: AgentStatusStage;
  completed: boolean;
};

export function isAgentStatusStage(value: unknown): value is AgentStatusStage {
  return typeof value === "string" && AGENT_STATUS_STAGES.includes(value as AgentStatusStage);
}

/** Keeps one truthful active phase while retaining completed phases as history. */
export function advanceAgentStatus(
  events: AgentStatusEvent[],
  stage: AgentStatusStage
): AgentStatusEvent[] {
  const previous = events
    .filter((event) => event.stage !== stage)
    .map((event) => ({ ...event, completed: true }));
  return [...previous, { stage, completed: false }];
}

export function completeAgentStatuses(events: AgentStatusEvent[]): AgentStatusEvent[] {
  return events.map((event) => ({ ...event, completed: true }));
}
