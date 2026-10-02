import { describe, expect, it } from "vitest";
import {
  buildSocialOAuthAuthorizationUrl,
  createPkceChallenge,
  exchangeSocialOAuthAuthorizationCode,
  exchangeSocialOAuthRefreshToken,
  getSocialOAuthCallbackUrl,
  getSocialOAuthProvider,
  hashSocialOAuthState,
  tokenExpiresAt
} from "@/lib/social-oauth";

const configuredEnvironment = {
  xOauthEnabled: "true",
  xClientId: "client-id",
  xClientSecret: "client-secret",
  appUrl: "https://app.finfold.example",
  deploymentEnv: "production"
} as const;

const linkedinConfiguredEnvironment = {
  ...configuredEnvironment,
  linkedinOauthEnabled: "true",
  linkedinClientId: "li-client-id",
  linkedinClientSecret: "li-client-secret"
} as const;

const instagramConfiguredEnvironment = {
  ...configuredEnvironment,
  instagramOauthEnabled: "true",
  instagramClientId: "ig-client-id",
  instagramClientSecret: "ig-client-secret"
} as const;

describe("social OAuth", () => {
  it("stays disabled until an operator explicitly enables a configured provider", () => {
    expect(getSocialOAuthProvider("x", { ...configuredEnvironment, xOauthEnabled: "false" })).toBeNull();
    expect(getSocialOAuthProvider("x", { ...configuredEnvironment, xClientSecret: "" })).toBeNull();
    expect(getSocialOAuthProvider("x", configuredEnvironment)).toMatchObject({
      connectorId: "x",
      clientId: "client-id",
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"]
    });
  });

  it("uses a configured deployed origin and PKCE S256 authorization parameters", async () => {
    const provider = getSocialOAuthProvider("x", configuredEnvironment);
    if (!provider) throw new Error("Expected configured X OAuth provider.");

    const callbackUrl = getSocialOAuthCallbackUrl(
      new Request("http://localhost:8788/api/settings/social-connections/x/authorize"),
      "x",
      configuredEnvironment
    );
    const url = new URL(buildSocialOAuthAuthorizationUrl({
      provider,
      callbackUrl,
      state: "state-value",
      pkceChallenge: await createPkceChallenge("verifier-value")
    }));

    expect(callbackUrl).toBe("https://app.finfold.example/api/settings/social-connections/x/callback");
    expect(url.origin).toBe("https://twitter.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(callbackUrl);
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(url.toString()).not.toContain("client-secret");
  });

  it("hashes opaque OAuth state before it reaches persistence", async () => {
    await expect(hashSocialOAuthState("state-value")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("exchanges the code through the token endpoint without sending secrets in the body", async () => {
    const provider = getSocialOAuthProvider("x", configuredEnvironment);
    if (!provider) throw new Error("Expected configured X OAuth provider.");

    const token = await exchangeSocialOAuthAuthorizationCode(
      {
        provider,
        code: "authorization-code",
        callbackUrl: "https://app.finfold.example/api/settings/social-connections/x/callback",
        pkceVerifier: "verifier-value"
      },
      async (input, init) => {
        expect(input).toBe("https://api.x.com/2/oauth2/token");
        expect(new Headers(init?.headers).get("authorization")).toBe("Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=");
        expect(init?.body?.toString()).toContain("code=authorization-code");
        expect(init?.body?.toString()).toContain("code_verifier=verifier-value");
        expect(init?.body?.toString()).not.toContain("client-secret");
        return new Response(JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 7_200,
          scope: "tweet.read users.read offline.access"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    );

    expect(token).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 7_200,
      grantedScopes: ["tweet.read", "users.read", "offline.access"]
    });
    expect(tokenExpiresAt(7_200, new Date("2026-08-05T09:00:00.000Z"))).toBe("2026-08-05T11:00:00.000Z");
  });

  it("refreshes an X user-context token over HTTP Basic without leaking the client secret", async () => {
    const provider = getSocialOAuthProvider("x", configuredEnvironment);
    if (!provider) throw new Error("Expected configured X OAuth provider.");

    const token = await exchangeSocialOAuthRefreshToken(
      { provider, refreshToken: "refresh-token" },
      async (input, init) => {
        expect(input).toBe("https://api.x.com/2/oauth2/token");
        expect(new Headers(init?.headers).get("authorization")).toBe("Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=");
        expect(init?.body?.toString()).toContain("grant_type=refresh_token");
        expect(init?.body?.toString()).toContain("refresh_token=refresh-token");
        expect(init?.body?.toString()).not.toContain("client-secret");
        return new Response(JSON.stringify({
          access_token: "next-access-token",
          expires_in: 7_200,
          scope: "tweet.read tweet.write users.read offline.access"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    );

    expect(token.accessToken).toBe("next-access-token");
    // X rotates refresh tokens; when the response omits one, the previous
    // token stays valid and must be preserved for the next refresh.
    expect(token.refreshToken).toBe("refresh-token");
    expect(token.grantedScopes).toEqual(["tweet.read", "tweet.write", "users.read", "offline.access"]);
  });

  it("keeps LinkedIn disabled until its own flag and secrets are configured", () => {
    expect(getSocialOAuthProvider("linkedin", configuredEnvironment)).toBeNull();
    expect(getSocialOAuthProvider("linkedin", { ...linkedinConfiguredEnvironment, linkedinOauthEnabled: "false" })).toBeNull();
    expect(getSocialOAuthProvider("linkedin", { ...linkedinConfiguredEnvironment, linkedinClientSecret: "" })).toBeNull();
    expect(getSocialOAuthProvider("linkedin", { ...linkedinConfiguredEnvironment, linkedinClientId: undefined })).toBeNull();
    expect(getSocialOAuthProvider("linkedin", linkedinConfiguredEnvironment)).toMatchObject({
      connectorId: "linkedin",
      clientId: "li-client-id",
      scopes: ["rw_organization_admin", "r_organization_social"],
      tokenClientAuth: "request-body"
    });
  });

  it("builds a read-only LinkedIn authorization URL with S256 PKCE and no write scope", async () => {
    const provider = getSocialOAuthProvider("linkedin", linkedinConfiguredEnvironment);
    if (!provider) throw new Error("Expected configured LinkedIn OAuth provider.");

    const callbackUrl = getSocialOAuthCallbackUrl(
      new Request("http://localhost:8788/api/settings/social-connections/linkedin/authorize"),
      "linkedin",
      linkedinConfiguredEnvironment
    );
    const url = new URL(buildSocialOAuthAuthorizationUrl({
      provider,
      callbackUrl,
      state: "li-state",
      pkceChallenge: await createPkceChallenge("li-verifier")
    }));

    expect(callbackUrl).toBe("https://app.finfold.example/api/settings/social-connections/linkedin/callback");
    expect(url.origin).toBe("https://www.linkedin.com");
    expect(url.searchParams.get("client_id")).toBe("li-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(callbackUrl);
    expect(url.searchParams.get("state")).toBe("li-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("rw_organization_admin r_organization_social");
    expect(url.toString()).not.toContain("r_member_social");
    expect(url.toString()).not.toContain("w_member_social");
    expect(url.toString()).not.toContain("li-client-secret");
  });

  it("exchanges the LinkedIn code with client credentials in the body, not HTTP Basic", async () => {
    const provider = getSocialOAuthProvider("linkedin", linkedinConfiguredEnvironment);
    if (!provider) throw new Error("Expected configured LinkedIn OAuth provider.");

    const token = await exchangeSocialOAuthAuthorizationCode(
      {
        provider,
        code: "li-code",
        callbackUrl: "https://app.finfold.example/api/settings/social-connections/linkedin/callback",
        pkceVerifier: "li-verifier"
      },
      async (input, init) => {
        expect(input).toBe("https://www.linkedin.com/oauth/v2/accessToken");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBeNull();
        const body = init?.body?.toString() ?? "";
        expect(body).toContain("code=li-code");
        expect(body).toContain("code_verifier=li-verifier");
        expect(body).toContain("client_id=li-client-id");
        expect(body).toContain("client_secret=li-client-secret");
        return new Response(JSON.stringify({
          access_token: "li-access-token",
          expires_in: 3_600,
          scope: "rw_organization_admin r_organization_social"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    );

    expect(token).toEqual({
      accessToken: "li-access-token",
      refreshToken: null,
      expiresIn: 3_600,
      grantedScopes: ["rw_organization_admin", "r_organization_social"]
    });
  });

  it("keeps Instagram read-only and disabled until Meta credentials and the explicit flag exist", () => {
    expect(getSocialOAuthProvider("instagram", configuredEnvironment)).toBeNull();
    expect(getSocialOAuthProvider("instagram", { ...instagramConfiguredEnvironment, instagramOauthEnabled: "false" })).toBeNull();
    expect(getSocialOAuthProvider("instagram", { ...instagramConfiguredEnvironment, instagramClientSecret: "" })).toBeNull();
    expect(getSocialOAuthProvider("instagram", instagramConfiguredEnvironment)).toMatchObject({
      connectorId: "instagram",
      pkce: "none",
      scopes: ["instagram_business_basic", "instagram_business_manage_insights"]
    });
  });

  it("builds Business Login for Instagram without publish scope or unsupported PKCE parameters", () => {
    const provider = getSocialOAuthProvider("instagram", instagramConfiguredEnvironment);
    if (!provider) throw new Error("Expected configured Instagram OAuth provider.");
    const callbackUrl = getSocialOAuthCallbackUrl(
      new Request("http://localhost:8788/api/settings/social-connections/instagram/authorize"),
      "instagram",
      instagramConfiguredEnvironment
    );
    const url = new URL(buildSocialOAuthAuthorizationUrl({
      provider,
      callbackUrl,
      state: "ig-state"
    }));

    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_insights");
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("enable_fb_login")).toBe("0");
    expect(url.toString()).not.toContain("content_publish");
    expect(url.toString()).not.toContain("ig-client-secret");
  });

  it("exchanges Instagram authorization for a durable server-side token", async () => {
    const provider = getSocialOAuthProvider("instagram", instagramConfiguredEnvironment);
    if (!provider) throw new Error("Expected configured Instagram OAuth provider.");
    let requestIndex = 0;
    const token = await exchangeSocialOAuthAuthorizationCode({
      provider,
      code: "ig-code",
      callbackUrl: "https://app.finfold.example/api/settings/social-connections/instagram/callback",
      pkceVerifier: null
    }, async (input, init) => {
      requestIndex += 1;
      if (requestIndex === 1) {
        expect(String(input)).toBe("https://api.instagram.com/oauth/access_token");
        const body = init?.body?.toString() ?? "";
        expect(body).toContain("client_id=ig-client-id");
        expect(body).toContain("client_secret=ig-client-secret");
        expect(body).not.toContain("code_verifier");
        return new Response(JSON.stringify({ access_token: "short-token", expires_in: 3_600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      const url = new URL(String(input));
      expect(url.origin).toBe("https://graph.instagram.com");
      expect(url.searchParams.get("grant_type")).toBe("ig_exchange_token");
      expect(url.searchParams.get("access_token")).toBe("short-token");
      return new Response(JSON.stringify({ access_token: "durable-token", expires_in: 5_184_000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    expect(token).toEqual({
      accessToken: "durable-token",
      refreshToken: null,
      expiresIn: 5_184_000,
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"]
    });
  });
});
