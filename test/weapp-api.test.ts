import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as any,
  bridgeSecret: "test-bridge-secret-0123456789abcdef",
  reserveCreditsResult: { available: 197, cost: 3 } as { available: number; cost: number } | null,
  refundCalls: [] as Array<[string, number]>,
  afterCallbacks: [] as Array<() => unknown>
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => "web-user",
  createSupabaseAdminClient: () => state.admin
}));

vi.mock("@/lib/payment/credits", () => ({
  reserveCredits: vi.fn(async (_userId: string, amount: number) => {
    if (state.reserveCreditsResult === null) return null;
    return { ...state.reserveCreditsResult, cost: amount };
  }),
  refundCredits: vi.fn(async (userId: string, amount: number) => {
    state.refundCalls.push([userId, amount]);
  }),
  getAvailableCredits: vi.fn(async () => 42)
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => unknown) => {
      state.afterCallbacks.push(callback);
    }
  };
});

import { POST as sessionPost } from "@/app/api/weapp/v1/session/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/weapp/v1/me/route";
import { GET as opportunitiesGet } from "@/app/api/weapp/v1/opportunities/route";
import { POST as draftsPost } from "@/app/api/weapp/v1/drafts/route";
import { authenticateWeappRequest, randomWeappToken } from "@/lib/weapp/auth";

/* ============ 可链式调用的假 admin client ============ */

type Terminal = { data: unknown; error: unknown };

function makeChain(terminal: Terminal, result?: Terminal) {
  const chain: any = {};
  const terminalMethods = {
    maybeSingle: vi.fn(async () => result ?? terminal),
    single: vi.fn(async () => result ?? terminal)
  };
  for (const step of ["select", "insert", "update", "upsert", "eq", "is", "in", "gte", "order", "limit", "filter"]) {
    chain[step] = vi.fn(() => chain);
  }
  Object.assign(chain, terminalMethods);
  return chain;
}

function makeAdmin(overrides: Record<string, Terminal> = {}, authUser: unknown = { id: "created-user-id" }) {
  const tables: Record<string, any> = {};
  const admin: any = {
    from(table: string) {
      if (!tables[table]) tables[table] = makeChain(overrides[table] ?? { data: null, error: null });
      return tables[table];
    },
    rpc: vi.fn(async (name: string) => {
      if (name === "get_available_credits") return { data: 42, error: null };
      if (name === "grant_weapp_signup_credits") return { data: 200, error: null };
      return { data: null, error: null };
    }),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: authUser }, error: null }))
      }
    },
    __tables: tables
  };
  return admin;
}

function bridgeRequest(body: unknown, secret = state.bridgeSecret) {
  return new Request("https://www.finfold.app/api/weapp/v1/session", {
    method: "POST",
    headers: { "content-type": "application/json", "x-weapp-bridge-secret": secret },
    body: JSON.stringify(body)
  });
}

const OPENID = "o-abc123def456ghi789";

beforeEach(() => {
  vi.stubEnv("WEAPP_BRIDGE_SECRET", state.bridgeSecret);
  state.admin = makeAdmin();
  state.reserveCreditsResult = { available: 197, cost: 3 };
  state.refundCalls = [];
  state.afterCallbacks = [];
});

describe("POST /api/weapp/v1/session", () => {
  it("rejects a missing or wrong bridge secret", async () => {
    const missing = await sessionPost(bridgeRequest({ openid: OPENID }, ""));
    expect(missing.status).toBe(401);
    const wrong = await sessionPost(bridgeRequest({ openid: OPENID }, "wrong-secret"));
    expect(wrong.status).toBe(401);
  });

  it("auto-provisions a user, identity, welcome grant and a token on first login", async () => {
    state.admin = makeAdmin(
      { weapp_identities: { data: null, error: null } },
      { id: "user-1" }
    );
    state.admin.from("weapp_identities"); // materialize the lazy table chain
    state.admin.from("weapp_tokens");
    // identity insert ... select().single()
    state.admin.__tables.weapp_identities.insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: "identity-1" }, error: null }) })
    }));
    // token insert
    state.admin.__tables.weapp_tokens.insert = vi.fn(async () => ({ data: null, error: null }));

    const response = await sessionPost(bridgeRequest({ openid: OPENID, nickname: "测试用户" }));
    const body = (await response.json()) as { token?: string; isNew?: boolean };

    expect(response.status).toBe(200);
    expect(body.isNew).toBe(true);
    expect(body.token).toMatch(/^ff_wa_[a-f0-9]{64}$/);
    expect(state.admin.auth.admin.createUser).toHaveBeenCalledTimes(1);
    const grant = state.admin.rpc.mock.calls.find((call: string[]) => call[0] === "grant_weapp_signup_credits");
    expect(grant).toBeTruthy();
  });

  it("reuses the existing identity on repeat login without creating a user", async () => {
    state.admin = makeAdmin({
      weapp_identities: { data: { id: "identity-1", user_id: "user-1", nickname: null, unionid: null }, error: null }
    });
    state.admin.from("weapp_identities");
    state.admin.from("weapp_tokens");
    state.admin.__tables.weapp_identities.update = vi.fn(() => ({
      eq: vi.fn(async () => ({ data: null, error: null }))
    }));
    state.admin.__tables.weapp_tokens.insert = vi.fn(async () => ({ data: null, error: null }));

    const response = await sessionPost(bridgeRequest({ openid: OPENID }));
    const body = (await response.json()) as { isNew?: boolean };

    expect(response.status).toBe(200);
    expect(body.isNew).toBe(false);
    expect(state.admin.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe("weapp bearer auth", () => {
  it("authenticateWeappRequest rejects unknown tokens and expired ones", async () => {
    const unknown = await authenticateWeappRequest(
      new Request("https://x.test", { headers: { authorization: `Bearer ${randomWeappToken()}` } }),
      state.admin
    );
    expect(unknown).toBeNull();

    state.admin = makeAdmin({
      weapp_tokens: { data: { id: "t", identity_id: "i", user_id: "u", expires_at: "2000-01-01T00:00:00.000Z" }, error: null }
    });
    const expired = await authenticateWeappRequest(
      new Request("https://x.test", { headers: { authorization: `Bearer ${randomWeappToken()}` } }),
      state.admin
    );
    expect(expired).toBeNull();
  });

  it("me and drafts reject requests without a token", async () => {
    expect((await meGet(new Request("https://x.test"))).status).toBe(401);
    expect(
      (await draftsPost(new Request("https://x.test", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }))).status
    ).toBe(401);
    expect((await opportunitiesGet(new Request("https://x.test"))).status).toBe(401);
  });
});

describe("PATCH /api/weapp/v1/me", () => {
  function tokenRequest(patch: unknown) {
    return new Request("https://x.test/api/weapp/v1/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: "Bearer ff_wa_" + "0".repeat(64) },
      body: JSON.stringify(patch)
    });
  }

  it("upserts brand brain and an operating program with the watchlist", async () => {
    state.admin = makeAdmin({
      weapp_tokens: { data: { id: "t", identity_id: "i", user_id: "user-1", expires_at: "2999-01-01T00:00:00.000Z" }, error: null },
      weapp_identities: { data: { nickname: null }, error: null },
      operating_programs: { data: null, error: null }
    });

    const response = await mePatch(
      tokenRequest({ business: "帮独立开发者做增长的工具", focusKeywords: ["AI", "出海"], platform: "xiaohongshu" })
    );
    expect(response.status).toBe(200);

    const brainUpsert = state.admin.__tables.brand_brains.upsert.mock.calls[0][0];
    expect(brainUpsert.product_description).toBe("帮独立开发者做增长的工具");
    const programInsert = state.admin.__tables.operating_programs.insert.mock.calls[0][0];
    expect(programInsert.watchlist.keywords).toEqual(["AI", "出海"]);
    expect(programInsert.platform).toBe("xiaohongshu");
    expect(programInsert.status).toBe("active");
  });
});

describe("POST /api/weapp/v1/drafts", () => {
  function tokenRequest(body: unknown) {
    return new Request("https://x.test/api/weapp/v1/drafts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer ff_wa_" + "0".repeat(64),
        "x-forwarded-for": "203.0.113.7"
      },
      body: JSON.stringify(body)
    });
  }

  beforeEach(() => {
    state.admin = makeAdmin({
      weapp_tokens: { data: { id: "t", identity_id: "i", user_id: "user-1", expires_at: "2999-01-01T00:00:00.000Z" }, error: null },
      topic_opportunities: { data: { id: "opp-1" }, error: null }
    });
    state.admin.from("weapp_drafts"); // materialize before overriding insert
    state.admin.__tables.weapp_drafts.insert = vi.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "draft-1", status: "pending", credits_charged: 3, created_at: new Date().toISOString() }, error: null })
      })
    }));
  });

  it("creates a pending draft, reserves credits, schedules generation", async () => {
    const response = await draftsPost(
      tokenRequest({ source: "opportunity", opportunityId: "00000000-0000-4000-8000-000000000001", platform: "wechat", topic: { title: "AI 选题测试" } })
    );
    const body = (await response.json()) as { id?: string; cost?: number };

    expect(response.status).toBe(200);
    expect(body.id).toBe("draft-1");
    expect(body.cost).toBe(3);
    expect(state.afterCallbacks.length).toBe(1);
    const insertPayload = state.admin.__tables.weapp_drafts.insert.mock.calls[0][0];
    expect(insertPayload.platform).toBe("wechat");
    expect(insertPayload.credits_charged).toBe(3);
  });

  it("returns 402 without inserting when the balance is insufficient", async () => {
    state.reserveCreditsResult = null;
    const response = await draftsPost(
      tokenRequest({ source: "free", platform: "moments", topic: { title: "额度不足测试" } })
    );
    expect(response.status).toBe(402);
    expect((await response.json()).code).toBe("insufficient_credits");
    expect(state.admin.__tables.weapp_drafts.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when the opportunity belongs to someone else", async () => {
    state.admin = makeAdmin({
      weapp_tokens: { data: { id: "t", identity_id: "i", user_id: "user-1", expires_at: "2999-01-01T00:00:00.000Z" }, error: null },
      topic_opportunities: { data: null, error: null }
    });
    const response = await draftsPost(
      tokenRequest({ source: "opportunity", opportunityId: "00000000-0000-4000-8000-000000000002", platform: "wechat", topic: { title: "越权测试" } })
    );
    expect(response.status).toBe(404);
  });
});
