import { describe, expect, it } from "vitest";
import {
  AGENT_DEPTH_LABELS,
  AGENT_DEPTH_LEVELS,
  AGENT_DEPTH_SPECS,
  normalizeAgentDepth
} from "@/lib/agent/depth";
import { ACTION_CREDITS } from "@/lib/payment/types";

describe("Agent thinking depth", () => {
  it("keeps low as the byte-compatible legacy tier", () => {
    expect(AGENT_DEPTH_SPECS.low).toMatchObject({
      thinking: false,
      maxTurns: 6,
      providerTimeoutMs: 60_000,
      action: "agentStep",
      credits: ACTION_CREDITS.agentStep
    });
  });

  it("prices and budgets medium and high above low, monotonically", () => {
    expect(AGENT_DEPTH_LEVELS).toEqual(["low", "medium", "high"]);
    expect(AGENT_DEPTH_SPECS.medium.thinking).toBe(true);
    expect(AGENT_DEPTH_SPECS.high.thinking).toBe(true);
    expect(AGENT_DEPTH_SPECS.medium.credits).toBe(ACTION_CREDITS.agentStepMedium);
    expect(AGENT_DEPTH_SPECS.high.credits).toBe(ACTION_CREDITS.agentStepHigh);
    expect(AGENT_DEPTH_SPECS.low.credits).toBeLessThan(AGENT_DEPTH_SPECS.medium.credits);
    expect(AGENT_DEPTH_SPECS.medium.credits).toBeLessThan(AGENT_DEPTH_SPECS.high.credits);
    expect(AGENT_DEPTH_SPECS.low.maxTurns).toBeLessThanOrEqual(AGENT_DEPTH_SPECS.medium.maxTurns);
    expect(AGENT_DEPTH_SPECS.medium.maxTurns).toBeLessThan(AGENT_DEPTH_SPECS.high.maxTurns);
  });

  it("falls back to low for unknown or missing values", () => {
    expect(normalizeAgentDepth("medium")).toBe("medium");
    expect(normalizeAgentDepth(undefined)).toBe("low");
    expect(normalizeAgentDepth("ultra")).toBe("low");
    expect(normalizeAgentDepth(null)).toBe("low");
  });

  it("exposes localized labels for every tier", () => {
    for (const level of AGENT_DEPTH_LEVELS) {
      expect(AGENT_DEPTH_LABELS[level].zh.length).toBeGreaterThan(0);
      expect(AGENT_DEPTH_LABELS[level].en.length).toBeGreaterThan(0);
    }
  });
});
