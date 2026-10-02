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
const accountId = "b2c85540-4316-4b0f-acf0-714a8dfc89ce";

describe("Instagram performance sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.getSocialOAuthProvider.mockReturnValue({ connectorId: "instagram" });
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId,
      accessToken: "ig-token",
      refreshToken: null,
      tokenExpiresAt: "2026-10-25T00:00:00.000Z",
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"]
    });
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([{
      id: connectionId,
      connectorId: "instagram",
      status: "connected",
      accounts: [{
        id: accountId,
        connectionId,
        externalAccountId: "17841400000000001",
        accountType: "profile",
        isSelected: true
      }]
    }]);
    mocks.getSocialAdapter.mockReturnValue({
      listOwnedPosts: vi.fn().mockResolvedValue({
        kind: "ok",
        value: [{ externalPostId: "18000000000000001", text: "Launch", url: null, publishedAt: null }]
      }),
      pollPostMetrics: vi.fn().mockResolvedValue({
        kind: "ok",
        value: [{
          externalPostId: "18000000000000001",
          impressions: null,
          views: 900,
          reach: 750,
          uniqueImpressions: null,
          reactions: 12,
          comments: 3,
          polledAt: "2026-08-26T09:00:00.000Z"
        }]
      }),
      pollAccountMetrics: vi.fn().mockResolvedValue({
        kind: "ok",
        value: [{
          externalAccountId: "17841400000000001",
          followerCount: 321,
          views: 4200,
          reach: 3100,
          profileViews: 88,
          polledAt: "2026-08-26T09:00:00.000Z"
        }]
      })
    });
  });

  it("attributes posts and aggregate account metrics to the requested connection account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { managed_account_id: crypto.randomUUID() }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "official_social_post_metrics") {
        const existingQuery = {
          select: vi.fn(),
          eq: vi.fn(),
          then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null })
        };
        existingQuery.select.mockReturnValue(existingQuery);
        existingQuery.eq.mockReturnValue(existingQuery);
        return existingQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from, rpc });

    const response = await POST(new Request("https://finfold.example/api/performance/sync-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "instagram", connectionId })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      imported: 1,
      created: 1,
      updated: 0,
      accountMetricsImported: true,
      evidence: [{
        externalPostId: "18000000000000001",
        impressions: null,
        views: 900,
        reach: 750,
        reactions: 12,
        comments: 3
      }],
      accountEvidence: {
        followerCount: 321,
        views: 4200,
        reach: 3100,
        profileViews: 88
      }
    });
    expect(mocks.getSocialConnectionCredentials).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      "instagram",
      connectionId
    );
    expect(rpc).toHaveBeenCalledWith("save_official_social_post_metrics", expect.objectContaining({
      p_user_id: userId,
      p_connection_account_id: accountId,
      p_external_post_id: "18000000000000001",
      p_impressions: null,
      p_views: 900,
      p_reach: 750,
      p_reactions: 12,
      p_comments: 3
    }));
    expect(rpc).toHaveBeenCalledWith("save_official_social_account_metrics", expect.objectContaining({
      p_user_id: userId,
      p_connection_account_id: accountId,
      p_follower_count: 321,
      p_views: 4200,
      p_reach: 3100,
      p_profile_views: 88
    }));
  });
});
