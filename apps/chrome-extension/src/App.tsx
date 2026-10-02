import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ReplyPanel } from "./ReplyPanel";
import { AccountBar } from "./AccountBar";
import { PublishAssist } from "./PublishAssist";
import { Brand, ModeTabs, ThemeButton, LanguageButton } from "./Brand";
import { STORE_BUILD } from "./flags";
import {
  anonymousGenerate,
  authenticatedGenerate,
  claimAnonymousResult,
  fetchWebsiteLoginState,
  getSessionInfo,
  hasLocalSession,
  signIn,
  signOut,
  type ExtensionSession
} from "./api";
import { isChinese, t, useUiLocale } from "./i18n";
import { completeResultLength, generationIntent, shouldRetainRequestId, sourceMetric } from "./product";
import { requestPilotOrigins } from "./permissions";
import type { ExtensionContextResponse, GeneratedResult, PageContext, Platform } from "./types";

const ALL_PLATFORMS: Platform[] = ["x", "linkedin", "xiaohongshu", "reddit"];
const API_ORIGIN = "https://www.finfold.app";
const PENDING_GENERATION_KEY = "finfoldPendingGeneration";
const PENDING_CLAIM_KEY = "finfoldPendingClaim";

type Claim = { receipt: string; expiresAt: string };
type Activity = "auth" | "generate" | "save" | null;
type PanelState = {
  pageUrl: string;
  results: GeneratedResult[];
  activeResult: Platform;
  claim: Claim | null;
  saved: boolean;
  credits: number | null;
  kitId?: string | null;
};
type PendingOperation = { intent: string; requestId: string; createdAt: number };

function PostPanel({ navigation }: { navigation?: ReactNode }) {
  useUiLocale();
const platforms: Array<{ id: Platform; mark: string; label: string; tone: string }> = [
  { id: "x", mark: "X", label: "X", tone: t.xTone },
  { id: "linkedin", mark: "in", label: "LinkedIn", tone: t.linkedinTone },
  { id: "xiaohongshu", mark: "小", label: isChinese ? "小红书" : "RED", tone: t.xiaohongshuTone },
  { id: "reddit", mark: "r/", label: "Reddit", tone: t.redditTone }
];

  const [context, setContext] = useState<ExtensionContextResponse | null>(null);
  const [selected, setSelected] = useState<Platform>("x");
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [activeResult, setActiveResult] = useState<Platform>("x");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [activity, setActivity] = useState<Activity>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [pendingPlatforms, setPendingPlatforms] = useState<Platform[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [sessionInfo, setSessionInfo] = useState<ExtensionSession | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [anonymousUsed, setAnonymousUsed] = useState(false);
  const [websiteLoginNeeded, setWebsiteLoginNeeded] = useState(false);
  const busy = activity !== null;

  async function loadContext() {
    const response: ExtensionContextResponse = await chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" });
    setContext(response);
    if (!response.ok) return;
    const platform = response.requestedPlatform ?? response.recommendedPlatform;
    setSelected(platform);
    setActiveResult(platform);
    const stored = await chrome.storage.session.get("finfoldPanelState");
    const panel = stored.finfoldPanelState as PanelState | undefined;
    if (panel?.pageUrl === response.page.url && panel.results.length > 0) {
      setResults(panel.results);
      setActiveResult(panel.activeResult);
      setClaim(panel.claim && Date.parse(panel.claim.expiresAt) > Date.now() ? panel.claim : null);
      setSaved(panel.saved);
      setCredits(panel.credits);
      setKitId(panel.kitId ?? null);
    }
  }

  async function grantPilotAccess() {
    if (busy) return;
    if (await requestPilotOrigins()) await loadContext();
  }

  useEffect(() => {
    void loadContext();

    void Promise.all([
      hasLocalSession(),
      chrome.storage.local.get("finfoldAnonymousResultUsed")
    ]).then(async ([hasSession, local]) => {
      setAuthenticated(hasSession);
      setAnonymousUsed(local.finfoldAnonymousResultUsed === true);
      if (!hasSession) return;
      try {
        const session = await getSessionInfo();
        setCredits(session.availableCredits);
        setSessionInfo(session);
      } catch (cause) {
        const code = errorCodeFor(cause);
        if (code === "UNAUTHORIZED" || code === "LOGIN_REQUIRED") setAuthenticated(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!privacyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPrivacyOpen(false);
        setPendingPlatforms(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [privacyOpen]);

  const current = useMemo(
    () => results.find((result) => result.platform === activeResult) ?? results[0],
    [results, activeResult]
  );
  const sourceCount = context?.ok ? sourceMetric(context.page.text, isChinese) : 0;
  const recommended = context?.ok
    ? platforms.find((item) => item.id === context.recommendedPlatform)
    : undefined;

  async function requestGeneration(targets: Platform[]) {
    if (!context?.ok || busy) return;
    if (!authenticated && anonymousUsed && targets.length === 1) {
      await connectAccount();
      return;
    }
    const privacy = await chrome.storage.local.get("finfoldPrivacyV1Accepted");
    if (privacy.finfoldPrivacyV1Accepted !== true) {
      setPendingPlatforms(targets);
      setPrivacyOpen(true);
      return;
    }
    await generate(targets, context.page);
  }

  async function acceptPrivacy() {
    if (!pendingPlatforms) {
      setPrivacyOpen(false);
      return;
    }
    await chrome.storage.local.set({ finfoldPrivacyV1Accepted: true });
    const targets = pendingPlatforms;
    setPrivacyOpen(false);
    setPendingPlatforms(null);
    if (context?.ok) await generate(targets, context.page);
  }

  function openWebsiteLogin() {
    void chrome.tabs.create({ url: `${API_ORIGIN}/login` });
  }

  async function connectAccount() {
    setActivity("auth");
    setError(null);
    try {
      if (!authenticated) {
        // The authorize page bounces to the website login when there is no
        // web session. Guide the user to sign in first instead of opening
        // that dead-end window.
        const websiteState = await fetchWebsiteLoginState();
        if (websiteState === "signed-out") {
          setWebsiteLoginNeeded(true);
          return;
        }
      }
      await signIn();
      setAuthenticated(true);
      setWebsiteLoginNeeded(false);
      const session = await getSessionInfo();
      setCredits(session.availableCredits);
      setSessionInfo(session);
    } catch (cause) {
      setError(errorCodeFor(cause));
    } finally {
      setActivity(null);
    }
  }

  async function generate(targets: Platform[], page: PageContext) {
    setActivity("generate");
    setError(null);
    let requestId: string | null = null;
    try {
      let signedIn = authenticated;
      if (targets.length === 4 && !signedIn) {
        const websiteState = await fetchWebsiteLoginState();
        if (websiteState === "signed-out") {
          setWebsiteLoginNeeded(true);
          return;
        }
        await signIn();
        signedIn = true;
        setAuthenticated(true);
        setWebsiteLoginNeeded(false);
        const session = await getSessionInfo();
        setCredits(session.availableCredits);
        setSessionInfo(session);
      }

      requestId = await stableRequestId(PENDING_GENERATION_KEY, generationIntent(page.url, targets));
      if (signedIn) {
        const response = await authenticatedGenerate({
          requestId,
          platforms: targets,
          language: "auto",
          page
        });
        await clearStableRequest(PENDING_GENERATION_KEY);
        setResults(response.results);
        setClaim(null);
        setSaved(true);
        setCredits(response.availableCredits);
        setKitId(response.kitId);
        await storePanelState(page.url, response.results, targets[0], null, true, response.availableCredits, response.kitId);
      } else {
        const stored = await chrome.storage.local.get("finfoldInstallationId");
        const installationId = typeof stored.finfoldInstallationId === "string"
          ? stored.finfoldInstallationId
          : crypto.randomUUID();
        await chrome.storage.local.set({ finfoldInstallationId: installationId });
        const response = await anonymousGenerate({
          requestId,
          installationId,
          platform: targets[0],
          language: "auto",
          page
        });
        await clearStableRequest(PENDING_GENERATION_KEY);
        setResults([response.result]);
        setClaim(response.claim);
        setKitId(null);
        await storePanelState(page.url, [response.result], targets[0], response.claim, false, null, null);
        await chrome.storage.local.set({ finfoldAnonymousResultUsed: true });
        setAnonymousUsed(true);
      }
      setActiveResult(targets[0]);
    } catch (cause) {
      if (requestId && !shouldRetainRequestId(cause)) await clearStableRequest(PENDING_GENERATION_KEY);
      setError(errorCodeFor(cause));
    } finally {
      setActivity(null);
    }
  }

  async function saveResult() {
    if (!current || !claim || busy) return;
    setActivity("save");
    setError(null);
    let requestId: string | null = null;
    try {
      if (!authenticated) {
        await signIn();
        setAuthenticated(true);
      }
      requestId = await stableRequestId(PENDING_CLAIM_KEY, claim.receipt);
      const response = await claimAnonymousResult({ requestId, receipt: claim.receipt, result: current });
      await clearStableRequest(PENDING_CLAIM_KEY);
      setSaved(true);
      setClaim(null);
      setKitId(response.kitId);
      if (context?.ok) {
        await storePanelState(context.page.url, results, activeResult, null, true, credits, response.kitId);
      }
      try {
        const session = await getSessionInfo();
        setCredits(session.availableCredits);
        setSessionInfo(session);
      } catch {
        // Saving succeeded; a stale credit badge must not turn that success into an error.
      }
    } catch (cause) {
      if (requestId && !shouldRetainRequestId(cause)) await clearStableRequest(PENDING_CLAIM_KEY);
      setError(errorCodeFor(cause));
    } finally {
      setActivity(null);
    }
  }

  async function copyResult() {
    if (!current) return;
    try {
      const complete = [current.title, current.body, current.cta].filter(Boolean).join("\n\n");
      await navigator.clipboard.writeText(complete);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setError("COPY_FAILED");
    }
  }

  async function openSavedKit() {
    if (!kitId) return;
    try {
      await chrome.tabs.create({ url: `${API_ORIGIN}/kits/${encodeURIComponent(kitId)}` });
    } catch {
      setError("OPEN_FAILED");
    }
  }

  async function toggleAuth() {
    if (busy) return;
    setError(null);
    if (!authenticated) {
      await connectAccount();
      return;
    }
    setActivity("auth");
    try {
      await signOut();
      setAuthenticated(false);
      setCredits(null);
      setSessionInfo(null);
      setResults([]);
      setClaim(null);
      setSaved(false);
      setKitId(null);
      await chrome.storage.session.remove("finfoldPanelState");
    } catch (cause) {
      setError(errorCodeFor(cause));
    } finally {
      setActivity(null);
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <Brand />
        <div className="account-actions">
          <LanguageButton />
          <ThemeButton />
          {!authenticated && (
            <button className="text-button" disabled={busy} onClick={() => void toggleAuth()}>{t.signin}</button>
          )}
        </div>
      </header>

      {authenticated && sessionInfo && (
        <AccountBar session={sessionInfo} busy={busy} onSignOut={() => void toggleAuth()} />
      )}
      {!STORE_BUILD && authenticated && <PublishAssist />}
      {navigation}
      <ol className="workflow" aria-label={isChinese ? "创作流程" : "Finfold workflow"}>
        <li className="done"><span>01</span>{t.workflowSource}</li>
        <li className={results.length > 0 ? "done" : "active"}><span>02</span>{t.workflowShape}</li>
        <li className={results.length > 0 ? "active" : ""}><span>03</span>{t.workflowReady}</li>
      </ol>

      {!context ? (
        <section className="loading-state"><span className="pulse-dot" />{t.loading}</section>
      ) : !context.ok ? (
        <section className="empty-state">
          <span className="empty-mark">↗</span>
          <p className="eyebrow">
            {context.code === "PERMISSION_DENIED" ? t.permissionEyebrow : context.code === "NO_CONTENT" ? t.noContentEyebrow : t.restricted}
          </p>
          <h1>
            {context.code === "PERMISSION_DENIED" ? t.permissionHeading
              : context.code === "NO_CONTENT" ? t.noContentHeading
              : t.restrictedHeading}
          </h1>
          <button className="primary" onClick={() => location.reload()}>{t.retry}</button>
          {context.code === "PERMISSION_DENIED" && !STORE_BUILD && (
            <button className="text-button" disabled={busy} onClick={() => void grantPilotAccess()}>{t.grantAlways}</button>
          )}
        </section>
      ) : (
        <>
          <section className="source-card">
            <div className="source-meta">
              <span>{t.source}</span>
              <span className="local-state"><i />{results.length > 0 ? t.sentOnRequest : t.localReady}</span>
            </div>
            <h1>{context.page.title}</h1>
            <p className="source-site">{context.page.siteName || safeHost(context.page.url)}</p>
            <div className="source-facts">
              <span>{context.page.selectionUsed ? t.selection : t.page}</span>
              <span>{sourceCount.toLocaleString()} {isChinese ? t.characters : t.words}</span>
              <span>{(context.page.language || "auto").split("-")[0].toUpperCase()}</span>
              <button onClick={() => { setPendingPlatforms(null); setPrivacyOpen(true); }}>{t.whatSent}</button>
            </div>
          </section>

          {results.length === 0 ? (
            <section className="composer">
              <div className="section-heading">
                <div><p className="eyebrow">02 / {t.choose}</p><h2>{t.description}</h2></div>
                {recommended && <span className="recommendation">↗ {recommended.label}</span>}
              </div>
              <div className="platform-grid">
                {platforms.map((platform) => (
                  <button
                    key={platform.id}
                    className={selected === platform.id ? "platform active" : "platform"}
                    onClick={() => setSelected(platform.id)}
                    aria-pressed={selected === platform.id}
                    disabled={busy}
                  >
                    <span className="platform-top">
                      <span className="platform-mark">{platform.mark}</span>
                      {context.recommendedPlatform === platform.id && <span className="recommended-tag">{t.recommended}</span>}
                    </span>
                    <span className="platform-name">{platform.label}</span>
                    <small>{platform.tone}</small>
                  </button>
                ))}
              </div>

              {activity === "generate" && (
                <div className="generation-status" role="status">
                  <span className="orbit" aria-hidden="true" />
                  <span><strong>{t.generating}</strong><small>{t.generatingHint}</small></span>
                </div>
              )}

              <div className="generate-row">
                <span>{authenticated ? t.singlePrice : anonymousUsed ? t.freeUsed : t.free}</span>
                <button className="primary" disabled={busy} onClick={() => void requestGeneration([selected])}>
                  {activity === "auth" ? t.signin : activity === "generate" ? t.generating : !authenticated && anonymousUsed ? t.signinContinue : t.generate}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          ) : current ? (
            <section className="result-wrap">
              {activity === "generate" && (
                <div className="generation-status result-progress" role="status">
                  <span className="orbit" aria-hidden="true" />
                  <span><strong>{t.generatingAll}</strong><small>{t.generatingHint}</small></span>
                </div>
              )}
              <div className="result-status">
                <span><i />{t.draftReady}</span>
                <span>{completeResultLength(current).toLocaleString()} {t.resultCharacters}</span>
              </div>
              {results.length > 1 && (
                <nav className="result-tabs" aria-label="Generated platforms">
                  {results.map((result) => (
                    <button key={result.platform} className={activeResult === result.platform ? "active" : ""} onClick={() => setActiveResult(result.platform)}>
                      {platforms.find((item) => item.id === result.platform)?.label}
                    </button>
                  ))}
                </nav>
              )}
              <article className="result-card">
                <div className="result-index">{String(results.indexOf(current) + 1).padStart(2, "0")}</div>
                <p className="eyebrow">03 / {platforms.find((item) => item.id === current.platform)?.label} · {t.completePost}</p>
                <h2>{current.title}</h2>
                <div className="post-body">{current.body}</div>
                <p className="post-cta">{current.cta}</p>
                <details className="rationale-details">
                  <summary>{t.rationale}<span>＋</span></summary>
                  <dl className="rationale">
                    <div><dt>{t.strategy}</dt><dd>{current.strategy}</dd></div>
                    <div><dt>{t.notes}</dt><dd>{current.notes}</dd></div>
                  </dl>
                </details>
              </article>
              <div className="result-actions">
                <button className="primary copy-button" disabled={busy} onClick={() => void copyResult()}>
                  <span>{copied ? "✓" : "↗"}</span>{copied ? t.copied : t.copy}
                </button>
                {claim && !saved && (
                  <button className="secondary" disabled={busy} onClick={() => void saveResult()}>
                    {activity === "save" ? t.saving : t.save}
                  </button>
                )}
                {saved && (
                  <div className="saved-row">
                    <span className="saved-label">✓ {t.saved}</span>
                    {kitId && <button className="text-button" onClick={() => void openSavedKit()}>{t.openKit} ↗</button>}
                  </div>
                )}
                {results.length === 1 && (
                  <button className="all-button" disabled={busy} onClick={() => void requestGeneration(ALL_PLATFORMS)}>
                    {activity === "generate" ? t.generatingAll : t.all}<span>24 Credits · 4 outputs</span>
                  </button>
                )}
              </div>
              {credits !== null && <p className="credit-line">{credits} {t.credits}</p>}
            </section>
          ) : null}
        </>
      )}

      {websiteLoginNeeded && (
        <div className="notice-banner" role="status">
          <strong>{t.websiteLoginNeeded}</strong>
          <p>{t.websiteLoginHint}</p>
          <div className="notice-actions">
            <button className="notice-primary" onClick={openWebsiteLogin}>{t.openWebsiteLogin}</button>
            <button className="notice-secondary" disabled={busy} onClick={() => void connectAccount()}>{t.retryConnect}</button>
          </div>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{messageFor(new Error(error))}</span><button aria-label={isChinese ? "关闭提示" : "Dismiss"} onClick={() => setError(null)}>×</button>
        </div>
      )}
      <footer>
        <span>{t.review}</span>
        <button onClick={() => { setPendingPlatforms(null); setPrivacyOpen(true); }}>{t.whatSent}</button>
      </footer>
      <div className="sr-only" aria-live="polite">{copied ? t.copied : activity === "generate" ? t.generating : ""}</div>

      {privacyOpen && createPortal(
        <div className="privacy-scrim" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
          <section className="privacy-card">
            <div className="privacy-number">01</div>
            <p className="eyebrow">PRIVACY / USER CONTROL</p>
            <h2 id="privacy-title">{t.privacyTitle}</h2>
            <p>{t.privacyBody}</p>
            <ul className="privacy-list">
              <li><span>01</span>{t.privacyIncluded}</li>
              <li><span>02</span>{t.privacyText}</li>
              <li className="excluded"><span>×</span>{t.privacyExcluded}</li>
            </ul>
            <div className="privacy-actions">
              <button className="primary" autoFocus disabled={busy} onClick={() => void acceptPrivacy()}>
                {pendingPlatforms ? t.privacyConfirm : t.privacyDone}
              </button>
              {pendingPlatforms && (
                <button className="text-button" onClick={() => { setPrivacyOpen(false); setPendingPlatforms(null); }}>{t.privacyCancel}</button>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </main>
  );
}

async function storePanelState(
  pageUrl: string,
  results: GeneratedResult[],
  activeResult: Platform,
  claim: Claim | null,
  saved: boolean,
  credits: number | null,
  kitId: string | null
) {
  const state: PanelState = { pageUrl, results, activeResult, claim, saved, credits, kitId };
  await chrome.storage.session.set({ finfoldPanelState: state });
}

async function stableRequestId(storageKey: string, intent: string): Promise<string> {
  const stored = await chrome.storage.session.get(storageKey);
  const pending = stored[storageKey] as PendingOperation | undefined;
  const fresh = pending && Date.now() - pending.createdAt < 24 * 60 * 60 * 1_000;
  if (fresh && pending.intent === intent) return pending.requestId;
  const next: PendingOperation = { intent, requestId: crypto.randomUUID(), createdAt: Date.now() };
  await chrome.storage.session.set({ [storageKey]: next });
  return next.requestId;
}

function clearStableRequest(storageKey: string) {
  return chrome.storage.session.remove(storageKey);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function errorCodeFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : "GENERATION_FAILED";
}

function messageFor(cause: unknown): string {
  const code = errorCodeFor(cause);
  const zh: Record<string, string> = {
    BACKEND_NOT_DEPLOYED: "扩展服务尚未部署，暂时无法登录或生成。请使用 Finfold App。",
    INVALID_SERVER_RESPONSE: "服务返回异常，输入已保留，请稍后重试。",
    FEATURE_DISABLED: "扩展功能尚未开放。请前往 finfold.app 使用网页版，或稍后再试。",
    INSTALLATION_LIMIT_REACHED: "这台浏览器的免费结果已使用。登录后可继续生成。",
    IP_RATE_LIMITED: "今天的匿名尝试较多，请稍后再试或登录 Finfold。",
    GLOBAL_LIMIT_REACHED: "今天的免费池名额已用完。登录后仍可使用 Credits。",
    FREE_POOL_UNAVAILABLE: "免费模型池暂不可用；Finfold 没有切换到付费模型。",
    INSUFFICIENT_CREDITS: "Credits 不足，请先充值或升级套餐。",
    CLAIM_EXPIRED: "保存回执已过期，但你仍可复制当前完整结果。",
    LOGIN_CANCELLED: "登录已取消。请重新点击「登录 Finfold」继续。",
    LOGIN_WINDOW_FAILED: "登录窗口没有完成加载。请重试；若反复出现，请确认网络能访问 finfold.app。",
    LOGIN_FAILED: "连接没有完成，请重新点击「登录 Finfold」再试一次。",
    ORIGIN_NOT_ALLOWED: "当前扩展版本尚未获得服务器授权。",
    REQUEST_IN_PROGRESS: "同一请求仍在处理中，请稍后再试；不会重复扣费。",
    COPY_FAILED: "无法写入剪贴板，请选中内容后手动复制。",
    OPEN_FAILED: "无法打开已保存内容，请前往 Finfold 内容库查看。"
  };
  const en: Record<string, string> = {
    BACKEND_NOT_DEPLOYED: "The extension backend is not deployed yet. Sign-in and generation are unavailable; use the Finfold App for now.",
    INVALID_SERVER_RESPONSE: "The server returned an invalid response. Your input is preserved; try again later.",
    FEATURE_DISABLED: "The extension service is not open yet. Use finfold.app in your browser, or try again later.",
    INSTALLATION_LIMIT_REACHED: "This browser's free result has been used. Sign in to keep generating.",
    IP_RATE_LIMITED: "Too many anonymous attempts today. Try later or sign in.",
    GLOBAL_LIMIT_REACHED: "Today's free pool is full. Signed-in Credits are still available.",
    FREE_POOL_UNAVAILABLE: "The free model pool is unavailable. Finfold did not fall back to a paid model.",
    INSUFFICIENT_CREDITS: "Not enough Credits. Top up or upgrade to continue.",
    CLAIM_EXPIRED: "The save receipt expired, but you can still copy the complete result.",
    LOGIN_CANCELLED: "Sign-in was cancelled. Click \"Sign in to Finfold\" again to continue.",
    LOGIN_WINDOW_FAILED: "The sign-in window did not finish loading. Try again; if it keeps happening, check that finfold.app is reachable.",
    LOGIN_FAILED: "Connection did not complete. Click \"Sign in to Finfold\" and try once more.",
    ORIGIN_NOT_ALLOWED: "This extension build has not been authorized by the server.",
    REQUEST_IN_PROGRESS: "The same request is still running. Try again shortly; it will not charge twice.",
    COPY_FAILED: "Finfold could not access the clipboard. Select the post and copy it manually.",
    OPEN_FAILED: "The saved content could not be opened. Find it in your Finfold content library."
  };
  return (isChinese ? zh : en)[code] ?? (isChinese
    ? "操作没有完成，请重试；若反复出现，请先在浏览器登录 finfold.app，再重新连接。"
    : "That did not complete. Try again; if it keeps happening, sign in to finfold.app first, then reconnect.");
}


export function App() {
  useUiLocale();
  const [mode, setMode] = useState<"post" | "reply" | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);
  useEffect(() => {
    if (STORE_BUILD) { setMode("post"); return; }
    void chrome.storage.session.get(["finfoldPanelMode", "finfoldPendingAction"]).then((stored) => {
      setMode(stored.finfoldPendingAction || stored.finfoldPanelMode === "post" ? "post" : "reply");
    }).catch(() => setMode("reply"));
  }, []);
  function choose(next: "post" | "reply") {
    if (STORE_BUILD) return;
    setMode(next);
    void chrome.storage.session.set({ finfoldPanelMode: next });
  }
  if (!mode) return <main className="shell"><p role="status">{isChinese ? "正在打开 Finfold…" : "Opening Finfold…"}</p></main>;
  const navigation = STORE_BUILD ? null : <ModeTabs mode={mode} disabled={replyBusy} onChange={choose} />;
  return mode === "reply" && !STORE_BUILD ? <ReplyPanel navigation={navigation} onBusy={setReplyBusy} /> : <PostPanel navigation={navigation} />;
}
