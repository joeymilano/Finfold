import { z } from "zod";

export const socialOAuthConnectorIds = ["x", "linkedin"] as const;

export type SocialOAuthConnectorId = (typeof socialOAuthConnectorIds)[number];

export const socialOAuthConnectorIdSchema = z.enum(socialOAuthConnectorIds);

export type SocialOAuthEnvironment = {
  xOauthEnabled?: string;
  xClientId?: string;
  xClientSecret?: string;
  linkedinOauthEnabled?: string;
  linkedinClientId?: string;
  linkedinClientSecret?: string;
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
    // Publishing remains disabled in the capability registry, so do not ask
    // for tweet.write until the publish-job cohort is implemented.
    scopes: ["tweet.read", "users.read", "offline.access"],
    tokenClientAuth: "http-basic"
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
    // Read-only identity + own-post analytics pilot. r_member_social lists the
    // member's own posts; r_member_postAnalytics reads per-post statistics.
    // Never request w_member_social (write/publish).
    scopes: ["openid", "profile", "r_member_social", "r_member_postAnalytics"],
    // LinkedIn's current token endpoint authenticates the client through the
    // request body, not HTTP Basic. Do not assume X's Basic-auth format.
    tokenClientAuth: "request-body"
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
  connectorId: SocialOAuthConnectorId,
  environment: SocialOAuthEnvironment = readRuntimeEnvironment()
): string {
  const origin = resolveSocialOAuthOrigin(request, environment);
  return new URL(`/api/settings/social-connections/${connectorId}/callback`, origin).toString();
}

export function getSocialOAuthSettingsUrl(
  request: Request,
  connectorId: SocialOAuthConnectorId,
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
  pkceChallenge: string;
}): string {
  const url = new URL(input.provider.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.provider.clientId,
    redirect_uri: input.callbackUrl,
    scope: input.provider.scopes.join(" "),
    state: input.state,
    code_challenge: input.pkceChallenge,
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}

function normalizeScopes(value: string | undefined, fallback: readonly string[]): string[] {
  const requested = value ? value.split(/\s+/) : [...fallback];
  return [...new Set(requested.filter((scope) => /^[A-Za-z0-9._:-]{1,128}$/.test(scope)))];
}

/** Exchanges an authorization code without retaining or exposing provider payloads. */
export async function exchangeSocialOAuthAuthorizationCode(
  input: {
    provider: SocialOAuthProvider;
    code: string;
    callbackUrl: string;
    pkceVerifier: string;
  },
  fetcher: FetchLike = fetch
): Promise<SocialOAuthToken> {
  const bodyParams: Record<string, string> = {
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.callbackUrl,
    code_verifier: input.pkceVerifier
  };
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

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    expiresIn: parsed.data.expires_in ?? null,
    grantedScopes: normalizeScopes(parsed.data.scope, input.provider.scopes)
  };
}

export function tokenExpiresAt(expiresIn: number | null, now = new Date()): string | null {
  if (!expiresIn) return null;
  return new Date(now.getTime() + expiresIn * 1_000).toISOString();
}