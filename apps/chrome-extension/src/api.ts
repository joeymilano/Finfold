import { uiLocale } from "./i18n";
import type { GeneratedResult, Language, PageContext, Platform, ReplyPlatform } from "./types";

// Dev-pilot override only takes effect when VITE_DEV_API_ORIGIN is set at
// build/dev time; packaged builds ship the production origin, and the
// package audit still rejects any literal development address.
const API_ORIGIN: string = import.meta.env.VITE_DEV_API_ORIGIN ?? "https://www.finfold.app";
const ACCESS_KEY = "finfoldAccessToken";
const REFRESH_KEY = "finfoldRefreshToken";

type Tokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export type ExtensionSession = {
  authenticated: true;
  userId?: string;
  accountEmail?: string;
  brandName?: string;
  replyDraftsEnabled?: boolean;
  replyDraftsRemainingToday?: number | null;
  plan: string;
  availableCredits: number;
  freePoolOnly: boolean;
};

export async function hasLocalSession(): Promise<boolean> {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(ACCESS_KEY),
    chrome.storage.local.get(REFRESH_KEY)
  ]);
  return Boolean(session[ACCESS_KEY] || local[REFRESH_KEY]);
}

export type WebsiteLoginState = "signed-in" | "signed-out" | "unknown";

// Detects whether this browser already holds a finfold.app web session.
// The response is only read as signed-in / signed-out; no profile data is kept.
export async function fetchWebsiteLoginState(): Promise<WebsiteLoginState> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/auth/user`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return "unknown";
    const body = await response.json().catch(() => null) as { user?: unknown } | null;
    if (!body || typeof body !== "object") return "unknown";
    return body.user ? "signed-in" : "signed-out";
  } catch {
    return "unknown";
  }
}

export async function signIn(): Promise<void> {
  // Do not open an OAuth window against a missing or disabled backend.
  try { await request("/api/extension/v1/session", { method: "GET" }); }
  catch (error) { if (!(error instanceof Error) || error.message !== "UNAUTHORIZED") throw error; }
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(32);
  const redirectUri = chrome.identity.getRedirectURL("finfold");
  const authorize = new URL("/extension/authorize", API_ORIGIN);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("ui_locale", uiLocale);

  let redirected: string | undefined;
  try {
    redirected = await chrome.identity.launchWebAuthFlow({ url: authorize.toString(), interactive: true });
  } catch (cause) {
    // Chrome rejects with its own English message ("User cancelled or flow
    // terminated.") when the sign-in window is closed — the raw message would
    // fall through to the generic error copy, so translate it here.
    const raw = cause instanceof Error ? cause.message : "";
    if (/cancel|clos|dismiss|flow terminated/i.test(raw)) throw new Error("LOGIN_CANCELLED");
    throw new Error("LOGIN_WINDOW_FAILED");
  }
  if (!redirected) throw new Error("LOGIN_CANCELLED");
  const callback = new URL(redirected);
  if (callback.searchParams.get("state") !== state) throw new Error("LOGIN_STATE_MISMATCH");
  const code = callback.searchParams.get("code");
  if (!code) {
    const reason = callback.searchParams.get("error");
    throw new Error(reason === "access_denied" ? "LOGIN_CANCELLED" : "LOGIN_FAILED");
  }
  const tokens = await request<Tokens>("/api/extension/v1/oauth/token", {
    method: "POST",
    body: JSON.stringify({ grantType: "authorization_code", code, codeVerifier: verifier, redirectUri })
  });
  await storeTokens(tokens);
}

export async function signOut(): Promise<void> {
  const local = await chrome.storage.local.get(REFRESH_KEY);
  const token = local[REFRESH_KEY];
  if (typeof token === "string") {
    await request("/api/extension/v1/oauth/revoke", {
      method: "POST",
      body: JSON.stringify({ token })
    }).catch(() => undefined);
  }
  await Promise.all([
    chrome.storage.session.remove(ACCESS_KEY),
    chrome.storage.session.remove("finfoldReplyState"),
    chrome.storage.local.remove(REFRESH_KEY)
  ]);
}

export async function getSessionInfo(): Promise<ExtensionSession> {
  return authenticatedRequest<ExtensionSession>("/api/extension/v1/session", { method: "GET" });
}

export async function anonymousGenerate(input: {
  requestId: string;
  installationId: string;
  platform: Platform;
  language: Language;
  page: PageContext;
}) {
  return request<{ result: GeneratedResult; claim: { receipt: string; expiresAt: string } }>(
    "/api/extension/v1/anonymous-actions",
    { method: "POST", body: JSON.stringify({ ...input, action: "repurpose" }) }
  );
}

export async function authenticatedGenerate(input: {
  requestId: string;
  platforms: Platform[];
  language: Language;
  page: PageContext;
}) {
  return authenticatedRequest<{
    results: GeneratedResult[];
    kitId: string;
    availableCredits: number;
    cost: number;
  }>("/api/extension/v1/actions", {
    method: "POST",
    body: JSON.stringify({ ...input, action: "repurpose" })
  });
}

export async function claimAnonymousResult(input: {
  requestId: string;
  receipt: string;
  result: GeneratedResult;
}) {
  return authenticatedRequest<{ saved: true; kitId: string; chargedCredits: 0 }>(
    "/api/extension/v1/claims",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function authenticatedRequest<T>(path: string, init: RequestInit): Promise<T> {
  let accessToken = await getAccessToken();
  let response = await raw(path, init, accessToken);
  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    response = await raw(path, init, accessToken);
  }
  return parseResponse<T>(response);
}

// One-off visual locate when the tab's DOM walk could not find the reply box.
// Sends a single screenshot; the server does not archive it.
export async function locateReplyControls(screenshot: string, platform: ReplyPlatform, targetHint?: string) {
  return authenticatedRequest<{ replyInput: { x: number; y: number } | null; sendButton: { x: number; y: number } | null }>(
    "/api/extension/v1/reply-automation/locate",
    { method: "POST", body: JSON.stringify({ screenshot, platform, targetHint }) }
  );
}

// Reports what the tiered send achieved (DOM → vision → copy). Fire-and-forget:
// callers swallow errors so telemetry can never break the send UX.
export async function reportReplyOutcome(input: {
  requestId: string;
  platform: ReplyPlatform;
  outcome: "sent" | "typed" | "copied" | "failed";
}) {
  return authenticatedRequest<{ recorded: true }>("/api/extension/v1/reply-outcome", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export type GrowthPublishTask = {
  taskId: string;
  missionId: string;
  variantKey: string;
  status: "ready" | "completed";
  draft: { title: string; body: string; cta: string } | null;
  trackingUrl: string | null;
  evidenceUrl: string | null;
  approvedAt: string | null;
};

// Approved growth-loop publish tasks for the signed-in account. The panel
// hides itself when the feature is off (featureEnabled: false).
export async function fetchGrowthTasks() {
  return authenticatedRequest<{ tasks: GrowthPublishTask[]; featureEnabled: boolean }>(
    "/api/extension/v1/growth-tasks",
    { method: "GET" }
  );
}

// Reports the assisted publication outcome. A completed report requires a
// Xiaohongshu post link; the server records it as user-reported evidence.
export async function reportGrowthTaskOutcome(input: {
  taskId: string;
  outcome: "completed" | "failed";
  evidenceUrl?: string;
}) {
  return authenticatedRequest<{ result: string; replayed?: boolean }>(
    `/api/extension/v1/growth-tasks/${encodeURIComponent(input.taskId)}/outcome`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

async function getAccessToken(): Promise<string> {
  const stored = await chrome.storage.session.get(ACCESS_KEY);
  if (typeof stored[ACCESS_KEY] === "string") return stored[ACCESS_KEY];
  return refreshAccessToken();
}

let refreshing: Promise<string> | null = null;
async function refreshAccessToken(): Promise<string> {
  if (!refreshing) refreshing = rotateAccessToken().finally(() => { refreshing = null; });
  return refreshing;
}
async function rotateAccessToken(): Promise<string> {
  const stored = await chrome.storage.local.get(REFRESH_KEY);
  const refreshToken = stored[REFRESH_KEY];
  if (typeof refreshToken !== "string") throw new Error("LOGIN_REQUIRED");
  try {
    const tokens = await request<Tokens>("/api/extension/v1/oauth/token", {
      method: "POST",
      body: JSON.stringify({ grantType: "refresh_token", refreshToken })
    });
    await storeTokens(tokens);
    return tokens.accessToken;
  } catch (error) {
    // A temporary network/provider outage must not delete login or edited drafts.
    if (error instanceof Error && ["UNAUTHORIZED", "INVALID_GRANT"].includes(error.message)) await signOut();
    throw error;
  }
}

async function storeTokens(tokens: Tokens) {
  await Promise.all([
    chrome.storage.session.set({ [ACCESS_KEY]: tokens.accessToken }),
    chrome.storage.local.set({ [REFRESH_KEY]: tokens.refreshToken })
  ]);
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  return parseResponse<T>(await raw(path, init));
}

function raw(path: string, init: RequestInit, token?: string) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_ORIGIN}${path}`, { ...init, headers, credentials: "omit", cache: "no-store" });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
  if (response.status === 404) throw new Error("BACKEND_NOT_DEPLOYED");
  if (!body || typeof body !== "object") throw new Error("INVALID_SERVER_RESPONSE");
  if (!response.ok) throw new Error(body.error?.code || `HTTP_${response.status}`);
  return body as T;
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
