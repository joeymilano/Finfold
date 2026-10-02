"use client";

import React from "react";
import { Layers, Paperclip, X } from "@/components/ui/icons";
import type { AgentAttachment } from "@/lib/agent/attachments";

export type QueuedAgentTask = {
  id: number;
  message: string;
  /** Snapshot of attachments captured when the task joined the queue. */
  attachments?: AgentAttachment[];
};

type AgentQueuedTasksProps = {
  locale: "zh" | "en";
  items: QueuedAgentTask[];
  onDiscard: (id: number) => void;
};

const MAX_VISIBLE = 4;

/**
 * Stacked queue of tasks the user submitted while another task is running
 * (Codex-style steering). Tasks run one by one in submit order after the
 * current task finishes; each can be discarded before it starts.
 */
export function AgentQueuedTasks({ locale, items, onDiscard }: AgentQueuedTasksProps) {
  if (items.length === 0) return null;

  const copy = locale === "zh"
    ? {
        label: "排队任务",
        summary: (count: number) => `${count} 条任务排队，当前任务结束后依次执行`,
        overflow: (count: number) => `还有 ${count} 条`,
        discard: "放弃这条排队任务",
        attachments: (count: number) => `${count} 个附件`
      }
    : {
        label: "Queued tasks",
        summary: (count: number) => `${count} queued — each starts when the previous task finishes`,
        overflow: (count: number) => `${count} more`,
        discard: "Discard this queued task",
        attachments: (count: number) => `${count} attachment${count > 1 ? "s" : ""}`
      };

  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - visible.length;

  return (
    <div
      className="rounded-2xl border border-hairline bg-surface-2/60 p-2"
      role="list"
      aria-label={copy.label}
    >
      <p className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11px] font-bold text-fg-muted">
        <Layers className="h-3.5 w-3.5 shrink-0 text-action-strong dark:text-action" />
        {copy.summary(items.length)}
      </p>
      <ul className="flex flex-col gap-1">
        {visible.map((item, index) => (
          <li
            key={item.id}
            role="listitem"
            className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-2.5 py-1.5"
          >
            <span
              aria-hidden="true"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-action/[0.1] text-[10px] font-bold text-action-strong dark:text-action"
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg" title={item.message}>
              {item.message}
            </span>
            {item.attachments && item.attachments.length > 0 ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2/70 px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">
                <Paperclip className="h-3 w-3" />
                {copy.attachments(item.attachments.length)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onDiscard(item.id)}
              className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
              aria-label={`${copy.discard}: ${item.message.slice(0, 60)}`}
              title={copy.discard}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 ? (
        <p className="px-2.5 pt-1.5 text-[11px] font-semibold text-fg-subtle">{copy.overflow(overflow)}</p>
      ) : null}
    </div>
  );
}
