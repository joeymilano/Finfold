import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  start: vi.fn(),
  settle: vi.fn(),
  refund: vi.fn()
}));

vi.mock("@/lib/payment", () => ({
  ACTION_CREDITS: { contentKitBase: 15 },
  reserveAiUsageOperation: mocks.reserve,
  startAiUsageOperation: mocks.start,
  settleAiUsageOperation: mocks.settle,
  refundAiUsageOperation: mocks.refund
}));

import {
  createMcpGenerationBilling,
  deriveMcpContentKitId,
  recoverExistingMcpGeneration
} from "@/lib/mcp/generation-billing";

const input = {
  userId: "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a",
  tokenId: "4d5b8bdf-3d86-4966-a951-3590b042e627",
  idempotencyKey: "mcp_01JABCDEF1234567",
  cost: 18,
  platformCount: 2,
  inputFingerprint: "a".repeat(64)
};

describe("MCP generation billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts and settles exactly one newly reserved generation", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 82 });
    mocks.start.mockResolvedValue("started");
    mocks.settle.mockResolvedValue("settled");
    const billing = createMcpGenerationBilling(input);

    await expect(billing.reserveAndStart()).resolves.toEqual({
      outcome: "authorized",
      operationId: "op-1",
      available: 82
    });
    await billing.settle();

    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: "mcp-generation:f7c08e55-3e0c-44d9-a0e3-718b3a9a798a:4d5b8bdf-3d86-4966-a951-3590b042e627:mcp_01JABCDEF1234567",
      action: "contentKitBase",
      cost: 18,
      source: "mcp",
      detail: expect.objectContaining({ inputFingerprint: "a".repeat(64) })
    }));
    expect(mocks.start).toHaveBeenCalledWith(input.userId, "op-1");
    expect(mocks.settle).toHaveBeenCalledWith(input.userId, "op-1");
  });

  it("does not authorize a duplicate operation for another provider call", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "existing", operationId: "op-1", status: "started", available: 82 });
    const billing = createMcpGenerationBilling(input);

    await expect(billing.reserveAndStart()).resolves.toEqual({
      outcome: "existing",
      operationId: "op-1",
      status: "started",
      available: 82
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("refunds only the operation whose generation failed", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 82 });
    mocks.start.mockResolvedValue("started");
    mocks.refund.mockResolvedValue({ status: "refunded", refunded: true, available: 100 });
    const billing = createMcpGenerationBilling(input);

    await billing.reserveAndStart();
    await billing.refundFailedGeneration();
    await billing.refundFailedGeneration();

    expect(mocks.refund).toHaveBeenCalledOnce();
    expect(mocks.refund).toHaveBeenCalledWith(input.userId, "op-1", "mcp_generation_failed");
  });

  it("derives one stable, scoped UUID for an idempotent content kit", async () => {
    const first = await deriveMcpContentKitId(input.userId, input.tokenId, input.idempotencyKey);
    const retry = await deriveMcpContentKitId(input.userId, input.tokenId, input.idempotencyKey);
    const otherClient = await deriveMcpContentKitId(input.userId, "other-client", input.idempotencyKey);

    expect(first).toBe(retry);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(otherClient).not.toBe(first);
  });

  it("replays a settled content kit without another provider call or settlement", async () => {
    const kit = { id: "kit-1" };
    const loadKit = vi.fn().mockResolvedValue(kit);

    await expect(recoverExistingMcpGeneration({
      reservation: { outcome: "existing", operationId: "op-1", status: "settled", available: 82 },
      userId: input.userId,
      contentKitId: "kit-1",
      loadKit
    })).resolves.toBe(kit);

    expect(loadKit).toHaveBeenCalledWith("kit-1");
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("repairs a lost settlement acknowledgement before replaying the durable kit", async () => {
    const kit = { id: "kit-1" };
    mocks.settle.mockResolvedValue("settled");

    await expect(recoverExistingMcpGeneration({
      reservation: { outcome: "existing", operationId: "op-1", status: "started", available: 82 },
      userId: input.userId,
      contentKitId: "kit-1",
      loadKit: vi.fn().mockResolvedValue(kit)
    })).resolves.toBe(kit);

    expect(mocks.settle).toHaveBeenCalledWith(input.userId, "op-1");
  });

  it("does not treat an in-flight operation without a durable kit as complete", async () => {
    await expect(recoverExistingMcpGeneration({
      reservation: { outcome: "existing", operationId: "op-1", status: "started", available: 82 },
      userId: input.userId,
      contentKitId: "kit-1",
      loadKit: vi.fn().mockResolvedValue(null)
    })).resolves.toBeNull();

    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
