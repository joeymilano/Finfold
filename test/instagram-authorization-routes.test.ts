import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSocialOAuthAuthorization: vi.fn(),
  consumeSocialOAuthAuthorization: vi.fn(),
  completeSocialOAuthConnection: vi.fn(),
  failSocialOAuthConnection: vi.fn(),
  syncSocialConnectionAccounts: vi.fn(),
  upsertSocialConnectionAccount: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn()
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
  failSocialOAuthConnection: mocks.failSocialOAuthConnection,
  syncSocialConnectionAccounts: mocks.syncSocialConnectionAccounts,
  upsertSocialConnectionAccount: mocks.upsertSocialConnectionAccount
}));
vi.mock("@/lib/secret-encryption", () => ({
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret
}));
vi.mock("@/lib/wechat-component", () => ({ getWechatComponentConfig: () => null }));
vi.mock("@/lib/wechat-connections", () => ({
  createWechatConnectionAuthorizationUrl: vi.fn(),
  completeWechatComponentAuthorization: vi.fn()
}));

import { POST as authorize } from "@/app/api/settings/social-connections/[connectorId]/authorize/route";
import { GET as callback } from "@/app/api/settings/social-connections/[connectorId]/callback/route";

const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";
const connectionId = "d1c85540-4316-4b0f-acf0-714a8dfc89ce";

describe("Instagram authorization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INSTAGRAM_OAUTH_ENABLED", "true");
    vi.stubEnv("INSTAGRAM_OAUTH_CLIENT_ID", "ig-client-id");
    vi.stubEnv("INSTAGRAM_OAUTH_CLIENT_SECRET", "ig-client-secret");
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({ marker: "admin" });
    mocks.encryptSecret.mockImplementation(async (value: string) => `enc:v1:${value}`);
    mocks.completeSocialOAuthConnection.mockResolvedValue({ id: connectionId });
    mocks.syncSocialConnectionAccounts.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("starts and completes a connection-id-bound read-only flow without PKCE", async () => {
    const authorizeResponse = await authorize(
      new Request("https://finfold.example/api/settings/social-connections/instagram/authorize", { method: "POST" }),
      { params: Promise.resolve({ connectorId: "instagram" }) }
    );
    expect(authorizeResponse.status).toBe(200);
    const authorizationPayload = await authorizeResponse.json() as { url: string };
    const authorizationUrl = new URL(authorizationPayload.url);
    expect(authorizationUrl.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_insights");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeNull();
    expect(authorizationPayload.url).not.toContain("content_publish");
    expect(mocks.createSocialOAuthAuthorization).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        userId,
        connectorId: "instagram",
        encryptedPkceVerifier: null,
        redirectUri: "https://finfold.example/api/settings/social-connections/instagram/callback"
      })
    );

    mocks.consumeSocialOAuthAuthorization.mockResolvedValue({
      userId,
      connectorId: "instagram",
      connectionId,
      encryptedPkceVerifier: null,
      redirectUri: "https://finfold.example/api/settings/social-connections/instagram/callback"
    });
    let tokenCall = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      tokenCall += 1;
      return tokenCall === 1
        ? new Response(JSON.stringify({ access_token: "short-token", expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ access_token: "durable-token", expires_in: 5_184_000 }), { status: 200 });
    }));

    const state = authorizationUrl.searchParams.get("state");
    const callbackResponse = await callback(
      new Request(`https://finfold.example/api/settings/social-connections/instagram/callback?state=${state}&code=ig-code`),
      { params: Promise.resolve({ connectorId: "instagram" }) }
    );
    expect(callbackResponse.status).toBe(307);
    expect(callbackResponse.headers.get("location")).toContain("social_status=connected");
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.completeSocialOAuthConnection).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        userId,
        connectionId,
        connectorId: "instagram",
        encryptedAccessToken: "enc:v1:durable-token",
        grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"]
      })
    );
    expect(mocks.syncSocialConnectionAccounts).toHaveBeenCalledWith(
      { marker: "admin" },
      userId,
      "instagram",
      connectionId
    );
  });
});
