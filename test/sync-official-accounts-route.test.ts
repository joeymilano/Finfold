import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getSocialConnectionCredentials: vi.fn(),
  getActiveXReadCredentials: vi.fn(),
  listSocialConnectionsWithAccounts: vi.fn(),
  getSocialOAuthProvider: vi.fn(),
  getSocialAdapter: vi.fn(),
  syncWechatUserSummary: vi.fn(),
  getWechatComponentConfig: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/social-connections", () => ({
  getSocialConnectionCredentials: mocks.getSocialConnectionCredentials,
  listSocialConnectionsWithAccounts: mocks.listSocialConnectionsWithAccounts
}));
vi.mock("@/lib/x-connections", () => ({ getActiveXReadCredentials: mocks.getActiveXReadCredentials }));
vi.mock("@/lib/social-oauth", () => ({ getSocialOAuthProvider: mocks.getSocialOAuthProvider }));
vi.mock("@/lib/social-adapters", () => ({ getSocialAdapter: mocks.getSocialAdapter }));
vi.mock("@/lib/wechat-component", () => ({ getWechatComponentConfig: mocks.getWechatComponentConfig }));
vi.mock("@/lib/wechat-connections", () => ({ syncWechatUserSummary: mocks.syncWechatUserSummary }));

import { POST } from "@/app/api/performance/sync-official-accounts/route";

const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";
const linkedinConnectionId = "d1c85540-4316-4b0f-acf0-714a8dfc89ce";
const wechatConnectionId = "e2c85540-4316-4b0f-acf0-714a8dfc89ce";
const xConnectionId = "c4d85540-4316-4b0f-acf0-714a8dfc89ce";

function connectionAccount(id: string, externalAccountId: string, isSelected = false) {
  return {
    id,
    connectionId: linkedinConnectionId,
    externalAccountId,
    accountType: "organization" as const,
    handle: null,
    displayName: `Page ${externalAccountId}`,
    avatarUrl: null,
    isSelected,
    updatedAt: "2026-09-09T00:00:00.000Z"
  };
}

describe("sync-official-accounts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.getSocialOAuthProvider.mockReturnValue({ connectorId: "linkedin" });
    mocks.getWechatComponentConfig.mockReturnValue(null);
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId: linkedinConnectionId,
      accessToken: "li-token",
      refreshToken: null,
      tokenExpiresAt: "2026-10-25T00:00:00.000Z",
      grantedScopes: ["rw_organization_admin"]
    });
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([
      {
        id: linkedinConnectionId,
        connectorId: "linkedin",
        status: "connected",
        accounts: [
          connectionAccount("11111111-1111-4111-8111-111111111111", "79988552"),
          connectionAccount("22222222-2222-4222-8222-222222222222", "90966477", true)
        ]
      },
      {
        id: wechatConnectionId,
        connectorId: "wechat",
        status: "connected",
        accounts: []
      },
      {
        id: "f3c85540-4316-4b0f-acf0-714a8dfc89ce",
        connectorId: "instagram",
        status: "expired",
        accounts: []
      }
    ]);
    mocks.getSocialAdapter.mockReturnValue({
      listOwnedPosts: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
      pollPostMetrics: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
      pollAccountMetrics: vi.fn().mockResolvedValue({ kind: "unsupported", operation: "account-metrics", reason: "not available" })
    });
    const from = vi.fn(() => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null })
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null }) });
  });

  it("walks every connected authorization and every account under it", async () => {
    const response = await POST(new Request("https://finfold.example/api/performance/sync-official-accounts", { method: "POST" }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.synced).toBe(2);
    expect(payload.failed).toBe(0);
    expect(payload.results).toHaveLength(3);
    expect(payload.results.filter((result: { status: string }) => result.status === "synced").map((result: { accountLabel: string | null }) => result.accountLabel))
      .toEqual(["Page 79988552", "Page 90966477"]);
    const wechatResult = payload.results.find((result: { connectorId: string }) => result.connectorId === "wechat");
    expect(wechatResult.status).toBe("skipped");
  });

  it("does not touch expired authorizations", async () => {
    const response = await POST(new Request("https://finfold.example/api/performance/sync-official-accounts", { method: "POST" }));

    const payload = await response.json();
    expect(payload.results.some((result: { connectorId: string }) => result.connectorId === "instagram")).toBe(false);
  });

  it("keeps one failing account from blocking the others", async () => {
    mocks.getSocialAdapter.mockImplementation(() => ({
      listOwnedPosts: vi.fn().mockResolvedValue({ kind: "unsupported", operation: "owned-posts", reason: "role missing" }),
      pollPostMetrics: vi.fn(),
      pollAccountMetrics: vi.fn()
    }));

    const response = await POST(new Request("https://finfold.example/api/performance/sync-official-accounts", { method: "POST" }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.synced).toBe(0);
    expect(payload.failed).toBe(2);
    expect(payload.results.every((result: { status: string }) => result.status === "failed" || result.status === "skipped")).toBe(true);
  });

  it("syncs x through the refresh-aware credential path", async () => {
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([
      {
        id: xConnectionId,
        connectorId: "x",
        status: "connected",
        accounts: [{
          ...connectionAccount("33333333-3333-4333-8333-333333333333", "17700013"),
          connectionId: xConnectionId,
          accountType: "profile" as const,
          handle: "@ItsJoeyDesign",
          displayName: "ItsJoeyDesign"
        }]
      }
    ]);
    mocks.getActiveXReadCredentials.mockResolvedValue({
      connectionId: xConnectionId,
      accessToken: "refreshed-x-token",
      refreshToken: "rotated-refresh",
      tokenExpiresAt: "2026-09-27T22:00:00.000Z",
      grantedScopes: ["users.read", "offline.access"]
    });
    const pollAccountMetrics = vi.fn().mockResolvedValue({
      kind: "ok",
      value: [{
        externalAccountId: "17700013",
        followerCount: 193,
        views: null,
        reach: null,
        profileViews: null,
        polledAt: "2026-09-27T13:00:00.000Z"
      }]
    });
    mocks.getSocialAdapter.mockReturnValue({ pollAccountMetrics });

    const response = await POST(new Request("https://finfold.example/api/performance/sync-official-accounts", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(mocks.getActiveXReadCredentials).toHaveBeenCalledWith(expect.anything(), userId, xConnectionId);
    expect(mocks.getSocialConnectionCredentials).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.synced).toBe(1);
    expect(payload.failed).toBe(0);
    expect(payload.results[0].accountLabel).toBe("ItsJoeyDesign");
  });

  it("surfaces a dead refresh token as a failed result with its reason", async () => {
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([
      {
        id: xConnectionId,
        connectorId: "x",
        status: "connected",
        accounts: [{
          ...connectionAccount("33333333-3333-4333-8333-333333333333", "17700013"),
          connectionId: xConnectionId,
          accountType: "profile" as const,
          handle: "@ItsJoeyDesign",
          displayName: "ItsJoeyDesign"
        }]
      }
    ]);
    mocks.getActiveXReadCredentials.mockRejectedValue(new Error("The social platform rejected the refresh token."));

    const response = await POST(new Request("https://finfold.example/api/performance/sync-official-accounts", { method: "POST" }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.synced).toBe(0);
    expect(payload.failed).toBe(1);
    expect(payload.results[0].status).toBe("failed");
    expect(payload.results[0].accountLabel).toBe("ItsJoeyDesign");
    expect(payload.results[0].error).toBe("The social platform rejected the refresh token.");
  });
});
