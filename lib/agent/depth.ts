import { ACTION_CREDITS, type ActionKey } from "@/lib/payment/types";

/**
 * User-selectable Agent thinking depth. One choice spans the whole request:
 * model thinking mode, autonomous turn budget, provider timeout, and the
 * per-step Credits price all derive from it. `low` is byte-for-byte the
 * pre-depth behavior (thinking off, 6 turns, 1 credit/step), so existing
 * clients that omit `depth` keep their old ledger semantics.
 */
export const AGENT_DEPTH_LEVELS = ["low", "medium", "high"] as const;
export type AgentDepth = (typeof AGENT_DEPTH_LEVELS)[number];

export type AgentDepthSpec = {
  /** Provider dialect switch for extended reasoning (GLM `thinking`, Qwen `enable_thinking`). */
  thinking: boolean;
  /** Max root loop turns the agent may run autonomously. */
  maxTurns: number;
  /** Per-request provider timeout; thinking responses need a longer ceiling. */
  providerTimeoutMs: number;
  /** Ledger action key — separate keys keep per-tier pricing auditable. */
  action: ActionKey;
  /** Credits charged per successfully executed model step. */
  credits: number;
};

export const AGENT_DEPTH_SPECS: Record<AgentDepth, AgentDepthSpec> = {
  low: {
    thinking: false,
    maxTurns: 6,
    providerTimeoutMs: 60_000,
    action: "agentStep",
    credits: ACTION_CREDITS.agentStep
  },
  medium: {
    thinking: true,
    maxTurns: 6,
    providerTimeoutMs: 120_000,
    action: "agentStepMedium",
    credits: ACTION_CREDITS.agentStepMedium
  },
  high: {
    thinking: true,
    maxTurns: 10,
    providerTimeoutMs: 180_000,
    action: "agentStepHigh",
    credits: ACTION_CREDITS.agentStepHigh
  }
};

export function normalizeAgentDepth(value: unknown): AgentDepth {
  return typeof value === "string" && (AGENT_DEPTH_LEVELS as readonly string[]).includes(value)
    ? (value as AgentDepth)
    : "low";
}

export function agentDepthSpec(depth: AgentDepth): AgentDepthSpec {
  return AGENT_DEPTH_SPECS[depth];
}

/** UI copy shared by the composer picker and any future surfaces. */
export const AGENT_DEPTH_LABELS: Record<AgentDepth, { zh: string; en: string; zhDesc: string; enDesc: string }> = {
  low: {
    zh: "低",
    en: "Low",
    zhDesc: "快速直接回答，不展开深度思考",
    enDesc: "Fast, direct answers without extended thinking"
  },
  medium: {
    zh: "中",
    en: "Medium",
    zhDesc: "开启深度思考，适合需要推理的任务",
    enDesc: "Extended thinking for reasoning-heavy tasks"
  },
  high: {
    zh: "高",
    en: "High",
    zhDesc: "深度思考，并允许更多自主执行步骤",
    enDesc: "Deep thinking plus more autonomous steps"
  }
};

const AGENT_DEPTH_STORAGE_KEY = "finfold:agent-depth";

export function readStoredAgentDepth(): AgentDepth {
  if (typeof window === "undefined") return "low";
  try {
    return normalizeAgentDepth(window.localStorage.getItem(AGENT_DEPTH_STORAGE_KEY));
  } catch {
    return "low";
  }
}

export function writeStoredAgentDepth(depth: AgentDepth): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_DEPTH_STORAGE_KEY, depth);
  } catch {
    /* Depth falls back to low per request when storage is unavailable. */
  }
}
