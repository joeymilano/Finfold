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
import type { AgentStepReservation } from "@/lib/agent/types";

const USER_ID = "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a";
const REQUEST_ID = "req_12345678";

/** reserve mock that mints a fresh operation per unique operationKey. */
function mockHealthyLedger() {
  const operations = new Map<string, string>();
  let counter = 0;
  mocks.reserve.mockImplementation(async (input: { operationKey: string }) => {
    const existing = operations.get(input.operationKey);
    if (existing) return { outcome: "existing", operationId: existing, status: "settled", available: 48 };
    const operationId = `op-${(counter += 1)}`;
    operations.set(input.operationKey, operationId);
    return { outcome: "reserved", operationId, available: 49 };
  });
  mocks.start.mockResolvedValue("started");
  mocks.settle.mockResolvedValue("settled");
  mocks.refund.mockResolvedValue({ status: "refunded", refunded: true, available: 50 });
  return operations;
}

function createBilling() {
  const events: Array<{ event: string; data: unknown }> = [];
  const billing = createAgentModelTurnBilling({
    userId: USER_ID,
    sessionId: "f4ee2b3e-6b5d-4c7e-b54a-124f5b4d573d",
    plan: "growth",
    requestId: REQUEST_ID,
    depth: "low",
    emit: (event, data) => events.push({ event, data })
  });
  return { billing, events };
}

describe("Agent billing coordinator (concurrent subagent reservations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens and settles a root turn and three subagent steps concurrently", async () => {
    mockHealthyLedger();
    const { billing, events } = createBilling();

    // Old implementation threw here: a second reservation while one was pending.
    const reservations = await Promise.all([
      billing.reserve(),
      billing.open!("subagent:g1:t1:1"),
      billing.open!("subagent:g1:t2:1"),
      billing.open!("subagent:g1:t3:1")
    ]);

    expect(reservations[0]).toBe(true);
    const steps = reservations.slice(1) as unknown as Array<AgentStepReservation | null>;
    for (const reservation of steps) {
      expect(reservation).not.toBeNull();
      expect(reservation!.stepKey).toMatch(/^subagent:g1:t\d:1$/);
    }

    const operationKeys = mocks.reserve.mock.calls.map((call) => call[0].operationKey);
    expect(new Set(operationKeys).size).toBe(4);
    expect(operationKeys).toContain(`agent-turn:${USER_ID}:${REQUEST_ID}:1`);
    expect(operationKeys).toContain(`agent-turn:${USER_ID}:${REQUEST_ID}:subagent:g1:t1:1`);

    await Promise.all([
      billing.confirmSuccessfulTurn(),
      reservations[1]!.confirm(),
      reservations[2]!.confirm(),
      reservations[3]!.confirm()
    ]);

    expect(mocks.settle).toHaveBeenCalledTimes(4);
    expect(mocks.refund).not.toHaveBeenCalled();
    const charged = events.filter((event) => event.event === "usage" && (event.data as { credits: number }).credits > 0);
    expect(charged).toHaveLength(4);
  });

  it("refuses to re-open the same step key and never double-charges it", async () => {
    mockHealthyLedger();
    const { billing } = createBilling();

    const first = await billing.open!("subagent:g1:t1:1");
    const duplicate = await billing.open!("subagent:g1:t1:1");
    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    // The duplicate was rejected in-memory before touching the ledger.
    expect(mocks.reserve).toHaveBeenCalledTimes(1);

    await first!.confirm();
    // Re-opening a settled step is also refused — the ledger replay path is
    // a safety net, not the primary guard.
    const afterSettle = await billing.open!("subagent:g1:t1:1");
    expect(afterSettle).toBeNull();
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });

  it("settles each successful subagent exactly once while siblings refund", async () => {
    mockHealthyLedger();
    const { billing, events } = createBilling();

    const [a, b, c] = await Promise.all([
      billing.open!("subagent:g2:t1:1"),
      billing.open!("subagent:g2:t2:1"),
      billing.open!("subagent:g2:t3:1")
    ]);
    expect([a, b, c].every((step) => step !== null)).toBe(true);

    await a!.refund("subagent_failed");
    await b!.confirm();
    await b!.confirm(); // provider retry inside the same reservation
    await c!.refund("subagent_cancelled");
    await c!.refund("subagent_cancelled");

    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith(USER_ID, "op-2");
    expect(mocks.refund).toHaveBeenCalledTimes(2);
    expect(mocks.refund).toHaveBeenCalledWith(USER_ID, "op-1", "subagent_failed");
    expect(mocks.refund).toHaveBeenCalledWith(USER_ID, "op-3", "subagent_cancelled");

    const usage = events.filter((event) => event.event === "usage");
    expect(usage).toHaveLength(3);
    const charged = usage.filter((event) => (event.data as { credits: number }).credits === 1);
    const refunded = usage.filter((event) => (event.data as { refunded: number }).refunded === 1);
    expect(charged).toHaveLength(1);
    expect(refunded).toHaveLength(2);
    expect((charged[0].data as { step: string }).step).toBe("subagent:g2:t2:1");
  });

  it("advances root numbering only after settlement", async () => {
    mockHealthyLedger();
    const { billing } = createBilling();

    await expect(billing.reserve()).resolves.toBe(true); // root:1
    await billing.refundFailedTurn();
    // The failed root turn does not advance the counter; the same key is
    // refused rather than silently re-reserved.
    await expect(billing.reserve()).resolves.toBe(false);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);

    // A separate billing instance gets a fresh ledger (one per request).
    vi.clearAllMocks();
    mockHealthyLedger();
    const fresh = createBilling();
    await expect(fresh.billing.reserve()).resolves.toBe(true);
    await fresh.billing.confirmSuccessfulTurn();
    await expect(fresh.billing.reserve()).resolves.toBe(true); // root:2
    await fresh.billing.confirmSuccessfulTurn();
    const keys = mocks.reserve.mock.calls.map((call) => call[0].operationKey);
    expect(keys).toEqual([
      `agent-turn:${USER_ID}:${REQUEST_ID}:1`,
      `agent-turn:${USER_ID}:${REQUEST_ID}:2`
    ]);
  });

  it("returns null and skips the provider call when credits are unavailable", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "insufficient_credits", available: 0 });
    mocks.start.mockResolvedValue("started");
    const { billing } = createBilling();

    await expect(billing.open!("subagent:g3:t1:1")).resolves.toBeNull();
    await expect(billing.reserve()).resolves.toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("releases the reservation when the ledger start call throws", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-start-fail", available: 49 });
    mocks.start.mockRejectedValue(new Error("ledger unavailable"));
    mocks.refund.mockResolvedValue({ status: "refunded", refunded: true, available: 50 });
    const { billing } = createBilling();

    await expect(billing.open!("subagent:g4:t1:1")).rejects.toThrow("ledger unavailable");
    expect(mocks.refund).toHaveBeenCalledWith(USER_ID, "op-start-fail", "agent_model_turn_start_failed");
  });

  it("does not charge a step whose settlement lands in a non-settled state", async () => {
    mocks.reserve.mockResolvedValue({ outcome: "reserved", operationId: "op-stale", available: 49 });
    mocks.start.mockResolvedValue("started");
    mocks.settle.mockResolvedValue("started"); // already terminal elsewhere
    const { billing, events } = createBilling();

    const step = await billing.open!("subagent:g5:t1:1");
    await step!.confirm();
    await step!.confirm();

    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.event === "usage")).toHaveLength(0);
  });
});
