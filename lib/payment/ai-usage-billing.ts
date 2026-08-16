import { refundAiUsageOperation, reserveAiUsageOperation, settleAiUsageOperation, startAiUsageOperation, type AiUsageOperationStatus } from "@/lib/payment";

export type AiUsageBillingReservation =
  | { outcome: "authorized"; available: number }
  | { outcome: "insufficient_credits"; available: number }
  | { outcome: "existing"; status: AiUsageOperationStatus };

/**
 * Binds one provider call to a durable Credit operation. Once started, an
 * uncertain provider result remains held for reconciliation instead of being
 * automatically refunded.
 */
export function createAiUsageBilling(input: {
  operationKey: string;
  userId: string;
  action: string;
  cost: number;
  source: string;
  detail: Record<string, unknown>;
}) {
  let pendingOperation: { id: string; available: number } | null = null;

  return {
    async reserveAndStart(): Promise<AiUsageBillingReservation> {
      const reservation = await reserveAiUsageOperation(input);
      if (reservation.outcome === "insufficient_credits") {
        return { outcome: "insufficient_credits", available: reservation.available };
      }
      if (reservation.outcome === "existing") {
        return { outcome: "existing", status: reservation.status };
      }

      try {
        const status = await startAiUsageOperation(input.userId, reservation.operationId);
        if (status !== "started") return { outcome: "existing", status };
      } catch (error) {
        // No provider request has been issued, so this exact reservation is safe to release.
        await refundAiUsageOperation(input.userId, reservation.operationId, `${input.source}_start_failed`).catch(() => undefined);
        throw error;
      }

      pendingOperation = { id: reservation.operationId, available: reservation.available };
      return { outcome: "authorized", available: reservation.available };
    },

    async settle(): Promise<void> {
      if (!pendingOperation) throw new Error("AI usage has no pending Credits operation.");
      const status = await settleAiUsageOperation(input.userId, pendingOperation.id);
      if (status !== "settled") {
        throw new Error("AI Credits operation did not settle.");
      }
      pendingOperation = null;
    },

    async refund(reason: string): Promise<void> {
      if (!pendingOperation) return;
      const operation = pendingOperation;
      pendingOperation = null;
      await refundAiUsageOperation(input.userId, operation.id, reason);
    }
  };
}