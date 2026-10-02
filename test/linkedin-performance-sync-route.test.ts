import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getSocialConnectionCredentials: vi.fn(),
  listSocialConnectionsWithAccounts: vi.fn(),
  getSocialOAuthProvider: vi.fn(),
  getSocialAdapter: vi.fn()
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
vi.mock("@/lib/social-oauth", () => ({ getSocialOAuthProvider: mocks.getSocialOAuthProvider }));
vi.mock("@/lib/social-adapters", () => ({ getSocialAdapter: mocks.getSocialAdapter }));
vi.mock("@/lib/wechat-component", () => ({ getWechatComponentConfig: () => null }));
vi.mock("@/lib/wechat-connections", () => ({ syncWechatUserSummary: vi.fn() }));

import { POST } from "@/app/api/performance/sync-social/route";

const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";
const connectionId = "d1c85540-4316-4b0f-acf0-714a8dfc89ce";
const selectedAccountId = "b2c85540-4316-4b0f-acf0-714a8dfc89ce";

describe("LinkedIn company Page performance sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.getSocialOAuthProvider.mockReturnValue({ connectorId: "linkedin" });
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId,
      accessToken: "li-token",
      refreshToken: null,
      tokenExpiresAt: "2026-10-25T00:00:00.000Z",
      grantedScopes: ["rw_organization_admin", "r_organization_social"]
    });
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([{
      id: connectionId,
      connectorId: "linkedin",
      status: "connected",
      accounts: [
        {
          id: crypto.randomUUID(),
          connectionId,
          externalAccountId: "79988552",
          accountType: "organization",
          isSelected: false
        },
        {
          id: selectedAccountId,
          connectionId,
          externalAccountId: "90966477",
          accountType: "organization",
          isSelected: true
        }
      ]
    }]);
  });

  it("passes the exact selected Page target and saves evidence against that Page", async () => {
    const listOwnedPosts = vi.fn().mockResolvedValue({
      kind: "ok",
      value: [{
        externalPostId: "urn:li:ugcPost:123",
        text: "Company launch",
        url: null,
        publishedAt: "2026-08-20T00:00:00.000Z"
      }]
    });
    const pollPostMetrics = vi.fn().mockResolvedValue({
      kind: "ok",
      value: [{
        externalPostId: "urn:li:ugcPost:123",
        impressions: 1200,
        views: null,
        reach: null,
        uniqueImpressions: 950,
        reactions: 38,
        comments: 6,
        polledAt: "2026-08-26T09:00:00.000Z"
      }]
    });
    mocks.getSocialAdapter.mockReturnValue({
      listOwnedPosts,
      pollPostMetrics,
      pollAccountMetrics: vi.fn()
    });

    const rpc = vi.fn().mockResolvedValue({ data: { id: crypto.randomUUID() }, error: null });
    const from = vi.fn((table: string) => {
      if (table !== "official_social_post_metrics") throw new Error(`Unexpected table ${table}`);
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null })
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "linkedin", connectionId })
    }));

    expect(response.status).toBe(200);
    const target = { externalAccountId: "90966477", accountType: "organization" };
    expect(listOwnedPosts).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "li-token" }), target);
    expect(pollPostMetrics).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "li-token" }), target);
    expect(rpc).toHaveBeenCalledWith("save_official_social_post_metrics", expect.objectContaining({
      p_user_id: userId,
      p_connection_account_id: selectedAccountId,
      p_external_post_id: "urn:li:ugcPost:123",
      p_impressions: 1200,
      p_reach: 950,
      p_reactions: 38,
      p_comments: 6
    }));
  });

  it("syncs every requested matrix account and reports per-account results", async () => {
    const firstAccountId = crypto.randomUUID();
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([{
      id: connectionId,
      connectorId: "linkedin",
      status: "connected",
      accounts: [
        { id: firstAccountId, connectionId, externalAccountId: "79988552", accountType: "organization", isSelected: false },
        { id: selectedAccountId, connectionId, externalAccountId: "90966477", accountType: "organization", isSelected: true }
      ]
    }]);

    const listOwnedPosts = vi.fn().mockResolvedValue({ kind: "ok", value: [] });
    const pollPostMetrics = vi.fn().mockResolvedValue({ kind: "ok", value: [] });
    mocks.getSocialAdapter.mockReturnValue({
      listOwnedPosts,
      pollPostMetrics,
      pollAccountMetrics: vi.fn()
    });

    const rpc = vi.fn().mockResolvedValue({ data: { id: crypto.randomUUID() }, error: null });
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
    mocks.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectorId: "linkedin",
        connectionId,
        accountIds: [firstAccountId, selectedAccountId]
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.syncedAccounts).toBe(2);
    expect(payload.perAccount).toHaveLength(2);
    expect(listOwnedPosts).toHaveBeenCalledTimes(2);
    expect(pollPostMetrics).toHaveBeenCalledWith(
      expect.anything(),
      { externalAccountId: "79988552", accountType: "organization" }
    );
    expect(pollPostMetrics).toHaveBeenCalledWith(
      expect.anything(),
      { externalAccountId: "90966477", accountType: "organization" }
    );
  });

  it("rejects account ids that do not belong to the connection", async () => {
    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectorId: "linkedin",
        connectionId,
        accountIds: ["99999999-9999-4999-8999-999999999999"]
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("Some selected accounts do not belong to this connection.");
  });
});
