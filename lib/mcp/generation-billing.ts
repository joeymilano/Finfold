import { createAiUsageBilling, type AiUsageBillingReservation } from "@/lib/payment/ai-usage-billing";

type McpGenerationReservation = AiUsageBillingReservation;

function operationKey(userId: string, tokenId: string, idempotencyKey: string): string {
  return `mcp-generation:${userId}:${tokenId}:${idempotencyKey}`;
}

export function createMcpGenerationBilling(input: {
  userId: string;
  tokenId: string;
  idempotencyKey: string;
  cost: number;
  platformCount: number;
  inputFingerprint: string;
}) {
  const billing = createAiUsageBilling({
    operationKey: operationKey(input.userId, input.tokenId, input.idempotencyKey),
    userId: input.userId,
    action: "contentKitBase",
    cost: input.cost,
    source: "mcp",
    detail: {
      tokenId: input.tokenId,
      idempotencyKey: input.idempotencyKey,
      platformCount: input.platformCount,
      inputFingerprint: input.inputFingerprint
    }
  });

  return {
    async reserveAndStart(): Promise<McpGenerationReservation> {
      return billing.reserveAndStart();
    },

    async settle(): Promise<void> {
      await billing.settle();
    },

    async refundFailedGeneration(): Promise<void> {
      await billing.refund("mcp_generation_failed");
    }
  };
}