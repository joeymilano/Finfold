/**
 * Finfold 云桥客户端。
 * 所有请求经云函数 bridge 转发到 finfold.app /api/weapp/v1/*，
 * token 由 bridge 的 login 操作签发后存本地，401 时自动重登一次。
 */

const TOKEN_KEY = "ff_weapp_token";

type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function callBridge(op: string, payload: Record<string, unknown> = {}): Promise<BridgeResult<any>> {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: "bridge",
      data: { op, ...payload },
      success: (res) => resolve((res.result ?? { ok: false, error: "bridge 空响应" }) as BridgeResult<any>),
      fail: (err) => resolve({ ok: false, error: `云函数调用失败：${err.errMsg || "unknown"}` })
    });
  });
}

function getToken(): string | null {
  try {
    return wx.getStorageSync(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) wx.setStorageSync(TOKEN_KEY, token);
    else wx.removeStorageSync(TOKEN_KEY);
  } catch {
    /* storage 不可用时每次重登，功能仍可用 */
  }
}

export async function login(): Promise<string> {
  const result = await callBridge("login");
  if (!result.ok || !result.data?.token) {
    throw new Error(result.ok ? "登录失败：bridge 未返回 token" : result.error);
  }
  setToken(result.data.token);
  return result.data.token as string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  retried = false
): Promise<T> {
  let token = getToken();
  if (!token) token = await login();
  const result = await callBridge("call", { method, path, body, token });
  if (!result.ok) throw new ApiError(result.error, result.status ?? 500);
  const { status, data } = result.data as { status: number; data: any };
  if (status === 401 && !retried) {
    setToken(null);
    return request<T>(method, path, body, true);
  }
  if (status < 200 || status >= 300) {
    throw new ApiError(data?.error ?? `请求失败（${status}）`, status);
  }
  return data as T;
}

/* ============ 类型 ============ */

export type MeProfile = {
  nickname: string | null;
  onboarded: boolean;
  business: string;
  audience: string;
  focusKeywords: string[];
  platform: string;
  credits: number;
};

export type OpportunityCard = {
  id: string;
  title: string;
  fact: string;
  whyNow: string;
  whyYou: string;
  mainAngle: string;
  alternateAngles: string[];
  recommendedPlatform: string;
  recommendedFormat: string;
  matchScore: number;
  lifecycle: string;
  analysisStatus: string;
  keywords: string[];
  evidenceCount: number;
  evidence: Array<{ title: string; url: string; source: string }>;
  lastSeenAt: string;
};

export type RadarFeed = {
  opportunities: OpportunityCard[];
  window: string;
  generatedAt: string;
  profileReady: boolean;
  latestSignalAt: string | null;
  collectionStatus: string;
};

export type DraftSnapshot = {
  id: string;
  status: "pending" | "ready" | "failed";
  platform: string;
  title: string;
  content: string | null;
  error: string | null;
  creditsCharged: number;
  createdAt: string;
  finishedAt: string | null;
  available?: number;
};

export type CreateDraftResult = {
  id: string;
  status: string;
  cost: number;
  available: number;
  createdAt: string;
};

/* ============ API ============ */

export const api = {
  getMe: () => request<MeProfile>("GET", "/api/weapp/v1/me"),
  patchMe: (patch: Partial<Pick<MeProfile, "business" | "audience" | "focusKeywords" | "platform" | "nickname">>) =>
    request<{ ok: true }>("PATCH", "/api/weapp/v1/me", patch),
  getRadar: (window: "4h" | "24h" | "7d") =>
    request<RadarFeed>("GET", `/api/weapp/v1/opportunities?window=${window}&limit=8`),
  getOpportunity: (id: string) =>
    request<OpportunityCard & { rankScore: number; matchDimensions: { matchedTerms: string[] } }>(
      "GET", `/api/weapp/v1/opportunities/${id}`
    ),
  postFeedback: (id: string, feedback: "not_relevant" | "already_knew" | "brand_mismatch" | "later") =>
    request<{ feedback: string; state: string }>("POST", `/api/weapp/v1/opportunities/${id}/feedback`, { feedback }),
  createDraft: (payload: {
    source: "opportunity" | "free";
    opportunityId?: string;
    platform: "wechat" | "xiaohongshu" | "moments";
    topic: { title: string; fact?: string; angle?: string; keywords?: string[] };
  }) => request<CreateDraftResult>("POST", "/api/weapp/v1/drafts", payload),
  getDraft: (id: string) => request<DraftSnapshot>("GET", `/api/weapp/v1/drafts/${id}`),
  listDrafts: () =>
    request<{ drafts: Array<{ id: string; title: string; platform: string; status: string; content: string | null; createdAt: string }> }>(
      "GET", "/api/weapp/v1/drafts"
    )
};

/** 小程序码由云函数直接经 openapi 生成并上传云存储，返回 fileID。 */
export async function fetchWxaCode(page: string, scene: string): Promise<string | null> {
  const result = await callBridge("wxacode", { page, scene });
  if (!result.ok) return null;
  return (result.data?.fileID as string) ?? null;
}
