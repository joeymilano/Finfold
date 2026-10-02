import { describe, expect, it } from "vitest";

import {
  agentUnexpectedFailureMessage,
  isTechnicalAgentErrorMessage,
  retryableAgentProviderErrorCode,
  safeStoredAgentErrorMessage
} from "@/lib/agent/provider-errors";

describe("isTechnicalAgentErrorMessage", () => {
  it("flags the raw JSON parse error that leaked into the chat UI", () => {
    expect(isTechnicalAgentErrorMessage("Unterminated string in JSON at position 77 (line 1 column 78)")).toBe(true);
  });

  it("flags stack traces and network codes", () => {
    expect(isTechnicalAgentErrorMessage("TypeError: Cannot read properties of undefined (reading 'map')")).toBe(true);
    expect(isTechnicalAgentErrorMessage("fetch failed")).toBe(true);
    expect(isTechnicalAgentErrorMessage("LLM request failed: 500 Internal Server Error")).toBe(true);
    expect(isTechnicalAgentErrorMessage('Unexpected end of JSON input')).toBe(true);
  });

  it("keeps user-facing copy as-is", () => {
    expect(isTechnicalAgentErrorMessage("创作点数已用完，补充后可继续使用 Finfold智能体。")).toBe(false);
    expect(isTechnicalAgentErrorMessage("")).toBe(false);
  });
});

describe("safeStoredAgentErrorMessage", () => {
  it("replays a friendly retry line instead of the raw technical error", () => {
    const message = safeStoredAgentErrorMessage(
      { error: "Unterminated string in JSON at position 77 (line 1 column 78)" },
      "zh"
    );
    expect(message).toBe("Finfold智能体这一轮没有跑完。本轮资料和上下文已经保留，请直接重试，无需重新提供。");
  });

  it("still maps legacy provider-busy errors to the retry copy", () => {
    const message = safeStoredAgentErrorMessage(
      { error: 'LLM request failed: 429 {"error":{"code":"1305","message":"该模型当前访问量过大，请您稍后再试"}}' },
      "zh"
    );
    expect(retryableAgentProviderErrorCode({ error: "LLM request failed: 429" })).toBe("PROVIDER_BUSY");
    expect(message).toContain("Finfold智能体当前繁忙");
  });

  it("keeps plain user-facing errors untouched", () => {
    expect(safeStoredAgentErrorMessage({ error: "创作点数已用完，补充后可继续使用 Finfold智能体。" }, "zh"))
      .toBe("创作点数已用完，补充后可继续使用 Finfold智能体。");
  });

  it("returns localized unexpected-failure copy", () => {
    expect(agentUnexpectedFailureMessage("en")).toBe(
      "Finfold Agent did not finish this turn. Your materials and context are kept—just retry."
    );
  });

  it("renders typed AGENT_RUN_FAILED rows per locale even after cleanup blanked the raw text", () => {
    expect(safeStoredAgentErrorMessage({ error: "", errorCode: "AGENT_RUN_FAILED" }, "zh"))
      .toBe("Finfold智能体这一轮没有跑完。本轮资料和上下文已经保留，请直接重试，无需重新提供。");
    expect(safeStoredAgentErrorMessage({ error: "", errorCode: "AGENT_RUN_FAILED" }, "en"))
      .toBe("Finfold Agent did not finish this turn. Your materials and context are kept—just retry.");
  });
});
