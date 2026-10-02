import { refundAiUsageOperation, reserveAiUsageOperation, settleAiUsageOperation, startAiUsageOperation } from "@/lib/payment";
import { agentDepthSpec, type AgentDepth } from "@/lib/agent/depth";
import type { AgentModelTurnBilling, AgentStepReservation } from "@/lib/agent/types";
import { logInfo, logWarn } from "@/lib/observability";

type AgentUsageEmitter = (event: string, data: unknown) => void;

type StepRecord = {
  sequence: number;
  operationId: string;
  available: number;
  state: "open" | "terminal";
};

type TrackedStep = {
  stepKey: string;
  record: StepRecord;
  reservation: AgentStepReservation;
};

function rootStepNumberOf(stepKey: string): number | null {
  const match = /^root:(\d+)$/.exec(stepKey);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Root steps keep the legacy numeric operationKey (`…:1`) so ledger rows and
 * idempotency semantics stay identical for the sequential loop; only new
 * step kinds (subagents) introduce prefixed keys. */
function operationKeySuffix(stepKey: string): string {
  const root = rootStepNumberOf(stepKey);
  return root !== null ? String(root) : stepKey;
}

/**
 * Concurrently-safe Credits lifecycle for one Agent request.
 *
 * V1 kept a single `pendingTurn`, which serialized billing and threw on any
 * overlap — unusable for parallel subagent fan-out. The coordinator keeps one
 * reservation per named step ("root:1", "subagent:{groupId}:{taskId}:1"), so
 * the sequential root loop and up to 3 concurrent subagent calls each settle
 * or refund independently.
 *
 * Idempotency contract:
 * - operationKey = `agent-turn:{userId}:{requestId}:{stepKey}`; the ledger RPC
 *   reserves each key exactly once, so a replayed open() can never charge twice.
 * - open() on a step key that already exists (open or terminal) returns null —
 *   callers must skip the provider call for that step.
 * - confirm()/refund() are safe to call twice; only the first call acts.
 * - A refunded or skipped step never affects a sibling step's settlement.
 */
export function createAgentModelTurnBilling({
  userId,
  sessionId,
  plan,
  requestId,
  depth,
  emit
}: {
  userId: string;
  sessionId: string;
  plan: string;
  requestId: string;
  /** One depth per request — every root/subagent step prices identically. */
  depth: AgentDepth;
  emit: AgentUsageEmitter;
}): AgentModelTurnBilling {
  const spec = agentDepthSpec(depth);
  const steps = new Map<string, TrackedStep>();
  let nextSequence = 0;
  /** Highest root step number that actually settled — mirrors the legacy
   * `completedTurns` counter so root numbering survives failed/replayed turns. */
  let settledRoot = 0;

  async function open(stepKey: string): Promise<AgentStepReservation | null> {
    const existing = steps.get(stepKey);
    if (existing) {
      logWarn(
        existing.record.state === "open" ? "agent_step_open_conflict" : "agent_step_replayed",
        { requestId, userId },
        { plan, stepKey }
      );
      return null;
    }

    const reservation = await reserveAiUsageOperation({
      operationKey: `agent-turn:${userId}:${requestId}:${operationKeySuffix(stepKey)}`,
      userId,
      action: spec.action,
      cost: spec.credits,
      source: "agent",
      detail: { agentSessionId: sessionId, requestId, step: stepKey, depth }
    });
    if (reservation.outcome !== "reserved") {
      logWarn(
        reservation.outcome === "insufficient_credits"
          ? "agent_model_turn_denied"
          : "agent_model_turn_replayed",
        { requestId, userId },
        { plan, stepKey, available: reservation.available }
      );
      return null;
    }

    let startStatus: Awaited<ReturnType<typeof startAiUsageOperation>>;
    try {
      startStatus = await startAiUsageOperation(userId, reservation.operationId);
    } catch (error) {
      // No provider request has been issued, so this precise reservation is safe to release.
      await refundAiUsageOperation(userId, reservation.operationId, "agent_model_turn_start_failed").catch(() => undefined);
      throw error;
    }
    if (startStatus !== "started") {
      logWarn("agent_model_turn_start_skipped", { requestId, userId }, { plan, stepKey, status: startStatus });
      return null;
    }

    const record: StepRecord = {
      sequence: (nextSequence += 1),
      operationId: reservation.operationId,
      available: reservation.available,
      state: "open"
    };
    const step: TrackedStep = {
      stepKey,
      record,
      reservation: {
        sequence: record.sequence,
        stepKey,
        async confirm() {
          if (record.state !== "open") return;
          const status = await settleAiUsageOperation(userId, record.operationId);
          record.state = "terminal";
          const rootNumber = rootStepNumberOf(stepKey);
          if (status !== "settled") {
            // Terminal on the ledger through another path (or stale) — never
            // re-settle, never emit a charge for it.
            logWarn("agent_model_turn_settlement_skipped", { requestId, userId }, { plan, stepKey, status });
            return;
          }
          if (rootNumber !== null) settledRoot = Math.max(settledRoot, rootNumber);
          emit("usage", {
            action: spec.action,
            credits: spec.credits,
            available: record.available,
            turn: rootNumber ?? record.sequence,
            // Root turns keep the exact legacy payload; new step kinds are tagged.
            ...(rootNumber === null ? { step: stepKey } : {})
          });
          logInfo("agent_model_turn_credited", { requestId, userId }, { plan, stepKey, sequence: record.sequence });
        },
        async refund(reason: string) {
          if (record.state !== "open") return;
          const rootNumber = rootStepNumberOf(stepKey);
          const refund = await refundAiUsageOperation(userId, record.operationId, reason);
          record.state = "terminal";
          emit("usage", {
            action: spec.action,
            credits: 0,
            refunded: refund.refunded ? spec.credits : 0,
            available: refund.available,
            turn: rootNumber ?? record.sequence,
            ...(rootNumber === null ? { step: stepKey } : {})
          });
          logWarn("agent_model_turn_refunded", { requestId, userId }, {
            plan,
            stepKey,
            sequence: record.sequence,
            refunded: refund.refunded
          });
        }
      }
    };
    steps.set(stepKey, step);
    return step.reservation;
  }

  function latestOpenRootReservation(): AgentStepReservation | null {
    let latest: TrackedStep | null = null;
    for (const step of steps.values()) {
      if (step.record.state !== "open" || rootStepNumberOf(step.stepKey) === null) continue;
      if (!latest || step.record.sequence > latest.record.sequence) latest = step;
    }
    return latest?.reservation ?? null;
  }

  return {
    open,

    /** Legacy sequential surface used by the root loop and route: reserves
     * root:{lastSettled+1}. Numbering matches the pre-coordinator semantics
     * (a failed turn never advances the counter; a replayed key is refused). */
    async reserve() {
      return (await open(`root:${settledRoot + 1}`)) !== null;
    },

    /** Legacy: settles the currently open root reservation. The root loop is
     * strictly sequential, so at most one root step is open at a time. */
    async confirmSuccessfulTurn() {
      const root = latestOpenRootReservation();
      if (root) await root.confirm();
    },

    /** Legacy: refunds the currently open root reservation after a failed turn. */
    async refundFailedTurn() {
      const root = latestOpenRootReservation();
      if (root) await root.refund("agent_model_turn_failed");
    }
  };
}
