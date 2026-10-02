import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSocialOAuthAuthorization: vi.fn(),
  consumeSocialOAuthAuthorization: vi.fn(),
  completeSocialOAuthConnection: vi.fn(),
  syncSocialConnectionAccounts: vi.fn(),
  upsertSocialConnectionAccount: vi.fn(),
  getWechatComponentConfig: vi.fn(),
  createWechatConnectionAuthorizationUrl: vi.fn(),
  completeWechatComponentAuthorization: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/social-connections", () => ({
  createSocialOAuthAuthorization: mocks.createSocialOAuthAuthorization,
  consumeSocialOAuthAuthorization: mocks.consumeSocialOAuthAuthorization,
  completeSocialOAuthConnection: mocks.completeSocialOAuthConnection,
  syncSocialConnectionAccounts: mocks.syncSocialConnectionAccounts,
  upsertSocialConnectionAccount: mocks.upsertSocialConnectionAccount
}));
vi.mock("@/lib/wechat-component", () => ({ getWechatComponentConfig: mocks.getWechatComponentConfig }));
vi.mock("@/lib/wechat-connections", () => ({
  createWechatConnectionAuthorizationUrl: mocks.createWechatConnectionAuthorizationUrl,
  completeWechatComponentAuthorization: mocks.completeWechatComponentAuthorization
}));

import { POST as authorize } from "@/app/api/settings/social-connections/[connectorId]/authorize/route";
import { GET as callback } from "@/app/api/settings/social-connections/[connectorId]/callback/route";

const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";
const connectionId = "d1c85540-4316-4b0f-acf0-714a8dfc89ce";

describe("WeChat component authorization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({ marker: "admin" });
    mocks.getWechatComponentConfig.mockReturnValue({
      appId: "wx_component",
      appSecret: "component-secret",
      token: "component-token",
      encodingAesKey: Buffer.alloc(32, 7).toString("base64").replace(/=$/, "")
    });
    mocks.createWechatConnectionAuthorizationUrl.mockImplementation(
      async (_admin: unknown, _config: unknown, callbackUrl: string) => `https://mp.weixin.qq.com/authorize?redirect=${encodeURIComponent(callbackUrl)}`
    );
  });

  it("starts a one-time WeChat authorization without PKCE or browser credentials", async () => {
    const response = await authorize(
      new Request("https://finfold.example/api/settings/social-connections/wechat/authorize", { method: "POST" }),
      { params: Promise.resolve({ connectorId: "wechat" }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { url: string };
    const callbackUrl = mocks.createWechatConnectionAuthorizationUrl.mock.calls[0][2] as string;
    const state = new URL(callbackUrl).searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(payload.url).toContain("mp.weixin.qq.com");
    expect(mocks.createSocialOAuthAuthorization).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        userId,
        connectorId: "wechat",
        encryptedPkceVerifier: null,
        redirectUri: callbackUrl,
        stateHash: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
    );
    expect(payload.url).not.toContain("component-secret");
    expect(payload.url).not.toContain("component-token");
  });

  it("consumes the state once, stores encrypted authorizer tokens, and upserts safe account metadata", async () => {
    let callbackUrl = "";
    mocks.createWechatConnectionAuthorizationUrl.mockImplementation(
      async (_admin: unknown, _config: unknown, value: string) => {
        callbackUrl = value;
        return "https://mp.weixin.qq.com/authorize";
      }
    );
    await authorize(
      new Request("https://finfold.example/api/settings/social-connections/wechat/authorize", { method: "POST" }),
      { params: Promise.resolve({ connectorId: "wechat" }) }
    );
    const state = new URL(callbackUrl).searchParams.get("state");
    if (!state) throw new Error("Expected WeChat authorization state.");

    mocks.consumeSocialOAuthAuthorization.mockResolvedValue({
      userId,
      connectorId: "wechat",
      connectionId,
      encryptedPkceVerifier: null,
      redirectUri: callbackUrl
    });
    mocks.completeWechatComponentAuthorization.mockResolvedValue({
      token: {
        authorizerAppId: "wx_authorizer",
        accessToken: "authorizer-access-token",
        refreshToken: "authorizer-refresh-token",
        expiresIn: 7200,
        permissionIds: [2]
      },
      account: {
        authorizerAppId: "wx_authorizer",
        displayName: "Finfold Official",
        handle: "gh_finfold",
        avatarUrl: "https://mmbiz.qpic.cn/avatar.jpg",
        verified: true,
        serviceType: 2
      },
      grantedScopes: ["wechat_authorized", "wechat_func_2"]
    });
    mocks.completeSocialOAuthConnection.mockResolvedValue({ id: connectionId });
    mocks.upsertSocialConnectionAccount.mockResolvedValue({ id: "account-id" });

    const response = await callback(
      new Request(`https://finfold.example/api/settings/social-connections/wechat/callback?state=${state}&auth_code=wechat-code`),
      { params: Promise.resolve({ connectorId: "wechat" }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("social_connection=wechat");
    expect(response.headers.get("location")).toContain("social_status=connected");
    expect(mocks.completeSocialOAuthConnection).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        userId,
        connectionId,
        connectorId: "wechat",
        encryptedAccessToken: expect.stringMatching(/^enc:v1:/),
        encryptedRefreshToken: expect.stringMatching(/^enc:v1:/),
        grantedScopes: ["wechat_authorized", "wechat_func_2"]
      })
    );
    expect(mocks.upsertSocialConnectionAccount).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        connectionId,
        account: expect.objectContaining({
          externalAccountId: "wx_authorizer",
          displayName: "Finfold Official"
        })
      })
    );
  });
});
