import { describe, expect, it } from "vitest";
import {
  isAgentChatOutcome,
  isPendingAgentConfirmation,
  pendingAgentConfirmationId,
  resolveAgentTerminalContent
} from "@/lib/agent/chat-outcome";

describe("Agent chat terminal outcomes", () => {
  it("keeps a pending confirmation successful during a rolling deployment", () => {
    const pendingResult = {
      confirmationRequired: true,
      pendingAction: { id: crypto.randomUUID() }
    };

    expect(isPendingAgentConfirmation(pendingResult)).toBe(true);
    expect(pendingAgentConfirmationId(pendingResult)).toBe(pendingResult.pendingAction.id);
    expect(resolveAgentTerminalContent({
      assistantText: "",
      streamError: null,
      outcome: null,
      hasPendingConfirmation: true,
      fallback: "Agent 暂时无法回复，请重试。"
    })).toBe("");
  });

  it("preserves a real stream error and rejects unknown outcomes", () => {
    expect(isAgentChatOutcome("failed")).toBe(true);
    expect(isAgentChatOutcome("awaiting_input")).toBe(true);
    expect(isAgentChatOutcome("maybe_done")).toBe(false);
    expect(resolveAgentTerminalContent({
      assistantText: "",
      streamError: "LLM request failed.",
      outcome: "failed",
      hasPendingConfirmation: false,
      fallback: "fallback"
    })).toBe("LLM request failed.");
  });

  it("does not invent a failure while the Agent is waiting for a real choice", () => {
    expect(resolveAgentTerminalContent({
      assistantText: "",
      streamError: null,
      outcome: "awaiting_input",
      hasPendingConfirmation: false,
      fallback: "fallback"
    })).toBe("");
  });
});
