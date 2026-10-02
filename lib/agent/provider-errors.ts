export type RetryableAgentProviderErrorCode = "PROVIDER_BUSY" | "PROVIDER_UNAVAILABLE";

type StoredProviderError = {
  text?: string;
  error?: string;
  errorCode?: string;
};

const LEGACY_PROVIDER_BUSY_PATTERN = /(?:LLM request failed\s*:\s*429|["']?code["']?\s*:\s*["']?1305|该模型当前访问量过大|model (?:is )?(?:currently )?(?:busy|overloaded)|too many requests)/i;

export function retryableAgentProviderErrorCode(
  content: StoredProviderError
): RetryableAgentProviderErrorCode | null {
  if (content.errorCode === "PROVIDER_BUSY" || content.errorCode === "PROVIDER_UNAVAILABLE") {
    return content.errorCode;
  }
  const legacyMessage = content.error || content.text || "";
  return LEGACY_PROVIDER_BUSY_PATTERN.test(legacyMessage) ? "PROVIDER_BUSY" : null;
}

export function agentProviderErrorMessage(
  code: RetryableAgentProviderErrorCode,
  locale: "zh" | "en"
): string {
  if (locale === "en") {
    return code === "PROVIDER_BUSY"
      ? "The Agent model is busy. I kept this turn's links, attachments, and context—retry without providing them again."
      : "The Agent model is temporarily unavailable. I kept this turn's context—retry without starting over.";
  }
  return code === "PROVIDER_BUSY"
    ? "Finfold智能体当前繁忙。我已保留本轮链接、截图和上下文；请直接重试，无需重新提供资料。"
    : "Finfold智能体暂时不可用。我已保留本轮上下文；请直接重试，无需重新开始。";
}

export function incompleteAgentTurnMessage(locale: "zh" | "en"): string {
  return locale === "en"
    ? "The previous turn did not finish. I kept its links, attachments, and context—retry without starting over."
    : "上一轮没有完成。我已保留当时的链接、截图和上下文；请直接重试，无需重新提供资料。";
}

/**
 * Raw provider/parser failures (JSON syntax errors, stack traces, network
 * codes) must never reach the chat UI. They used to be persisted verbatim by
 * the /api/agent/chat top-level catch and replayed from history.
 */
const TECHNICAL_ERROR_PATTERNS: RegExp[] = [
  /Unterminated\s+(?:string|identifier|comment|regular)/i,
  /Unexpected (?:token|end of (?:JSON|input))/i,
  /\bposition \d+\s*\(line \d+ column \d+\)/i,
  /^(?:SyntaxError|TypeError|ReferenceError|RangeError|URIError)\b/,
  /\b(?:fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up)\b/i,
  /^LLM request failed/i,
  /\bat\s+[\w$.<>]+\s*\(.*(\/|node:).*:\d+/
];

export function isTechnicalAgentErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Fallback copy shown instead of a raw technical error, current streams and
 *  history replays alike. */
export function agentUnexpectedFailureMessage(locale: "zh" | "en"): string {
  return locale === "en"
    ? "Finfold Agent did not finish this turn. Your materials and context are kept—just retry."
    : "Finfold智能体这一轮没有跑完。本轮资料和上下文已经保留，请直接重试，无需重新提供。";
}

/** Returns the stored error text only when it is safe to show; otherwise a
 *  generic retry line. Used when replaying persisted agent messages. */
export function safeStoredAgentErrorMessage(
  content: StoredProviderError,
  locale: "zh" | "en"
): string {
  if (content.errorCode === "AGENT_RUN_FAILED") return agentUnexpectedFailureMessage(locale);
  const code = retryableAgentProviderErrorCode(content);
  if (code) return agentProviderErrorMessage(code, locale);
  const message = content.error ?? "";
  return isTechnicalAgentErrorMessage(message) ? agentUnexpectedFailureMessage(locale) : message;
}
