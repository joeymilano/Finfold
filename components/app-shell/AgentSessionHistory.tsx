"use client";

import React, { useEffect, useState } from "react";
import { History, Loader2, Trash2 } from "@/components/ui/icons";

export type AgentSessionSummary = {
  id: string;
  title: string;
  updated_at: string;
};

type AgentSessionHistoryProps = {
  sessions: AgentSessionSummary[];
  currentSessionId: string | null;
  locale: "zh" | "en";
  loading?: boolean;
  onSelect: (session: AgentSessionSummary) => void | Promise<void>;
  onDelete: (session: AgentSessionSummary) => void | Promise<void>;
};

function formatSessionTime(value: string, locale: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function AgentSessionHistory({
  sessions,
  currentSessionId,
  locale,
  loading = false,
  onSelect,
  onDelete
}: AgentSessionHistoryProps) {
  const [managing, setManaging] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const zh = locale === "zh";

  useEffect(() => {
    if (pendingDeleteId && !sessions.some((session) => session.id === pendingDeleteId)) {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, sessions]);

  async function confirmDelete(session: AgentSessionSummary) {
    setDeletingId(session.id);
    try {
      await onDelete(session);
      setPendingDeleteId(null);
    } catch {
      // The parent surface presents the error and the confirmation stays open for retry.
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-label={zh ? "历史对话" : "Conversation history"}>
      <div className="mb-2 flex items-center justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{zh ? "历史对话" : "Conversation history"}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-fg-muted">
            {zh ? "选择一段继续，或管理不再需要的对话。" : "Continue a conversation or remove one you no longer need."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-action" /> : null}
          {sessions.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setManaging((current) => !current);
                setPendingDeleteId(null);
              }}
              className="focus-ring rounded-lg px-2 py-1 text-[11px] font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              {managing ? (zh ? "完成" : "Done") : (zh ? "管理" : "Manage")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        {!loading && sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline px-3 py-8 text-center text-xs text-fg-muted">
            {zh ? "还没有历史对话" : "No previous conversations yet"}
          </div>
        ) : null}

        {sessions.map((session) => {
          const title = session.title || (zh ? "未命名对话" : "Untitled conversation");
          const pending = pendingDeleteId === session.id;
          const deleting = deletingId === session.id;

          if (pending) {
            return (
              <div key={session.id} className="rounded-xl border border-negative/35 bg-negative/[0.045] px-3 py-2.5">
                <p className="truncate text-xs font-bold text-fg">{title}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-fg-muted">{zh ? "删除后无法恢复" : "This cannot be undone"}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      disabled={deleting}
                      className="focus-ring rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                    >
                      {zh ? "取消" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmDelete(session)}
                      disabled={deleting}
                      aria-label={`${zh ? "确认删除" : "Confirm delete"}: ${title}`}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-negative px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {zh ? "删除" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={session.id}
              className={`group flex items-center gap-1 rounded-xl border transition ${session.id === currentSessionId
                ? "border-action/25 bg-action/[0.06]"
                : "border-hairline bg-surface hover:border-action/30 hover:bg-action/[0.025]"}`}
            >
              <button
                type="button"
                onClick={() => void onSelect(session)}
                aria-label={title}
                className="focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted transition group-hover:text-action-strong dark:group-hover:text-action">
                  <History className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-fg">{title}</span>
                  <span className="mt-0.5 block text-[10px] text-fg-subtle">{formatSessionTime(session.updated_at, locale)}</span>
                </span>
                {session.id === currentSessionId ? (
                  <span className="rounded-full bg-action/[0.1] px-2 py-0.5 text-[10px] font-bold text-action-strong dark:text-action">
                    {zh ? "当前" : "Current"}
                  </span>
                ) : null}
              </button>

              {managing ? (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(session.id)}
                  aria-label={`${zh ? "删除对话" : "Delete conversation"}: ${title}`}
                  className="focus-ring mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition hover:bg-negative/[0.1] hover:text-negative"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
