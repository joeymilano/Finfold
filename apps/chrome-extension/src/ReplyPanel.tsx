import { useEffect, useRef, useState, type ReactNode } from "react";
import { authenticatedRequest, getSessionInfo, hasLocalSession, locateReplyControls, reportReplyOutcome, signIn, signOut, type ExtensionSession } from "./api";
import { isChinese, useUiLocale } from "./i18n";
import { EMPTY_REPLY, replyIntent, restoreReply, type ReplyInput, type ReplyResult, type ReplyState } from "./reply";
import {
  AUTO_DAY_LIMIT, AUTO_FAIL_STOP, AUTO_LEDGER_KEY, AUTO_SWITCH_KEY, emptyLedger, markHandled, nextAutoTarget,
  restoreLedger, rollLedger, type AutoLedger, type AutoLogEntry, type AutoOutcome, type AutoPause
} from "./autopilot";
import type { AutomationSendResult, CapturedComment, ReplyContextResponse, ReplyPlatform } from "./types";
import { requestPilotOrigins } from "./permissions";
import { compressImage, imageFromClipboard } from "./image";
import { AccountBar } from "./AccountBar";

import { Brand, ThemeButton, LanguageButton } from "./Brand";

const KEY = "finfoldReplyState";
const say = (zh: string, en: string) => isChinese ? zh : en;
type SendOutcome = "sent" | "typed" | "copied" | "failed";

function sendMessage<T>(message: unknown): Promise<T | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<T | undefined>;
}

// Tiered auto-send shared by the manual button and Autopilot: DOM automation
// in the tab, then one vision-locate pass over a screenshot. Returns the raw
// outcome; callers add their own copy fallback and outcome reporting.
async function deliverReply(options: {
  platform: ReplyPlatform;
  commentText: string;
  replyText: string;
  visionAllowed: boolean;
}): Promise<"sent" | "typed" | "failed"> {
  const dom = await sendMessage<AutomationSendResult>({
    type: "AUTOMATION", action: "send_dom",
    platform: options.platform, commentText: options.commentText, replyText: options.replyText
  });
  if (dom?.status === "sent") return "sent";
  if (dom?.status === "typed") return "typed";
  if (options.visionAllowed) {
    const shot = await sendMessage<{ ok: boolean; dataUrl?: string }>({ type: "AUTOMATION", action: "screenshot" });
    if (shot?.ok && shot.dataUrl) {
      // Normalized 0..1 coordinates are converted against the tab's own
      // viewport inside the page, so no panel-side scaling is needed.
      const located = await locateReplyControls(shot.dataUrl, options.platform, options.commentText.slice(0, 300)).catch(() => undefined);
      if (located?.replyInput) {
        const vision = await sendMessage<AutomationSendResult>({
          type: "AUTOMATION", action: "vision_send",
          replyText: options.replyText, inputPoint: located.replyInput,
          sendPoint: located.sendButton ?? undefined
        });
        if (vision?.status === "sent") return "sent";
        if (vision?.status === "typed") return "typed";
      }
    }
  }
  return "failed";
}

export function ReplyPanel({ onBusy, navigation }: { onBusy?: (busy: boolean) => void; navigation?: ReactNode }) {
  useUiLocale();
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [state, setState] = useState<ReplyState>({ userId: "", input: { ...EMPTY_REPLY }, result: null, editedBody: "", savedAt: Date.now() });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [capture, setCapture] = useState<ReplyContextResponse | null>(null);
  const [visionAllowed, setVisionAllowed] = useState(true);
  const [sendOutcome, setSendOutcome] = useState<SendOutcome | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLog, setAutoLog] = useState<AutoLogEntry[]>([]);
  const [autoStatus, setAutoStatus] = useState<{ generatedToday: number; paused: AutoPause }>({ generatedToday: 0, paused: "" });
  const ledger = useRef<AutoLedger>(emptyLedger());
  const autoBusy = useRef(false);
  const lastAutoInput = useRef("");
  const active = useRef(true);
  const lock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = state.input;
  const changed = Boolean(state.result && state.resultIntent !== replyIntent(input));

  async function loadSession() {
    const info = await getSessionInfo();
    if (!active.current) return;
    setSession(info);
    if (!info.userId) return;
    const stored = await chrome.storage.session.get(KEY);
    const restored = restoreReply(stored[KEY], info.userId);
    if (active.current) setState((current) => restored ?? { ...current, userId: info.userId! });
  }
  async function captureNow() {
    setCapture(await sendMessage<ReplyContextResponse>({ type: "AUTOMATION", action: "capture" }) ?? { ok: false, code: "UNKNOWN_ERROR" });
  }
  useEffect(() => {
    active.current = true;
    void hasLocalSession().then(async (yes) => { if (yes) await loadSession(); })
      .catch((cause) => { if (active.current) setError(cause); })
      .finally(() => { if (active.current) setReady(true); });
    void chrome.storage.local.get("finfoldVisionLocate").then((stored) => {
      if (active.current) setVisionAllowed(stored.finfoldVisionLocate !== false);
    }).catch(() => undefined);
    void chrome.storage.local.get([AUTO_SWITCH_KEY, AUTO_LEDGER_KEY]).then((stored) => {
      if (!active.current) return;
      ledger.current = restoreLedger(stored[AUTO_LEDGER_KEY]);
      setAutoStatus({ generatedToday: ledger.current.generatedToday, paused: ledger.current.pausedReason });
      if (stored[AUTO_SWITCH_KEY] === true) setAutoOn(true);
    }).catch(() => undefined);
    void captureNow();
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (ready && state.userId) void chrome.storage.session.set({ [KEY]: state }).catch(() => setError(new Error("STORAGE_UNAVAILABLE")));
  }, [ready, state]);

  // The side panel outlives tab switches and navigation, but the capture it
  // ran on mount goes stale the moment the user moves to another page. Any
  // tab activation or finished navigation re-captures (debounced, never while
  // a paid request or an auto-send is in flight).
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      if (lock.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!lock.current) void captureNow(); }, 600);
    };
    const onActivated = () => schedule();
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === "complete") schedule();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      window.clearTimeout(timer);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  // Auto-fill the first captured comment (or the one matching the user's
  // selection) and the post context, but never overwrite existing input.
  useEffect(() => {
    if (!capture?.ok || input.comment.trim()) return;
    const selected = capture.selection
      ? capture.comments.find((comment) => comment.text.includes(capture.selection) || capture.selection.includes(comment.text))
      : undefined;
    const pick = selected ?? (capture.comments.length === 1 ? capture.comments[0] : undefined);
    setState((current) => ({
      ...current,
      input: {
        ...current.input,
        platform: capture.platform,
        comment: pick ? pick.text : current.input.comment,
        postContext: current.input.postContext.trim() ? current.input.postContext : capture.postText.slice(0, 4_000)
      },
      savedAt: Date.now()
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture]);

  function update<K extends keyof ReplyInput>(key: K, value: ReplyInput[K]) {
    setState((current) => ({ ...current, input: { ...current.input, [key]: value }, savedAt: Date.now() }));
    setReviewed(false);
    setCopied(false);
    setSendOutcome(null);
    setError(null);
  }
  function pickComment(comment: CapturedComment) {
    if (busy || autoBusy.current) return;
    setState((current) => ({ ...current, input: { ...current.input, comment: comment.text }, savedAt: Date.now() }));
    setReviewed(false);
    setCopied(false);
    setSendOutcome(null);
  }
  function toggleVision(allowed: boolean) {
    setVisionAllowed(allowed);
    void chrome.storage.local.set({ finfoldVisionLocate: allowed }).catch(() => undefined);
  }
  function working(value: boolean) { lock.current = value; setBusy(value); onBusy?.(value); }
  // Screenshot intake: one compressed jpeg, entered by paste, drop or picker.
  async function attachImage(file: Blob | null | undefined) {
    if (!file || lock.current) return;
    try { update("commentImage", await compressImage(file)); }
    catch (cause) { setError(cause); }
  }
  async function login() {
    if (lock.current) return;
    working(true); setError(null);
    try { await signIn(); await loadSession(); } catch (cause) { setError(cause); }
    finally { working(false); }
  }
  async function logout() {
    if (lock.current) return;
    working(true);
    try {
      await signOut(); setSession(null); setReviewed(false); setCopied(false); setSendOutcome(null);
      setState({ userId: "", input: { ...EMPTY_REPLY }, result: null, editedBody: "", savedAt: Date.now() });
    } catch (cause) { setError(cause); } finally { working(false); }
  }
  // Generates a reply draft for the given input. The manual form calls it
  // with the rendered input (and requires the review checkbox); Autopilot
  // calls it with its own input and skips the checkbox. The state updates
  // always adopt forInput, so callers never need to pre-sync state.
  async function generate(forInput: ReplyInput = input, options?: { skipReview?: boolean }): Promise<
    { ok: true; result: ReplyResult; requestId: string } | { ok: false; code: string }
  > {
    if (lock.current || !session?.userId || !session.replyDraftsEnabled
      || (!forInput.comment.trim() && !forInput.commentImage)
      || (!options?.skipReview && !reviewed)) return { ok: false, code: "SKIPPED" };
    working(true); setError(null); setCopied(false); setSendOutcome(null);
    const intent = replyIntent(forInput);
    const pending = state.pending?.intent === intent ? state.pending : { intent, requestId: crypto.randomUUID() };
    const next = { ...state, input: forInput, pending, savedAt: Date.now() };
    setState(next);
    try {
      const currentSession = await getSessionInfo();
      if (currentSession.userId !== session.userId) {
        setSession(currentSession); setReviewed(false);
        setState({ userId: currentSession.userId || "", input: { ...EMPTY_REPLY }, result: null, editedBody: "", savedAt: Date.now() });
        throw new Error("IDENTITY_CHANGED");
      }
      if (currentSession.brandName !== session.brandName) {
        setSession(currentSession); setReviewed(false);
        throw new Error("IDENTITY_CHANGED");
      }
      if (!currentSession.replyDraftsEnabled) { setSession(currentSession); throw new Error("PILOT_NOT_AVAILABLE"); }
      // Persist before any paid request so a closed panel can safely retry.
      await chrome.storage.session.set({ [KEY]: next });
      const response = await authenticatedRequest<{ result: ReplyResult; cost: number; availableCredits: number }>(
        "/api/extension/v1/reply-drafts", {
          method: "POST",
          body: JSON.stringify({ requestId: pending.requestId, ...forInput, commentImage: forInput.commentImage || undefined })
        }
      );
      const completed: ReplyState = { ...next, pending: undefined, result: response.result,
        editedBody: response.result.body, resultIntent: intent, resultRequestId: pending.requestId, savedAt: Date.now() };
      setState(completed); setSession({ ...session, availableCredits: response.availableCredits }); setReviewed(false);
      await chrome.storage.session.set({ [KEY]: completed });
      return { ok: true, result: response.result, requestId: pending.requestId };
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (["GENERATION_FAILED", "REQUEST_ALREADY_FAILED", "INSUFFICIENT_CREDITS", "RESULT_EXPIRED", "FREE_POOL_UNAVAILABLE", "REQUEST_CONFLICT"].includes(code)) {
        setState((current) => ({ ...current, pending: undefined }));
      }
      setError(cause);
      return { ok: false, code };
    } finally { working(false); }
  }

  // Tiered auto-send: DOM automation in the tab, then one vision-locate pass
  // over a screenshot, and finally an automatic copy so nothing is lost.
  // finishSend records the outcome both in the UI and server-side; the
  // telemetry report is fire-and-forget and never blocks or fails a send.
  const finishSend = (outcome: SendOutcome) => {
    setSendOutcome(outcome);
    if (state.resultRequestId) {
      void reportReplyOutcome({ requestId: state.resultRequestId, platform: input.platform, outcome }).catch(() => undefined);
    }
  };
  async function sendReply() {
    if (lock.current || autoBusy.current || !state.result || state.result.status !== "draft" || changed || !state.editedBody.trim()) return;
    working(true); setSendOutcome(null); setCopied(false);
    const fallbackToCopy = async () => {
      try { await navigator.clipboard.writeText(state.editedBody); finishSend("copied"); }
      catch { finishSend("failed"); }
    };
    try {
      const outcome = await deliverReply({ platform: input.platform, commentText: input.comment, replyText: state.editedBody, visionAllowed });
      if (outcome === "failed") { await fallbackToCopy(); return; }
      finishSend(outcome);
    } catch {
      await fallbackToCopy();
    } finally { working(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(state.editedBody); setCopied(true); }
    catch { setError(new Error("COPY_FAILED")); }
  }

  // ---- Autopilot: capture → generate → send, one comment at a time ----

  function saveLedger() {
    setAutoStatus({ generatedToday: ledger.current.generatedToday, paused: ledger.current.pausedReason });
    void chrome.storage.local.set({ [AUTO_LEDGER_KEY]: ledger.current }).catch(() => undefined);
  }
  function pauseAuto(reason: AutoPause) {
    ledger.current.pausedReason = reason;
    saveLedger();
  }
  function toggleAuto(on: boolean) {
    setAutoOn(on);
    void chrome.storage.local.set({ [AUTO_SWITCH_KEY]: on }).catch(() => undefined);
    if (on) {
      // A fresh switch-on always clears a past pause; daily counters remain.
      ledger.current.pausedReason = "";
      saveLedger();
      void captureNow();
    }
  }

  async function runAutoItem(target: CapturedComment) {
    // The process effect only calls this with an ok capture; re-check so the
    // narrowing holds even if a stale cycle races a page change.
    if (!capture?.ok) return;
    autoBusy.current = true;
    setAutoRunning(true);
    const platform = capture.platform;
    // Language follows the panel's reply-language setting; the rest is a
    // self-contained input so a user's in-flight manual fields are not mixed in.
    const autoInput: ReplyInput = {
      platform, comment: target.text, commentImage: "",
      postContext: capture.postText.slice(0, 4_000), conversation: "", intent: "",
      language: input.language
    };
    lastAutoInput.current = target.text;
    const log = (outcome: AutoOutcome, detail?: string) => {
      setAutoLog((entries) => [{ at: Date.now(), comment: target.text.slice(0, 120), outcome, detail }, ...entries].slice(0, 20));
    };
    try {
      const generated = await generate(autoInput, { skipReview: true });
      ledger.current.generatedToday += 1;
      if (!generated.ok) {
        ledger.current.failures += 1;
        markHandled(ledger.current, platform, target, "error");
        log("error", generated.code);
        if (generated.code === "REPLY_DAILY_LIMIT_REACHED") pauseAuto("server_limit");
        else if (generated.code === "INSUFFICIENT_CREDITS") pauseAuto("credits");
        else if (ledger.current.failures >= AUTO_FAIL_STOP) pauseAuto("failures");
        return;
      }
      ledger.current.failures = 0;
      if (generated.result.status !== "draft") {
        // needs_context drafts are never auto-sent; the log surfaces them.
        markHandled(ledger.current, platform, target, "needs_context");
        log("needs_context");
        return;
      }
      // A short pause keeps the posting rhythm human-paced.
      await new Promise((resolve) => window.setTimeout(resolve, 2_500));
      const outcome = await deliverReply({ platform, commentText: target.text, replyText: generated.result.body, visionAllowed });
      markHandled(ledger.current, platform, target, outcome);
      log(outcome);
      void reportReplyOutcome({ requestId: generated.requestId, platform, outcome }).catch(() => undefined);
    } finally {
      saveLedger();
      autoBusy.current = false;
      setAutoRunning(false);
      // Re-capture so the next unhandled comment starts without waiting for
      // the 8s poll; the ledger prevents any double-processing.
      window.setTimeout(() => { if (active.current && !lock.current) void captureNow(); }, 1_200);
    }
  }

  // While Autopilot is on, refresh the capture on a slow poll so newly
  // arriving comments (and SPA navigations) are picked up.
  useEffect(() => {
    if (!autoOn) return;
    const timer = window.setInterval(() => { if (!lock.current && !autoBusy.current) void captureNow(); }, 8_000);
    return () => window.clearInterval(timer);
  }, [autoOn]);

  // Runs after every render: if Autopilot is armed, the page holds comments,
  // and the user is not composing something manually, work the next one.
  useEffect(() => {
    if (!autoOn || !ready || !session?.userId || !session.replyDraftsEnabled) return;
    if (autoBusy.current || lock.current || !capture?.ok) return;
    // Defer while the user is composing something of their own. A comment
    // that matches a captured one is fair game — it may have been auto-filled
    // on mount or picked manually, and Autopilot will process it anyway.
    if (input.comment.trim() && input.comment !== lastAutoInput.current
      && !capture.comments.some((comment) => comment.text === input.comment)) return;
    const rolled = rollLedger(ledger.current);
    if (rolled !== ledger.current) {
      ledger.current = rolled;
      saveLedger();
    }
    if (ledger.current.pausedReason) return;
    if (ledger.current.generatedToday >= AUTO_DAY_LIMIT) { pauseAuto("daily_limit"); return; }
    const target = nextAutoTarget(capture.platform, capture.comments, ledger.current);
    if (target) void runAutoItem(target);
  });

  function captureStatus(): { text: string; retryable: boolean; grantable?: boolean } | null {
    if (!capture) return null;
    if (capture.ok && capture.comments.length > 0) return { text: say(`已从当前页面抓取 ${capture.comments.length} 条评论，点选要回复的一条`, `Captured ${capture.comments.length} comments from this page — pick one to reply to`), retryable: true };
    if (capture.ok && capture.selection) return { text: say("已读取你选中的评论文字", "Read the comment text you selected"), retryable: true };
    if (capture.ok) return { text: say("当前页面没有找到评论，可直接粘贴", "No comments found on this page; paste one instead"), retryable: true };
    if (capture.code === "NOT_REPLY_PLATFORM") return { text: say("自动抓取在小红书、LinkedIn 或 X（帖子详情页）可用；也可以直接粘贴评论。", "Auto-capture works on Xiaohongshu, LinkedIn, or an X post page; you can also paste a comment."), retryable: true };
    if (capture.code === "PERMISSION_DENIED") return { text: say("未能读取页面：点击浏览器工具栏的 Finfold 图标后重试，或直接粘贴评论。", "Could not read the page. Click the Finfold toolbar icon and retry, or paste the comment."), retryable: true, grantable: true };
    return { text: say("当前标签页不可用，可直接粘贴评论。", "This tab is not available; paste the comment instead."), retryable: false };
  }

  async function grantPilotAccess() {
    if (busy) return;
    if (await requestPilotOrigins()) void captureNow();
  }
  const status = captureStatus();

  return <main className="shell reply-shell">
    <header className="masthead">
      <Brand />
      <div className="account-actions">
        <LanguageButton />
        <ThemeButton />
        {!session && <button className="text-button" disabled={!ready || busy} onClick={() => void login()}>{say("登录", "Sign in")}</button>}
      </div>
    </header>
    {session && <AccountBar session={session} busy={!ready || busy} onSignOut={() => void logout()} />}
    {navigation}
    <section className="reply-intro"><p className="eyebrow">{say("评论助手", "REPLY ASSISTANT")}</p>
      <h1>{say("让每一条回复，都有你的语气", "A reply in your own voice")}</h1>
      <p>{say("打开自己帖子页面，Finfold 自动抓取评论、生成回复，你确认后自动发送。", "Open your post — Finfold captures comments, drafts each reply, and sends it after you confirm.")}</p>
    </section>
    <div className="reply-platforms" aria-label={say("回复平台", "Reply platform")}>
      {(["x", "xiaohongshu", "linkedin"] as const).map((platform) => <button key={platform} disabled={busy} aria-pressed={input.platform === platform} onClick={() => update("platform", platform)}><span className={`social-mark ${platform}`} aria-hidden="true">{platform === "linkedin" ? "in" : platform === "x" ? "X" : "小"}</span>{platform === "linkedin" ? "LinkedIn" : platform === "x" ? "X" : say("小红书", "RED")}<span className="platform-check" aria-hidden="true">{input.platform === platform ? "✓" : ""}</span></button>)}
    </div>
    {session?.userId && (
      <section className="reply-autopilot" aria-label={say("自动模式", "Autopilot")}>
        <div className="reply-autopilot-head">
          <div>
            <strong>{say("自动模式", "Autopilot")}</strong>
            <p>{say("打开后无需逐条确认：面板会处理当前页面的评论（含开启前已抓到的），逐条生成并发送回复，每条 3 Credits，可随时关闭。",
              "Skip per-reply confirmation: the panel works through the comments on this page (including ones captured earlier), drafting and sending each reply — 3 Credits apiece. Switch it off any time.")}</p>
          </div>
          <button type="button" role="switch" aria-checked={autoOn} disabled={!ready}
            className={`reply-switch${autoOn ? " on" : ""}`}
            aria-label={say("自动模式开关", "Autopilot switch")}
            onClick={() => toggleAuto(!autoOn)}>
            <span className="reply-switch-knob" aria-hidden="true" />
          </button>
        </div>
        {autoOn && <>
          <p className="reply-autopilot-status" role="status">
            {autoStatus.paused ? autoPauseText(autoStatus.paused)
              : say(`今日已自动处理 ${autoStatus.generatedToday}/${AUTO_DAY_LIMIT} 条`, `${autoStatus.generatedToday}/${AUTO_DAY_LIMIT} handled today`)}
          </p>
          {autoLog.length > 0 && (
            <ul className="reply-autopilot-log" aria-label={say("自动模式记录", "Autopilot log")}>
              {autoLog.map((entry, index) => (
                <li key={index} title={entry.comment}>
                  <span className="log-badge">{autoBadge(entry.outcome)}</span>
                  <span>{entry.comment.length > 60 ? `${entry.comment.slice(0, 60)}…` : entry.comment}</span>
                </li>
              ))}
            </ul>
          )}
        </>}
      </section>
    )}
    {status && <p className="reply-capture-status" role="status">
      {status.text}
      {status.retryable && <button type="button" className="text-button" disabled={busy} onClick={() => void captureNow()}>{say("重新抓取", "Re-capture")}</button>}
      {status.grantable && <button type="button" className="text-button" disabled={busy} onClick={() => void grantPilotAccess()}>{say("始终允许读取", "Always allow")}</button>}
    </p>}
    {capture?.ok && capture.comments.length > 0 && (
      <div className="reply-comments" aria-label={say("抓取到的评论", "Captured comments")}>
        {capture.comments.map((comment, index) => (
          <button type="button" key={index}
            className={input.comment.trim() === comment.text ? "active" : ""}
            disabled={busy}
            onClick={() => pickComment(comment)}>
            {comment.author ? <span className="reply-comment-author">{comment.author}</span> : null}
            <span>{comment.text.length > 120 ? `${comment.text.slice(0, 120)}…` : comment.text}</span>
          </button>
        ))}
      </div>
    )}
    <form onSubmit={(event) => { event.preventDefault(); void generate(); }} className="reply-form">
      <label className="reply-comment-label">
        <span className="reply-label-row">{say("目标评论 · 自动抓取，可修改或贴截图", "Comment to reply to · auto-captured, editable or paste a screenshot")}
          <button type="button" className="text-button attach-button" disabled={busy || Boolean(input.commentImage)} onClick={() => fileInput.current?.click()}>{say("＋截图", "＋Screenshot")}</button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void attachImage(event.target.files?.[0]); event.target.value = ""; }} />
        </span>
        <textarea required={!input.commentImage} maxLength={2000} rows={3} disabled={busy || autoRunning} value={input.comment}
          onChange={(event) => update("comment", event.target.value)}
          onPaste={(event) => {
            const file = imageFromClipboard(event.clipboardData?.items);
            if (file) { event.preventDefault(); void attachImage(file); }
          }}
          onDrop={(event) => {
            const file = event.dataTransfer?.files?.[0];
            if (file && file.type.startsWith("image/")) { event.preventDefault(); void attachImage(file); }
          }}
          placeholder={say("自动抓取的评论会填在这里；也可以直接粘贴文字或截图", "Captured comments appear here; you can also paste text or a screenshot")} />
      </label>
      {input.commentImage && <div className="reply-image-attach" aria-label={say("已附加评论截图", "Comment screenshot attached")}>
        <img src={input.commentImage} alt={say("评论截图", "Comment screenshot")} />
        <button type="button" className="reply-image-remove" disabled={busy} onClick={() => update("commentImage", "")} aria-label={say("移除截图", "Remove screenshot")}>×</button>
        <p>{say("截图已附加，生成时会由 AI 读取，不归档。", "Attached. AI reads it during generation; it is never archived.")}</p>
      </div>}
      <label>{say("原帖背景 · 自动抓取，选填", "Post context · auto-captured, optional")}<textarea maxLength={4000} rows={3} disabled={busy} value={input.postContext} onChange={(event) => update("postContext", event.target.value)} placeholder={say("这篇帖子在讲什么？会自动带出正文，也可以补充相关事实。", "What is the post about? The body is captured automatically; add any extra facts.")} /></label>
      <details><summary>{say("补充前文与回复意图", "Conversation and reply intent")}</summary>
        <label>{say("对话前文 · 选填", "Earlier conversation · optional")}<textarea maxLength={2000} rows={2} disabled={busy} value={input.conversation} onChange={(event) => update("conversation", event.target.value)} /></label>
        <label>{say("我想怎么回复 · 选填", "How I want to respond · optional")}<textarea maxLength={1000} rows={2} disabled={busy} value={input.intent} onChange={(event) => update("intent", event.target.value)} placeholder={say("例如：解释使用方法，简短一点", "For example: explain how it works, keep it brief")} /></label>
      </details>
      <label className="reply-language">{say("回复语言", "Reply language")}<select disabled={busy} value={input.language} onChange={(event) => update("language", event.target.value as ReplyInput["language"])}><option value="auto">{say("跟随评论", "Match comment")}</option><option value="zh">中文</option><option value="en">English</option></select></label>
      <div className="reply-disclosure">
        <strong>{say("回复身份：", "Replying as: ")}{session?.brandName || say("作者本人（未设置品牌）", "Post author (no saved brand)")}</strong>
        <p>{say("每次 3 Credits，信息不足时返回补充问题，也计费。填写内容、截图与品牌背景会交给 Finfold 及 AI 处理；结果保留 24 小时，原评论与截图不归档。确认发送后，扩展会在当前页面找到这条评论的回复框，自动输入并发送。",
          "3 Credits per generation, including requests for missing facts. Your input, screenshots and brand context go to Finfold and its AI service. Results are kept for 24 hours; source comments and screenshots are not archived. After you confirm, the extension finds this comment's reply box on the page, types and sends the reply.")}</p>
        <label className="reply-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />{say("已核对内容与身份，生成这一条回复", "I reviewed the content and identity for this reply")}</label>
        <label className="reply-consent"><input type="checkbox" checked={visionAllowed} disabled={busy} onChange={(event) => toggleVision(event.target.checked)} />{say("回复框定位失败时，允许发送当前页面截图给 Finfold 视觉模型识别位置（即用即弃，不存档）", "If the reply box cannot be found, send a one-off page screenshot to Finfold's vision model to locate it (used once, never stored)")}</label>
      </div>
      {!session ? <button type="button" className="primary reply-submit" disabled={!ready || busy} onClick={() => void login()}>{say("登录后生成回复", "Sign in to generate")}</button>
        : !session.replyDraftsEnabled ? <p className="reply-notice" role="status">{say("当前账号暂未开通回复功能，服务端可能仍在逐步放开。你可以先准备评论内容。", "Reply drafting is not enabled for this account yet — the server may still be rolling it out. You can prepare the comment above.")}</p>
        : <button className="primary reply-submit" type="submit" disabled={busy || autoRunning || !reviewed || (!input.comment.trim() && !input.commentImage) || (session.availableCredits < 3 && !state.pending)}>{busy ? say("正在斟酌回复…", "Preparing your reply…") : state.pending?.intent === replyIntent(input) ? say("恢复上次请求 · 不重复扣费", "Recover request · no duplicate charge") : say("生成回复 · 3 Credits", "Generate reply · 3 Credits")}</button>}
      {session && session.availableCredits < 3 && <p className="reply-notice">{say("Credits 不足，编辑和复制已有草稿仍然免费。", "Not enough Credits. Editing and copying existing drafts is still free.")}</p>}
    </form>
    {Boolean(error) && <div className="error-banner" role="alert">{replyError(error)}</div>}
    {state.result && <section className="reply-result" aria-label={say("回复草稿", "Reply draft")}>
      <p className="eyebrow">{state.result.status === "draft" ? say("草稿已生成", "DRAFT READY") : say("请补充信息", "MORE CONTEXT NEEDED")}</p>
      {changed && <p className="reply-notice">{say("输入已修改，下方仍是上一条草稿。重新生成后再使用。", "Inputs changed. This is the previous draft; generate again before using it.")}</p>}
      {state.result.factsToCheck.length > 0 && <ul className="reply-facts">{state.result.factsToCheck.map((fact, index) => <li key={index}>{fact}</li>)}</ul>}
      {state.result.status === "draft" && <>
        <label>{say("编辑回复", "Edit reply")}<textarea maxLength={3000} rows={6} value={state.editedBody} onChange={(event) => { setCopied(false); setSendOutcome(null); setState((current) => ({ ...current, editedBody: event.target.value, savedAt: Date.now() })); }} /></label>
        <div className="reply-send-row">
          <button className="primary reply-submit" disabled={busy || autoRunning || changed || !state.editedBody.trim()} onClick={() => void sendReply()}>
            {busy ? say("正在发送…", "Sending…") : say("确认并发送", "Confirm & send")}
          </button>
          <button className="secondary" disabled={busy || changed || !state.editedBody.trim()} onClick={() => void copy()}>{copied ? say("已复制", "Copied") : say("复制回复", "Copy reply")}</button>
        </div>
        <p className="reply-footnote" role="status">{sendOutcomeText(sendOutcome)}</p>
      </>}
    </section>}
    <footer><span>{autoOn
      ? say("自动模式开启中：新评论会自动生成并发送；关闭开关即恢复逐条确认。", "Autopilot is on: new comments are drafted and sent automatically. Switch it off to return to per-reply confirmation.")
      : say("每条回复经你确认后，由 Finfold 自动填写并发送。", "Every reply is typed and sent automatically, only after you confirm it.")}</span></footer>
    <div className="sr-only" aria-live="polite">{busy ? say("正在处理", "Working") : copied ? say("已复制", "Copied") : ""}</div>
  </main>;
}

function sendOutcomeText(outcome: SendOutcome | null): string {
  if (!outcome) return say("确认发送后，扩展会定位这条评论的回复框，自动输入并发送；失败时自动复制。", "After you confirm, the extension locates this comment's reply box, types and sends; on failure it copies the reply.");
  if (outcome === "sent") return say("✓ 已自动发送到平台。", "✓ Sent on the platform.");
  if (outcome === "typed") return say("已填入回复框：请在平台上点击发送完成。", "Reply typed into the box: press the platform's send button to finish.");
  if (outcome === "copied") return say("自动发送未成功，回复已复制：请手动粘贴发送。", "Auto-send did not complete; the reply was copied — paste and send it manually.");
  return say("自动发送与复制都未成功，请手动复制回复内容。", "Neither auto-send nor copy worked; copy the reply manually.");
}

function autoPauseText(reason: AutoPause): string {
  const copy: Record<Exclude<AutoPause, "">, [string, string]> = {
    failures: ["已暂停：连续多次生成失败。检查网络后重新开启自动模式。", "Paused: several generations failed in a row. Check the connection, then turn Autopilot back on."],
    daily_limit: ["已暂停：今天已达 30 条本地上限，明天重新开启后继续。", "Paused: today's 30-reply local cap is reached; turn Autopilot back on tomorrow."],
    credits: ["已暂停：Credits 不足。充值后重新开启自动模式。", "Paused: not enough Credits. Top up, then turn Autopilot back on."],
    server_limit: ["已暂停：今天已达服务端生成上限，明天继续。", "Paused: the server-side daily reply limit is reached; it resumes tomorrow."]
  };
  return reason ? say(...copy[reason]) : "";
}

function autoBadge(outcome: AutoOutcome): string {
  const copy: Record<AutoOutcome, [string, string]> = {
    sent: ["✓ 已发送", "✓ Sent"],
    typed: ["✓ 已填入", "✓ Typed"],
    failed: ["× 发送失败", "× Send failed"],
    needs_context: ["… 需补充信息", "… Needs context"],
    error: ["× 生成失败", "× Generation failed"]
  };
  return say(...copy[outcome]);
}

function replyError(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  const messages: Record<string, [string, string]> = {
    STORAGE_UNAVAILABLE: ["草稿暂时无法保存，请先复制。", "Draft storage is unavailable. Copy your work before closing."],
    COPY_FAILED: ["无法复制，请选中回复正文手动复制。", "Copy failed. Select the reply text and copy it manually."],
    BACKEND_NOT_DEPLOYED: ["扩展服务尚未部署，暂时无法登录或生成。请使用 Finfold App。", "The extension backend is not deployed yet. Sign-in and generation are unavailable; use the Finfold App for now."],
    ORIGIN_NOT_ALLOWED: ["此扩展尚未获服务端授权，暂时无法登录或生成。", "This extension is not authorized by the server. Sign-in and generation are unavailable."],
    INVALID_SERVER_RESPONSE: ["服务返回异常，输入已保留。请稍后恢复请求。", "The server returned an invalid response. Your input is preserved; recover the request later."],
    PILOT_NOT_AVAILABLE: ["当前账号暂未开通回复功能。", "Reply drafting is not enabled for this account yet."],
    REPLY_DAILY_LIMIT_REACHED: ["今日回复生成次数已达上限，明天再来。已付费的结果仍可恢复。", "You've reached today's reply generation limit — please try again tomorrow. Paid results can still be recovered."],
    IDENTITY_CHANGED: ["回复身份已变化，请重新核对后生成。本次未扣费。", "Your reply identity changed. Review it again before generating. No charge was made."],
    FEATURE_DISABLED: ["回复服务尚未开启，输入内容已保留。", "The reply service is not enabled. Your input is preserved."],
    LOGIN_REQUIRED: ["请先登录 Finfold。", "Please sign in to Finfold."],
    UNAUTHORIZED: ["登录已过期，请重新登录。", "Your session expired. Sign in again."],
    INSUFFICIENT_CREDITS: ["Credits 不足，本次未生成。", "Not enough Credits; no generation was started."],
    REQUEST_IN_PROGRESS: ["上次请求仍在处理，再次点击会恢复同一请求，不重复扣费。", "The request is still processing. Retry to recover it without another charge."],
    RESULT_EXPIRED: ["上次结果已超过 24 小时。重新生成会消耗 3 Credits。", "The result expired after 24 hours. A new generation costs 3 Credits."],
    REQUEST_ALREADY_FAILED: ["上次生成失败并已退回 Credits，可以重新生成。", "The previous request failed and was refunded. You can generate again."],
    GENERATION_FAILED: ["生成失败，未交付的结果不会收费。输入已保留。", "Generation failed. Undelivered results are not charged. Your input is preserved."],
    FREE_POOL_UNAVAILABLE: ["当前免费模型额度不可用，不会自动转用付费模型。", "The free model pool is unavailable. No paid fallback will be used."],
    BAD_REQUEST: ["请检查评论与背景内容是否超过长度限制。", "Check the comment and context length limits."],
    REQUEST_CONFLICT: ["这条请求的内容已变化，请重新生成。", "This request's content changed. Start a new generation."],
    LOGIN_CANCELLED: ["登录已取消。请重新点击「登录」继续。", "Sign-in was cancelled. Click \"Sign in\" again to continue."],
    LOGIN_WINDOW_FAILED: ["登录窗口没有完成加载。请重试；若反复出现，请确认网络能访问 finfold.app。", "The sign-in window did not finish loading. Try again; if it keeps happening, check that finfold.app is reachable."],
    LOGIN_STATE_MISMATCH: ["登录结果校验失败，请重新登录。", "The sign-in result failed verification. Sign in again."],
    LOGIN_FAILED: ["连接没有完成，请重新点击「登录」再试一次。", "The connection did not complete. Click \"Sign in\" and try once more."],
    IMAGE_TOO_LARGE: ["截图过大，压缩后仍超限。请裁剪后再粘贴。", "The screenshot is too large even after compression. Crop it before pasting."],
    IMAGE_INVALID: ["这张图片无法读取，请换一张截图。", "This image could not be read. Try a different screenshot."],
    VISION_UNAVAILABLE: ["当前未配置可读图的模型，暂时无法用截图生成回复。", "No image-capable model is configured; screenshot replies are unavailable right now."]
  };
  const pair = messages[code];
  return pair ? say(...pair) : say("服务暂时不可用，输入已保留。重试会恢复同一请求。", "Service temporarily unavailable. Your input is preserved; retry recovers the same request.");
}
