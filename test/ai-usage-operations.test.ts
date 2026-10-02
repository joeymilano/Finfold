import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

vi.mock("@/lib/runtime-mode", () => ({
  isLocalMockMode: () => false,
  persistenceUnavailableMessage: (feature: string) => `${feature} unavailable`
}));

import {
  recoverStaleAiUsageOperations,
  refundAiUsageOperation,
  reserveAiUsageOperation,
  settleAiUsageOperation,
  startAiUsageOperation
} from "@/lib/payment/ai-usage-operations";

const input = {
  operationKey: "agent-turn:request-12345678:1",
  userId: "user-1",
  action: "agentStep",
  cost: 1,
  source: "agent",
  detail: { requestId: "request-12345678", turn: 1 }
};

describe("AI usage operation payment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the one newly-reserved operation", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ operation_id: "op-1", status: "reserved", available: 99, is_new: true }],
      error: null
    });

    await expect(reserveAiUsageOperation(input)).resolves.toEqual({
      outcome: "reserved",
      operationId: "op-1",
      available: 99
    });
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_ai_usage_operation", {
      p_operation_key: input.operationKey,
      p_user_id: input.userId,
      p_action: input.action,
      p_cost: input.cost,
      p_source: input.source,
      p_detail: input.detail
    });
  });

  it("returns an existing operation without authorizing another model call", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ operation_id: "op-1", status: "settled", available: 99, is_new: false }],
      error: null
    });

    await expect(reserveAiUsageOperation(input)).resolves.toEqual({
      outcome: "existing",
      operationId: "op-1",
      status: "settled",
      available: 99
    });
  });

  it("keeps an insufficient balance distinct from an existing operation", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ operation_id: null, status: "insufficient_credits", available: 0, is_new: true }],
      error: null
    });

    await expect(reserveAiUsageOperation(input)).resolves.toEqual({
      outcome: "insufficient_credits",
      available: 0
    });
  });

  it("starts, settles and refunds through operation-specific RPCs", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: "started", error: null })
      .mockResolvedValueOnce({ data: "settled", error: null })
      .mockResolvedValueOnce({
        data: [{ status: "refunded", refunded: true, available: 100 }],
        error: null
      });

    await expect(startAiUsageOperation("user-1", "op-1")).resolves.toBe("started");
    await expect(settleAiUsageOperation("user-1", "op-1")).resolves.toBe("settled");
    await expect(refundAiUsageOperation("user-1", "op-1", "agent_model_turn_failed")).resolves.toEqual({
      status: "refunded",
      refunded: true,
      available: 100
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "start_ai_usage_operation", {
      p_operation_id: "op-1",
      p_user_id: "user-1"
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "settle_ai_usage_operation", {
      p_operation_id: "op-1",
      p_user_id: "user-1"
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "refund_ai_usage_operation", {
      p_operation_id: "op-1",
      p_user_id: "user-1",
      p_reason: "agent_model_turn_failed"
    });
  });

  it("recovers a bounded batch of stale reservations", async () => {
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    const before = new Date("2026-08-05T00:00:00.000Z");

    await expect(recoverStaleAiUsageOperations({ before, limit: 100 })).resolves.toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith("recover_stale_ai_usage_operations", {
      p_before: "2026-08-05T00:00:00.000Z",
      p_limit: 100
    });
  });
});