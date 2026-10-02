import { describe, expect, it } from "vitest";
import { historyRowsToReplayMessages, RECENT_FULL_TOOL_RUNS } from "@/lib/agent/history-replay";

const CONDENSED_PREFIX = "[condensed earlier tool result";

function userRow(id: number, text: string) {
  return { id, role: "user", content: { text } };
}

function toolRunRow(id: number, result: unknown, name = "investigate_social_account") {
  return {
    id,
    role: "assistant",
    content: {
      text: `run ${id}`,
      toolCalls: [{ name, args: { accountUrl: "https://x.com/a" } }],
      toolResults: [{ name, result }]
    }
  };
}

function toolMessagesOf(messages: ReturnType<typeof historyRowsToReplayMessages>) {
  return messages.filter((message) => message.role === "tool");
}

function textOf(message: { content: string | unknown[] }): string {
  return typeof message.content === "string" ? message.content : "";
}

describe("agent history replay", () => {
  it("replays every tool run verbatim when the session has few tool runs", () => {
    const rows = [1, 2, 3].flatMap((id) => [
      userRow(id * 10, `question ${id}`),
      toolRunRow(id, { investigation: { scores: { content: 70 } }, snapshotSaved: true })
    ]);

    const messages = historyRowsToReplayMessages(rows);
    const toolMessages = toolMessagesOf(messages);

    expect(toolMessages).toHaveLength(3);
    for (const message of toolMessages) {
      expect(message.content).not.toContain(CONDENSED_PREFIX);
      expect(message.content).toContain("snapshotSaved");
    }
    // Shape stays OpenAI-compatible: each assistant tool_call is answered.
    const assistantWithCalls = messages.filter((message) => message.role === "assistant" && message.tool_calls);
    expect(assistantWithCalls).toHaveLength(3);
    for (const assistant of assistantWithCalls) {
      const callId = assistant.tool_calls![0].id;
      expect(messages.some((message) => message.role === "tool" && message.tool_call_id === callId)).toBe(true);
    }
  });

  it("condenses the oldest tool runs and keeps the newest six verbatim", () => {
    expect(RECENT_FULL_TOOL_RUNS).toBe(6);
    const bigResult = (id: number) => ({ investigation: { runId: id, padding: "x".repeat(4000) }, snapshotSaved: true });
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((id) => [
      userRow(id * 10, `question ${id}`),
      toolRunRow(id, bigResult(id))
    ]);

    const messages = historyRowsToReplayMessages(rows);
    const toolMessages = toolMessagesOf(messages);

    expect(toolMessages).toHaveLength(8);
    const condensed = toolMessages.slice(0, 2);
    const verbatim = toolMessages.slice(2);

    for (const message of condensed) {
      const content = textOf(message);
      expect(content.startsWith(CONDENSED_PREFIX)).toBe(true);
      expect(content.length).toBeLessThan(700);
      expect(content).toContain("runId");
    }
    for (const message of verbatim) {
      const content = textOf(message);
      expect(content).not.toContain(CONDENSED_PREFIX);
      expect(content).toContain("x".repeat(100));
    }
  });

  it("prefers the result's own summary text when condensing, including one level of nesting", () => {
    const rows = [
      userRow(1, "question"),
      toolRunRow(2, {
        investigation: { summary: "账号整体健康，封面一致性是最大改进点", detail: "y".repeat(3000) },
        snapshotSaved: true
      }),
      ...[3, 4, 5, 6, 7, 8].flatMap((id) => [userRow(id * 10, `q${id}`), toolRunRow(id, { small: id })]),
      // A 9th run pushes the summarized one out of the verbatim window.
      userRow(90, "q9"),
      toolRunRow(9, { small: 9 })
    ];

    const toolMessages = toolMessagesOf(historyRowsToReplayMessages(rows));
    const condensed = toolMessages.find((message) => textOf(message).includes(CONDENSED_PREFIX));

    expect(condensed).toBeDefined();
    expect(textOf(condensed!)).toContain("账号整体健康，封面一致性是最大改进点");
    expect(textOf(condensed!)).not.toContain("y".repeat(100));
  });

  it("keeps small earlier results untouched without a condensation prefix", () => {
    const rows = [
      userRow(1, "question"),
      toolRunRow(2, { ok: true, note: "tiny" }),
      ...[3, 4, 5, 6, 7, 8].flatMap((id) => [userRow(id * 10, `q${id}`), toolRunRow(id, { small: id })]),
      userRow(90, "q9"),
      toolRunRow(9, { small: 9 })
    ];

    const toolMessages = toolMessagesOf(historyRowsToReplayMessages(rows));
    expect(toolMessages[0].content).toBe(JSON.stringify({ ok: true, note: "tiny" }));
  });

  it("falls back to a restored placeholder when a stored result is missing", () => {
    const rows = [
      {
        id: 1,
        role: "assistant",
        content: { text: "run 1", toolCalls: [{ name: "ask_user", args: {} }], toolResults: [] }
      },
      ...[2, 3, 4, 5, 6, 7].flatMap((id) => [userRow(id * 10, `q${id}`), toolRunRow(id, { small: id })]),
      userRow(80, "q8"),
      toolRunRow(8, { small: 8 })
    ];

    const toolMessages = toolMessagesOf(historyRowsToReplayMessages(rows));
    expect(toolMessages[0].content).toBe(JSON.stringify({ restored: true }));
  });

  it("keeps plain assistant rows and user rows unchanged, including error notes", () => {
    const messages = historyRowsToReplayMessages([
      userRow(1, "question"),
      { id: 2, role: "assistant", content: { error: "upstream 503 (technical)", errorCode: "AGENT_RUN_FAILED" } },
      { id: 3, role: "assistant", content: { text: "plain answer" } },
      { id: 4, role: "system", content: { text: "ignored" } }
    ]);

    expect(messages).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "[This turn failed with a technical error and can be retried.]" },
      { role: "assistant", content: "plain answer" }
    ]);
  });
});
