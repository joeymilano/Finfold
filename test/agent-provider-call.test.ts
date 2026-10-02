import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentProviderCall } from "@/lib/agent/provider-call";
import type { AgentToolContext } from "@/lib/agent/types";

const billing = {
  reserve: vi.fn(),
  confirmSuccessfulTurn: vi.fn(),
  refundFailedTurn: vi.fn()
};

function context(withBilling = true): AgentToolContext {
  return {
    userId: "user-1",
    admin: {} as AgentToolContext["admin"],
    plan: "starter",
    agentToolsEnabled: true,
    ...(withBilling ? { modelTurnBilling: billing } : {})
  };
}

describe("Agent tool provider billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not require billing outside a billed Agent request", async () => {
    const invoke = vi.fn().mockResolvedValue("result");

    await expect(runAgentProviderCall(context(false), invoke)).resolves.toBe("result");
    expect(invoke).toHaveBeenCalledOnce();
    expect(billing.reserve).not.toHaveBeenCalled();
  });

  it("reserves and settles an Agent tool provider call", async () => {
    billing.reserve.mockResolvedValue(true);
    billing.confirmSuccessfulTurn.mockResolvedValue(undefined);

    await expect(runAgentProviderCall(context(), async () => "result")).resolves.toBe("result");
    expect(billing.reserve).toHaveBeenCalledOnce();
    expect(billing.confirmSuccessfulTurn).toHaveBeenCalledOnce();
    expect(billing.refundFailedTurn).not.toHaveBeenCalled();
  });

  it("does not invoke the provider after a Credits denial", async () => {
    billing.reserve.mockResolvedValue(false);
    const invoke = vi.fn().mockResolvedValue("result");

    await expect(runAgentProviderCall(context(), invoke)).rejects.toThrow("AI Credits are unavailable");
    expect(invoke).not.toHaveBeenCalled();
    expect(billing.refundFailedTurn).not.toHaveBeenCalled();
  });

  it("refunds when the provider fails before returning a result", async () => {
    billing.reserve.mockResolvedValue(true);
    billing.refundFailedTurn.mockResolvedValue(undefined);

    await expect(runAgentProviderCall(context(), async () => {
      throw new Error("provider failed");
    })).rejects.toThrow("provider failed");
    expect(billing.refundFailedTurn).toHaveBeenCalledOnce();
  });

  it("does not refund after a provider result when settlement fails", async () => {
    billing.reserve.mockResolvedValue(true);
    billing.confirmSuccessfulTurn.mockRejectedValue(new Error("settlement failed"));

    await expect(runAgentProviderCall(context(), async () => "result")).rejects.toThrow("settlement failed");
    expect(billing.refundFailedTurn).not.toHaveBeenCalled();
  });
});