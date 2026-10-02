import type { AgentAttachment } from "@/lib/agent/attachments";
import type { AgentChatMessage } from "@/lib/agent/loop";
import { isTechnicalAgentErrorMessage } from "@/lib/agent/provider-errors";
import { buildUserMessageWithEvidence } from "@/lib/agent/session-context";
import type { AgentWorkRecord } from "@/lib/agent/work-record";
import { normalizeAgentTextContent } from "@/lib/agent/text-content";

/**
 * Replay policy for stored agent history.
 *
 * The newest RECENT_FULL_TOOL_RUNS assistant runs that carry tool calls are
 * replayed verbatim, so the model keeps full working context for the current
 * thread of work. Older tool runs are condensed before they enter the model
 * context: each stored tool result is replaced by its own summary text (or a
 * truncated JSON head) so long sessions cannot grow the request without
 * bound. Stored rows stay untouched — only what is sent to the model shrinks.
 */

/** Assistant tool runs kept verbatim when replaying history. */
export const RECENT_FULL_TOOL_RUNS = 6;

/** Character ceiling for one condensed tool result. */
const COMPACT_RESULT_MAX_CHARS = 600;

const TECHNICAL_ERROR_NOTE = "[This turn failed with a technical error and can be retried.]";

const SUMMARY_KEYS = ["summary", "conclusion", "verdict", "message", "note", "error"] as const;

export type StoredMessageContent = {
  text?: unknown;
  error?: string;
  errorCode?: string;
  imageUrls?: string[];
  dataImportIds?: string[];
  attachments?: AgentAttachment[];
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; result: unknown }>;
  work?: AgentWorkRecord;
};

export type AgentHistoryRow = {
  id: string | number;
  role: string;
  content: unknown;
};

/** Maps chronological stored rows to the messages sent back to the model. */
export function historyRowsToReplayMessages(rows: AgentHistoryRow[]): AgentChatMessage[] {
  const replayable = rows.filter((row) => row.role === "user" || row.role === "assistant");
  const fullToolRunIds = new Set(
    replayable
      .filter((row) => {
        const content = row.content as StoredMessageContent | null;
        return row.role === "assistant" && (content?.toolCalls?.length ?? 0) > 0;
      })
      .slice(-RECENT_FULL_TOOL_RUNS)
      .map((row) => row.id)
  );

  return replayable.flatMap((row): AgentChatMessage[] => {
    const content = (row.content ?? {}) as StoredMessageContent;
    if (row.role === "user") {
      const userText = normalizeAgentTextContent(content.text);
      return [{
        role: "user",
        content: buildUserMessageWithEvidence(userText, {
          dataImportIds: content.dataImportIds,
          attachments: content.attachments
        }, "history")
      }];
    }

    const calls = content.toolCalls ?? [];
    const assistantText = normalizeAgentTextContent(content.text);
    if (calls.length === 0) {
      const errorText = !assistantText
        ? (content.error && isTechnicalAgentErrorMessage(content.error)) || content.errorCode === "AGENT_RUN_FAILED"
          ? TECHNICAL_ERROR_NOTE
          : content.error ?? ""
        : "";
      return [{ role: "assistant", content: assistantText || errorText }];
    }

    const toolCalls = calls.map((call, index) => ({
      id: `history-${row.id}-${index}`,
      type: "function" as const,
      function: {
        name: call.name,
        arguments: JSON.stringify(call.args ?? {})
      }
    }));
    const keepFull = fullToolRunIds.has(row.id);
    const resultMessages = toolCalls.map((call, index): AgentChatMessage => ({
      role: "tool",
      tool_call_id: call.id,
      content: keepFull
        ? JSON.stringify(content.toolResults?.[index]?.result ?? { restored: true })
        : compactStoredToolResult(content.toolResults?.[index]?.result)
    }));
    return [
      {
        role: "assistant",
        content: assistantText,
        tool_calls: toolCalls
      },
      ...resultMessages
    ];
  });
}

function compactStoredToolResult(result: unknown): string {
  if (result === null || result === undefined) return JSON.stringify({ restored: true });
  const json = safeJsonStringify(result);
  if (json === null) return JSON.stringify({ restored: true });
  if (json.length <= COMPACT_RESULT_MAX_CHARS) return json;
  const summary = findSummaryText(result, 0);
  const body = summary ?? `${json.slice(0, COMPACT_RESULT_MAX_CHARS)}…`;
  return `[condensed earlier tool result — full output not in context] ${clampText(body, COMPACT_RESULT_MAX_CHARS)}`;
}

/** First short human-readable conclusion inside the result, searching the top
 * two object levels so wrapped shapes like { investigation: { summary } } work. */
function findSummaryText(value: unknown, depth: number): string | null {
  if (depth > 1 || typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of SUMMARY_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const nested of Object.values(record)) {
    if (typeof nested !== "object" || nested === null || Array.isArray(nested)) continue;
    const found = findSummaryText(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function clampText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
