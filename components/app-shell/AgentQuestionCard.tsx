"use client";

import React, { useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "@/components/ui/icons";
import {
  buildAskUserAnswer,
  orderAskUserOptionsForLocale,
  type AskUserQuestion
} from "@/lib/agent/ask-user";

/**
 * Tappable clarification card for the `ask_user` tool result.
 *
 * The Agent asks structured questions with concrete options; the user answers
 * by tapping instead of typing. Picks are sent back as a normal user message,
 * keeping the clarification inside the conversation flow.
 */
export function AgentQuestionCard({
  questions,
  locale,
  onAnswer,
  interactive
}: {
  questions: AskUserQuestion[];
  locale: "zh" | "en";
  onAnswer?: (answer: string) => void | Promise<void>;
  /** False for restored history: render read-only, no send button. */
  interactive?: boolean;
}) {
  const zh = locale === "zh";
  const [picks, setPicks] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, []]))
  );
  const [sentAnswers, setSentAnswers] = useState<Record<string, string[]> | null>(null);
  const [sending, setSending] = useState(false);
  const submittingRef = useRef(false);
  const settled = !interactive || sentAnswers !== null;
  const shown = sentAnswers ?? picks;
  const autoSubmitSingleChoice = Boolean(onAnswer)
    && questions.length === 1
    && !questions[0]?.multiple;
  const canSubmit = interactive
    && Boolean(onAnswer)
    && questions.some((question) => (picks[question.id] ?? []).length > 0)
    && !sending;

  function toggle(question: AskUserQuestion, label: string) {
    if (settled) return;
    const existing = picks[question.id] ?? [];
    const next = {
      ...picks,
      [question.id]: question.multiple
        ? existing.includes(label)
          ? existing.filter((item) => item !== label)
          : [...existing, label]
        : [label]
    };
    setPicks(next);
    if (autoSubmitSingleChoice && onAnswer) void submit(next);
  }

  function submit(nextPicks = picks) {
    if (!interactive || submittingRef.current || sentAnswers || !onAnswer) return;
    const answer = buildAskUserAnswer(
      questions.map((question) => ({ question, labels: nextPicks[question.id] ?? [] })),
      locale
    );
    if (!answer) return;
    submittingRef.current = true;
    setSending(true);
    setSentAnswers(nextPicks);
    const finish = () => {
      submittingRef.current = false;
      setSending(false);
    };
    const fail = () => {
      setSentAnswers(null);
      finish();
    };
    try {
      const pending = onAnswer(answer);
      if (pending && typeof pending.then === "function") {
        void pending.then(finish).catch(fail);
      } else {
        finish();
      }
    } catch {
      fail();
    }
  }

  return (
    <div className="rounded-xl border border-action/25 bg-action/[0.06] p-3">
      <div className="grid gap-3">
        {questions.map((question) => {
          const selected = shown[question.id] ?? [];
          return (
            <div key={question.id}>
              <p className="text-xs font-semibold leading-5 text-fg">
                {question.question}
                {question.multiple ? (
                  <span className="ml-1.5 text-[10px] font-medium text-fg-muted">{zh ? "可多选" : "multi-select"}</span>
                ) : null}
              </p>
              <div className="mt-1.5 grid gap-1.5">
                {orderAskUserOptionsForLocale(question.options, locale, question.id).map((option) => {
                  const isSelected = selected.includes(option.label);
                  const isRecommended = question.recommended === option.label;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={settled}
                      aria-pressed={isSelected}
                      onClick={() => toggle(question, option.label)}
                      className={`focus-ring w-full rounded-lg border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-action/60 bg-action/[0.12]"
                          : "border-hairline bg-surface hover:border-action/35"
                      } ${settled ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {isSelected ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-action-strong dark:text-action" />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-hairline" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-fg">{option.label}</span>
                          {option.description ? (
                            <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">{option.description}</span>
                          ) : null}
                        </span>
                        {isRecommended ? (
                          <span className="shrink-0 rounded-full border border-action/30 bg-action/[0.09] px-2 py-0.5 text-[10px] font-bold text-action-strong dark:text-action">
                            {zh ? "推荐" : "Suggested"}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {interactive ? (
        sentAnswers ? (
          <p className="mt-2.5 text-[11px] font-semibold text-positive">
            {zh ? "选择已发送，正在继续任务" : "Choices sent — continuing"}
          </p>
        ) : autoSubmitSingleChoice ? (
          <p className="mt-2.5 text-[11px] font-medium text-fg-muted">
            {zh ? "点选后会立即继续，无需再输入“继续”" : "Tap once to continue — no follow-up message needed"}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="focus-ring mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-3 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {zh ? "发送选择" : "Send choices"}
          </button>
        )
      ) : (
        <p className="mt-2.5 text-[11px] text-fg-muted">
          {zh ? "这轮提问已结束" : "This question round is closed"}
        </p>
      )}
    </div>
  );
}
