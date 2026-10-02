import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  start: vi.fn(),
  settle: vi.fn(),
  refund: vi.fn()
}));

vi.mock("@/lib/payment", () => ({
  ACTION_CREDITS: { agentStep: 1 },
  reserveAiUsageOperation: mocks.reserve,
  startAiUsageOperation: mocks.start,
  settleAiUsageOperation: mocks.settle,
  refundAiUsageOperation: mocks.refund
}));

vi.mock("@/lib/observability", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn()
}));

import { createAgentModelTurnBilling } from "@/lib/agent/model-turn-billing";

function createBilling(depth: "low" | "medium" | "high" = "low") {
  const events: Array<{ event: string; data: unknown }> = [];
  const billing = createAgentModelTurnBilling({
    userId: "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a",
    sessionId: "f4ee2b3e-6b5d-4c7e-b54a-124f5b4d573d",
    plan: "starter",
    requestId: "req_12345678",
    depth,
    emit: (event, data) => events.push({ event, data })
  });
  return { billing, events };
}

describe("Agent model-turn billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("settles one newly reserved provider turn", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 49 });
    mocks.start.mockResolvedValue("started");
    mocks.settle.mockResolvedValue("settled");
    const { billing, events } = createBilling();

    await expect(billing.reserve()).resolves.toBe(true);
    await billing.confirmSuccessfulTurn();

    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: "agent-turn:f7c08e55-3e0c-44d9-a0e3-718b3a9a798a:req_12345678:1",
      action: "agentStep",
      cost: 1,
      source: "agent"
    }));
    expect(mocks.settle).toHaveBeenCalledWith("f7c08e55-3e0c-44d9-a0e3-718b3a9a798a", "op-1");
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(events).toEqual([{
      event: "usage",
      data: { action: "agentStep", credits: 1, available: 49, turn: 1 }
    }]);
  });

  it("does not authorize an existing operation for another provider call", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "existing", operationId: "op-1", status: "reserved", available: 49 });
    const { billing } = createBilling();

    await expect(billing.reserve()).resolves.toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("refunds the precise failed operation once", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 49 });
    mocks.start.mockResolvedValue("started");
    mocks.refund.mockResolvedValue({ status: "refunded", refunded: true, available: 50 });
    const { billing, events } = createBilling();

    await expect(billing.reserve()).resolves.toBe(true);
    await billing.refundFailedTurn();
    await billing.refundFailedTurn();

    expect(mocks.refund).toHaveBeenCalledOnce();
    expect(mocks.refund).toHaveBeenCalledWith(
      "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a",
      "op-1",
      "agent_model_turn_failed"
    );
    expect(events).toEqual([{
      event: "usage",
      data: { action: "agentStep", credits: 0, refunded: 1, available: 50, turn: 1 }
    }]);
  });

  it("does not authorize a provider call when the operation cannot start", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 49 });
    mocks.start.mockResolvedValue("refunded");
    const { billing } = createBilling();

    await expect(billing.reserve()).resolves.toBe(false);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("prices and tags each step by thinking depth", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-1", available: 49 });
    mocks.start.mockResolvedValue("started");
    mocks.settle.mockResolvedValue("settled");

    const medium = createBilling("medium");
    await expect(medium.billing.reserve()).resolves.toBe(true);
    await medium.billing.confirmSuccessfulTurn();
    expect(mocks.reserve).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "agentStepMedium",
      cost: 2,
      detail: expect.objectContaining({ depth: "medium" })
    }));
    expect(medium.events.at(-1)).toEqual({
      event: "usage",
      data: { action: "agentStepMedium", credits: 2, available: 49, turn: 1 }
    });

    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-2", available: 45 });
    const high = createBilling("high");
    await expect(high.billing.reserve()).resolves.toBe(true);
    await high.billing.confirmSuccessfulTurn();
    expect(mocks.reserve).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "agentStepHigh",
      cost: 4,
      detail: expect.objectContaining({ depth: "high" })
    }));
    expect(high.events.at(-1)).toEqual({
      event: "usage",
      data: { action: "agentStepHigh", credits: 4, available: 45, turn: 1 }
    });
  });
});