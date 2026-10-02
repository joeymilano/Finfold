import { z } from "zod";

export const socialOAuthConnectorIds = ["x", "linkedin", "instagram"] as const;

export type SocialOAuthConnectorId = (typeof socialOAuthConnectorIds)[number];

export const socialOAuthConnectorIdSchema = z.enum(socialOAuthConnectorIds);

export const socialConnectionAuthorizationConnectorIds = ["x", "linkedin", "instagram", "wechat"] as const;

export type SocialConnectionAuthorizationConnectorId =
  (typeof socialConnectionAuthorizationConnectorIds)[number];

export const socialConnectionAuthorizationConnectorIdSchema = z.enum(
  socialConnectionAuthorizationConnectorIds
);

export type SocialOAuthEnvironment = {
  xOauthEnabled?: string;
  xClientId?: string;
  xClientSecret?: string;
  linkedinOauthEnabled?: string;
  linkedinClientId?: string;
  linkedinClientSecret?: string;
  instagramOauthEnabled?: string;
  instagramClientId?: string;
  instagramClientSecret?: string;
  appUrl?: string;
  deploymentEnv?: string;
};

export type SocialOAuthTokenClientAuth = "http-basic" | "request-body";

export type SocialOAuthProvider = {
  connectorId: SocialOAuthConnectorId;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
  tokenClientAuth: SocialOAuthTokenClientAuth;
  pkce: "s256" | "none";
  scopeSeparator?: " " | ",";
  authorizationParams?: Readonly<Record<string, string>>;
};

export type SocialOAuthToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  grantedScopes: string[];
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(16_384),
  refresh_token: z.string().min(1).max(16_384).optional(),
  expires_in: z.coerce.number().int().positive().max(31_536_000).optional(),
  scope: z.string().max(2_048).optional()
});

function readRuntimeEnvironment(): SocialOAuthEnvironment {
  const environment = process.env as Record<string, string | undefined>;
  return {
    xOauthEnabled: environment.X_OAUTH_ENABLED,
    xClientId: environment.X_OAUTH_CLIENT_ID,
    xClientSecret: environment.X_OAUTH_CLIENT_SECRET,
    linkedinOauthEnabled: environment.LINKEDIN_OAUTH_ENABLED,
    linkedinClientId: environment.LINKEDIN_OAUTH_CLIENT_ID,
    linkedinClientSecret: environment.LINKEDIN_OAUTH_CLIENT_SECRET,
    instagramOauthEnabled: environment.INSTAGRAM_OAUTH_ENABLED,
    instagramClientId: environment.INSTAGRAM_OAUTH_CLIENT_ID,
    instagramClientSecret: environment.INSTAGRAM_OAUTH_CLIENT_SECRET,
    appUrl: environment.NEXT_PUBLIC_APP_URL,
    deploymentEnv: environment.FINFOLD_DEPLOYMENT_ENV
  };
}

function trimConfigurationValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Each connector stays disabled by default even when its credentials are
 * present. An operator must set the connector's _OAUTH_ENABLED=true after the
 * provider app and callback URL have been approved.
 */
export function getSocialOAuthProvider(
  connectorId: SocialOAuthConnectorId,
  environment: SocialOAuthEnvironment = readRuntimeEnvironment()
): SocialOAuthProvider | null {
  switch (connectorId) {
    case "x":
      return getXSocialOAuthProvider(environment);
    case "linkedin":
      return getLinkedInSocialOAuthProvider(environment);
    case "instagram":
      return getInstagramSocialOAuthProvider(environment);
    default:
      return null;
  }
}

function getXSocialOAuthProvider(environment: SocialOAuthEnvironment): SocialOAuthProvider | null {
  if (environment.xOauthEnabled !== "true") return null;
  const clientId = trimConfigurationValue(environment.xClientId);
  const clientSecret = trimConfigurationValue(environment.xClientSecret);
  if (!clientId || !clientSecret) return null;
  return {
    connectorId: "x",
    authorizationEndpoint: "https://twitter.com/i/oauth2/authorize",
    tokenEndpoint: "https://api.x.com/2/oauth2/token",
    clientId,
    clientSecret,
    // tweet.write powers the x_publication_jobs dispatcher (posts, threads,
    // engagement replies). Existing connections granted before this scope
    // must be reauthorized before the pipeline can publish as them.
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    tokenClientAuth: "http-basic",
    pkce: "s256"
  };
}

function getLinkedInSocialOAuthProvider(environment: SocialOAuthEnvironment): SocialOAuthProvider | null {
  if (environment.linkedinOauthEnabled !== "true") return null;
  const clientId = trimConfigurationValue(environment.linkedinClientId);
  const clientSecret = trimConfigurationValue(environment.linkedinClientSecret);
  if (!clientId || !clientSecret) return null;
  return {
    connectorId: "linkedin",
    authorizationEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    clientId,
    clientSecret,
    // Community Management company-page discovery, posts, and organic
    // performance. LinkedIn's member-feed read permission is closed to new
    // applicants, so Finfold does not request member post access. No write or
    // publishing scope is requested.
    scopes: ["rw_organization_admin", "r_organization_social"],
    // LinkedIn's current token endpoint authenticates the client through the
    // request body, not HTTP Basic. Do not assume X's Basic-auth format.
    tokenClientAuth: "request-body",
    pkce: "s256"
  };
}

function getInstagramSocialOAuthProvider(environment: SocialOAuthEnvironment): SocialOAuthProvider | null {
  if (environment.instagramOauthEnabled !== "true") return null;
  const clientId = trimConfigurationValue(environment.instagramClientId);
  const clientSecret = trimConfigurationValue(environment.instagramClientSecret);
  if (!clientId || !clientSecret) return null;
  return {
    connectorId: "instagram",
    authorizationEndpoint: "https://www.instagram.com/oauth/authorize",
    tokenEndpoint: "https://api.instagram.com/oauth/access_token",
    clientId,
    clientSecret,
    // Read-only professional-account identity, owned media, and insights.
    // instagram_business_content_publish is deliberately not requested.
    scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    tokenClientAuth: "request-body",
    pkce: "none",
    scopeSeparator: ",",
    authorizationParams: {
      enable_fb_login: "0",
      force_authentication: "1"
    }
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function textToBase64(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function createSocialOAuthState(): string {
  return randomToken();
}

export function createPkceVerifier(): string {
  return randomToken(48);
}

export async function hashSocialOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

function configuredHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function resolveSocialOAuthOrigin(
  request: Request,
  environment: SocialOAuthEnvironment
): string {
  const deployed = environment.deploymentEnv === "staging" || environment.deploymentEnv === "production";
  if (!deployed) return new URL(request.url).origin;

  const configuredOrigin = configuredHttpsOrigin(environment.appUrl);
  if (!configuredOrigin) {
    throw new Error("Social OAuth requires a valid HTTPS NEXT_PUBLIC_APP_URL in deployed environments.");
  }
  return configuredOrigin;
}

export function getSocialOAuthCallbackUrl(
  request: Request,
  connectorId: SocialConnectionAuthorizationConnectorId,
  environment: SocialOAuthEnvironment = readRuntimeEnvironment()
): string {
  const origin = resolveSocialOAuthOrigin(request, environment);
  return new URL(`/api/settings/social-connections/${connectorId}/callback`, origin).toString();
}

export function getSocialOAuthSettingsUrl(
  request: Request,
  connectorId: SocialConnectionAuthorizationConnectorId,
  status: "connected" | "denied" | "expired" | "failed" | "unavailable",
  environment: SocialOAuthEnvironment = readRuntimeEnvironment()
): string {
  const url = new URL("/settings", resolveSocialOAuthOrigin(request, environment));
  url.searchParams.set("social_connection", connectorId);
  url.searchParams.set("social_status", status);
  return url.toString();
}

export function buildSocialOAuthAuthorizationUrl(input: {
  provider: SocialOAuthProvider;
  callbackUrl: string;
  state: string;
  pkceChallenge?: string | null;
}): string {
  const url = new URL(input.provider.authorizationEndpoint);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: input.provider.clientId,
    redirect_uri: input.callbackUrl,
    scope: input.provider.scopes.join(input.provider.scopeSeparator ?? " "),
    state: input.state,
    ...input.provider.authorizationParams
  };
  if (input.provider.pkce === "s256") {
    if (!input.pkceChallenge) throw new Error("This OAuth provider requires PKCE.");
    params.code_challenge = input.pkceChallenge;
    params.code_challenge_method = "S256";
  }
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

function normalizeScopes(value: string | undefined, fallback: readonly string[]): string[] {
  const requested = value ? value.split(/[\s,]+/) : [...fallback];
  return [...new Set(requested.filter((scope) => /^[A-Za-z0-9._:-]{1,128}$/.test(scope)))];
}

/** Exchanges an authorization code without retaining or exposing provider payloads. */
export async function exchangeSocialOAuthAuthorizationCode(
  input: {
    provider: SocialOAuthProvider;
    code: string;
    callbackUrl: string;
    pkceVerifier?: string | null;
  },
  fetcher: FetchLike = fetch
): Promise<SocialOAuthToken> {
  const bodyParams: Record<string, string> = {
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.callbackUrl
  };
  if (input.provider.pkce === "s256") {
    if (!input.pkceVerifier) throw new Error("This OAuth provider requires a PKCE verifier.");
    bodyParams.code_verifier = input.pkceVerifier;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json"
  };
  if (input.provider.tokenClientAuth === "http-basic") {
    headers.Authorization = `Basic ${textToBase64(`${input.provider.clientId}:${input.provider.clientSecret}`)}`;
  } else {
    // request-body: pass client credentials in the form body (LinkedIn).
    bodyParams.client_id = input.provider.clientId;
    bodyParams.client_secret = input.provider.clientSecret;
  }

  const response = await fetcher(input.provider.tokenEndpoint, {
    method: "POST",
    headers,
    body: new URLSearchParams(bodyParams)
  });

  if (!response.ok) {
    throw new Error("The social platform rejected the authorization code.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The social platform returned an invalid token response.");
  }
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("The social platform returned an invalid token response.");
  }

  const shortLivedToken = {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    expiresIn: parsed.data.expires_in ?? null,
    grantedScopes: normalizeScopes(parsed.data.scope, input.provider.scopes)
  };

  if (input.provider.connectorId !== "instagram") return shortLivedToken;

  // Business Login for Instagram returns a short-lived Instagram User token.
  // Exchange it server-side so a weekly operating loop does not depend on an
  // hourly reauthorization. The app secret never reaches the browser.
  const exchangeUrl = new URL("https://graph.instagram.com/access_token");
  exchangeUrl.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: input.provider.clientSecret,
    access_token: shortLivedToken.accessToken
  }).toString();
  const longLivedResponse = await fetcher(exchangeUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!longLivedResponse.ok) {
    throw new Error("Instagram could not issue a durable access token.");
  }
  const longLivedPayload = tokenResponseSchema.safeParse(await longLivedResponse.json());
  if (!longLivedPayload.success) {
    throw new Error("Instagram returned an invalid durable token response.");
  }
  return {
    accessToken: longLivedPayload.data.access_token,
    refreshToken: null,
    expiresIn: longLivedPayload.data.expires_in ?? shortLivedToken.expiresIn,
    grantedScopes: shortLivedToken.grantedScopes
  };
}

export function tokenExpiresAt(expiresIn: number | null, now = new Date()): string | null {
  if (!expiresIn) return null;
  return new Date(now.getTime() + expiresIn * 1_000).toISOString();
}

/**
 * Refreshes a user-context token with the refresh_token grant. X access
 * tokens expire after two hours, so the publication dispatcher refreshes
 * proactively instead of failing mid-thread.
 */
export async function exchangeSocialOAuthRefreshToken(
  input: {
    provider: SocialOAuthProvider;
    refreshToken: string;
  },
  fetcher: FetchLike = fetch
): Promise<SocialOAuthToken> {
  if (!input.refreshToken) throw new Error("This OAuth connection has no refresh token.");
  const bodyParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json"
  };
  if (input.provider.tokenClientAuth === "http-basic") {
    headers.Authorization = `Basic ${textToBase64(`${input.provider.clientId}:${input.provider.clientSecret}`)}`;
  } else {
    bodyParams.client_id = input.provider.clientId;
    bodyParams.client_secret = input.provider.clientSecret;
  }

  const response = await fetcher(input.provider.tokenEndpoint, {
    method: "POST",
    headers,
    body: new URLSearchParams(bodyParams)
  });
  if (!response.ok) {
    throw new Error("The social platform rejected the refresh token.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The social platform returned an invalid token response.");
  }
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("The social platform returned an invalid token response.");
  }
  return {
    accessToken: parsed.data.access_token,
    // OAuth refresh flows may rotate the refresh token; when the provider
    // omits one the previous token remains valid.
    refreshToken: parsed.data.refresh_token ?? input.refreshToken,
    expiresIn: parsed.data.expires_in ?? null,
    grantedScopes: normalizeScopes(parsed.data.scope, input.provider.scopes)
  };
}
