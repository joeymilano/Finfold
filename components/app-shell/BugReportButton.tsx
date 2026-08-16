"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bug,
  CheckCircle2,
  Loader2,
  MapPin,
  X
} from "@/components/ui/icons";
import { useLocale } from "@/hooks/useLocale";

type SubmitState = "idle" | "submitting" | "submitted";
const TRIGGER_DISMISS_KEY = "finfold-bug-report-trigger-dismissed-v1";

const copy = {
  zh: {
    trigger: "反馈BUG",
    eyebrow: "产品反馈",
    title: "哪里不对劲？",
    intro: "告诉我你遇到了什么。我会直接在邮箱里收到这条反馈和当前页面信息。",
    summary: "一句话概括",
    summaryPlaceholder: "例如：保存内容包后页面一直转圈",
    description: "发生了什么",
    descriptionPlaceholder: "你原本想完成什么？实际发生了什么？",
    steps: "如何复现（选填）",
    stepsPlaceholder: "1. 打开……\n2. 点击……\n3. 出现……",
    context: "当前页面与浏览器信息会自动附上",
    privacy: "你的登录邮箱只用于让我回复这条反馈。",
    cancel: "取消",
    submit: "反馈BUG",
    submitting: "正在发送",
    successTitle: "已经送到我的邮箱",
    successBody: "谢谢你帮我发现这个问题。我会根据你的登录邮箱直接回复你。",
    done: "完成",
    dismissTrigger: "隐藏反馈按钮",
    close: "关闭反馈窗口",
    fallbackError: "暂时没能送达，请稍后再试。",
    loginError: "请先登录，再提交 Bug 反馈。"
  },
  en: {
    trigger: "Report a bug",
    eyebrow: "Product feedback",
    title: "What went wrong?",
    intro: "Tell me what happened. I’ll receive the report and current page context directly in my inbox.",
    summary: "Short summary",
    summaryPlaceholder: "e.g. Saving a kit leaves the page spinning",
    description: "What happened",
    descriptionPlaceholder: "What were you trying to do, and what happened instead?",
    steps: "Steps to reproduce (optional)",
    stepsPlaceholder: "1. Open…\n2. Click…\n3. See…",
    context: "Current page and browser details are attached automatically",
    privacy: "Your login email is only used so I can reply to this report.",
    cancel: "Cancel",
    submit: "Report bug",
    submitting: "Sending",
    successTitle: "It’s in my inbox",
    successBody: "Thanks for helping me spot this. I’ll reply directly to your login email.",
    done: "Done",
    dismissTrigger: "Hide bug report button",
    close: "Close feedback dialog",
    fallbackError: "Your report could not be delivered. Please try again shortly.",
    loginError: "Please log in before sending a bug report."
  }
} as const;

export function BugReportButton() {
  const locale = useLocale();
  const c = copy[locale];
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [triggerVisible, setTriggerVisible] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TRIGGER_DISMISS_KEY)) setTriggerVisible(false);
    } catch {
      // A storage failure should never block the feedback channel.
    }
  }, []);

  function dismissTrigger() {
    try {
      window.localStorage.setItem(TRIGGER_DISMISS_KEY, "1");
    } catch {
      // The button still hides for this render if storage is unavailable.
    }
    setTriggerVisible(false);
  }

  const closeDialog = useCallback(() => {
    if (state === "submitting") return;
    setOpen(false);
    setError("");
    if (state === "submitted") {
      setTitle("");
      setDescription("");
      setSteps("");
      setState("idle");
    }
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 40);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && state !== "submitting") closeDialog();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled])"
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDialog, open, state]);

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("submitting");

    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          steps,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          locale
        })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(response.status === 401 ? c.loginError : data.error || c.fallbackError);
      }
      setState("submitted");
    } catch (caught) {
      setState("idle");
      setError(caught instanceof Error ? caught.message : c.fallbackError);
    }
  }

  return (
    <>
      {triggerVisible ? (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-30 flex items-center gap-1 lg:bottom-6 lg:right-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-ring group flex h-11 items-center gap-2 rounded-full border border-hairline bg-surface/95 px-3 text-xs font-semibold text-fg shadow-raised backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-action/50 hover:text-action-strong dark:hover:text-action lg:h-10"
            aria-haspopup="dialog"
            aria-label={c.trigger}
          >
            <span aria-hidden="true" className="relative flex h-6 w-6 items-center justify-center rounded-full bg-action/[0.1] text-action-strong transition-colors group-hover:bg-action group-hover:text-on-action dark:text-action">
              <Bug className="h-3.5 w-3.5" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-risk ring-2 ring-surface" />
            </span>
            <span className="hidden sm:inline">{c.trigger}</span>
          </button>
          <button
            type="button"
            onClick={dismissTrigger}
            aria-label={c.dismissTrigger}
            title={c.dismissTrigger}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-surface/95 text-fg-muted shadow-panel transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-bg/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={c.close}
            onClick={closeDialog}
            disabled={state === "submitting"}
          />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
            className="rk-enter relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface shadow-raised sm:max-w-xl sm:rounded-2xl"
          >
            <div className="h-1 w-full bg-gradient-to-r from-action via-info to-risk" />
            <div className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2 !text-action-strong dark:!text-action">{c.eyebrow}</p>
                  <h2 id="bug-report-title" className="text-xl font-bold tracking-tight text-fg sm:text-2xl">
                    {state === "submitted" ? c.successTitle : c.title}
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
                    {state === "submitted" ? c.successBody : c.intro}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  aria-label={c.close}
                  disabled={state === "submitting"}
                  className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {state === "submitted" ? (
                <div className="grid gap-5">
                  <div className="flex min-h-40 items-center justify-center rounded-xl border border-positive/25 bg-positive/10">
                    <div className="text-center">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-positive" />
                      <p className="mt-3 text-sm font-semibold text-fg">Finfold → Joey</p>
                      <p className="mt-1 text-xs text-fg-muted">{c.privacy}</p>
                    </div>
                  </div>
                  <button type="button" onClick={closeDialog} className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition hover:bg-action-strong">
                    {c.done}
                  </button>
                </div>
              ) : (
                <form onSubmit={submitReport} className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-semibold text-fg">
                    {c.summary}
                    <input
                      ref={titleRef}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={c.summaryPlaceholder}
                      minLength={4}
                      maxLength={120}
                      required
                      disabled={state === "submitting"}
                      className="focus-ring h-11 rounded-lg border border-hairline bg-bg/55 px-3 text-sm font-normal text-fg outline-none placeholder:text-fg-muted/65 focus:border-action disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-fg">
                    {c.description}
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={c.descriptionPlaceholder}
                      minLength={10}
                      maxLength={4000}
                      required
                      disabled={state === "submitting"}
                      rows={4}
                      className="focus-ring resize-y rounded-lg border border-hairline bg-bg/55 px-3 py-2.5 text-sm font-normal leading-relaxed text-fg outline-none placeholder:text-fg-muted/65 focus:border-action disabled:opacity-60"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-fg">
                    {c.steps}
                    <textarea
                      value={steps}
                      onChange={(event) => setSteps(event.target.value)}
                      placeholder={c.stepsPlaceholder}
                      maxLength={2000}
                      disabled={state === "submitting"}
                      rows={3}
                      className="focus-ring resize-y rounded-lg border border-hairline bg-bg/55 px-3 py-2.5 text-sm font-normal leading-relaxed text-fg outline-none placeholder:text-fg-muted/65 focus:border-action disabled:opacity-60"
                    />
                  </label>

                  <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span>{c.context}<br />{c.privacy}</span>
                  </div>

                  {error ? (
                    <p role="alert" className="rounded-lg border border-risk/30 bg-risk/10 px-3 py-2.5 text-sm text-risk">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeDialog}
                      disabled={state === "submitting"}
                      className="focus-ring rounded-lg border border-hairline px-4 py-2.5 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                    >
                      {c.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={state === "submitting"}
                      className="focus-ring inline-flex min-h-10 min-w-36 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition hover:bg-action-strong disabled:opacity-60"
                    >
                      {state === "submitting" ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />{c.submitting}</>
                      ) : (
                        <>{c.submit}<ArrowRight className="h-4 w-4" /></>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
