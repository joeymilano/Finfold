import { settleAiUsageOperation } from "@/lib/payment";
import { createAiUsageBilling, type AiUsageBillingReservation } from "@/lib/payment/ai-usage-billing";

type McpGenerationReservation = AiUsageBillingReservation;

function operationKey(userId: string, tokenId: string, idempotencyKey: string): string {
  return `mcp-generation:${userId}:${tokenId}:${idempotencyKey}`;
}

/**
 * Gives an idempotent MCP generation a stable content-kit ID without storing
 * the OAuth client ID or request key on the kit. A successful retry can use
 * this ID to return the original result instead of charging or generating
 * again when the first response was lost.
 */
export async function deriveMcpContentKitId(
  userId: string,
  tokenId: string,
  idempotencyKey: string
): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(operationKey(userId, tokenId, idempotencyKey))
  ));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function recoverExistingMcpGeneration<T>(input: {
  reservation: Extract<McpGenerationReservation, { outcome: "existing" }>;
  userId: string;
  contentKitId: string;
  loadKit: (contentKitId: string) => Promise<T | null>;
}): Promise<T | null> {
  if (input.reservation.status === "reserved" || input.reservation.status === "refunded") {
    return null;
  }

  const kit = await input.loadKit(input.contentKitId);
  if (!kit) return null;

  // The kit is durable evidence that the provider result completed. Repair a
  // lost settlement acknowledgement before replaying that same result.
  if (input.reservation.status === "started") {
    const status = await settleAiUsageOperation(
      input.userId,
      input.reservation.operationId
    );
    if (status !== "settled") {
      throw new Error("AI Credits operation did not settle.");
    }
  }
  return kit;
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
