import { ACTION_CREDITS, refundAiUsageOperation, reserveAiUsageOperation, settleAiUsageOperation, startAiUsageOperation } from "@/lib/payment";
import type { AgentModelTurnBilling } from "@/lib/agent/types";
import { logInfo, logWarn } from "@/lib/observability";

type AgentUsageEmitter = (event: string, data: unknown) => void;

export function createAgentModelTurnBilling({
  userId,
  sessionId,
  plan,
  requestId,
  emit
}: {
  userId: string;
  sessionId: string;
  plan: string;
  requestId: string;
  emit: AgentUsageEmitter;
}): AgentModelTurnBilling {
  let pendingTurn: { number: number; operationId: string; available: number } | null = null;
  let completedTurns = 0;

  return {
    async reserve() {
      if (pendingTurn) throw new Error("Agent model turn already has a pending Credit reservation.");

      const turn = completedTurns + 1;
      const reservation = await reserveAiUsageOperation({
        operationKey: `agent-turn:${userId}:${requestId}:${turn}`,
        userId,
        action: "agentStep",
        cost: ACTION_CREDITS.agentStep,
        source: "agent",
        detail: { agentSessionId: sessionId, requestId, turn }
      });
      if (reservation.outcome !== "reserved") {
        logWarn(
          reservation.outcome === "insufficient_credits"
            ? "agent_model_turn_denied"
            : "agent_model_turn_replayed",
          { requestId, userId },
          { plan, turn, available: reservation.available }
        );
        return false;
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
        logWarn("agent_model_turn_start_skipped", { requestId, userId }, { plan, turn, status: startStatus });
        return false;
      }

      pendingTurn = { number: turn, operationId: reservation.operationId, available: reservation.available };
      return true;
    },

    async confirmSuccessfulTurn() {
      if (!pendingTurn) return;
      const turn = pendingTurn;
      const status = await settleAiUsageOperation(userId, turn.operationId);
      pendingTurn = null;
      if (status !== "settled") {
        logWarn("agent_model_turn_settlement_skipped", { requestId, userId }, { plan, turn: turn.number, status });
        return;
      }

      completedTurns = turn.number;
      emit("usage", {
        action: "agentStep",
        credits: ACTION_CREDITS.agentStep,
        available: turn.available,
        turn: turn.number
      });
      logInfo("agent_model_turn_credited", { requestId, userId }, { plan, turn: turn.number });
    },

    async refundFailedTurn() {
      if (!pendingTurn) return;
      const turn = pendingTurn;
      const refund = await refundAiUsageOperation(userId, turn.operationId, "agent_model_turn_failed");
      pendingTurn = null;
      emit("usage", {
        action: "agentStep",
        credits: 0,
        refunded: refund.refunded ? ACTION_CREDITS.agentStep : 0,
        available: refund.available,
        turn: turn.number
      });
      logWarn("agent_model_turn_refunded", { requestId, userId }, {
        plan,
        turn: turn.number,
        refunded: refund.refunded
      });
    }
  };
}