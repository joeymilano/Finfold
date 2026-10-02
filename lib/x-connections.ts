import {
  exchangeSocialOAuthRefreshToken,
  getSocialOAuthProvider,
  tokenExpiresAt
} from "@/lib/social-oauth";
import {
  getSocialConnectionCredentials,
  refreshSocialConnectionCredentials
} from "@/lib/social-connections";
import { encryptSecret } from "@/lib/secret-encryption";
import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ActiveXCredentials = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
};

// In-flight refresh dedupe: a dispatch wave may ask for credentials per job,
// and X refresh tokens are single-use on rotation — concurrent refreshes
// would burn the rotated token before it is persisted.
const xTokenRefreshes = new Map<string, Promise<ActiveXCredentials>>();

async function refreshActiveXCredentials(
  admin: AdminClient,
  userId: string,
  credentials: ActiveXCredentials,
  fetcher: FetchLike
): Promise<ActiveXCredentials> {
  const existing = xTokenRefreshes.get(credentials.connectionId);
  if (existing) return existing;

  const refresh = (async () => {
    const provider = getSocialOAuthProvider("x");
    if (!provider) throw new Error("X OAuth is not enabled for this deployment.");
    if (!credentials.refreshToken) {
      throw new Error("The X connection cannot be refreshed. Reconnect it in Settings.");
    }
    const refreshed = await exchangeSocialOAuthRefreshToken(
      { provider, refreshToken: credentials.refreshToken },
      fetcher
    );
    const tokenExpiresAtValue = tokenExpiresAt(refreshed.expiresIn);
    await refreshSocialConnectionCredentials(admin, {
      userId,
      connectorId: "x",
      connectionId: credentials.connectionId,
      encryptedAccessToken: await encryptSecret(refreshed.accessToken),
      encryptedRefreshToken: refreshed.refreshToken
        ? await encryptSecret(refreshed.refreshToken)
        : null,
      tokenExpiresAt: tokenExpiresAtValue
    });
    return {
      connectionId: credentials.connectionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: tokenExpiresAtValue,
      grantedScopes: refreshed.grantedScopes
    };
  })();

  xTokenRefreshes.set(credentials.connectionId, refresh);
  try {
    return await refresh;
  } finally {
    xTokenRefreshes.delete(credentials.connectionId);
  }
}

/** Refreshes only when the stored token is missing or expires within 5 minutes. */
async function withFreshXToken(
  admin: AdminClient,
  userId: string,
  credentials: ActiveXCredentials,
  forceRefresh: boolean,
  fetcher: FetchLike
): Promise<ActiveXCredentials> {
  const expiresSoon = !credentials.tokenExpiresAt
    || Date.parse(credentials.tokenExpiresAt) <= Date.now() + 5 * 60 * 1_000;
  if (!forceRefresh && !expiresSoon) return credentials;
  return refreshActiveXCredentials(admin, userId, credentials, fetcher);
}

/**
 * Read-only counterpart for sync paths (users.read): no tweet.write scope
 * requirement and refresh-aware, so long-idle connections still sync instead
 * of failing on X's two-hour access tokens.
 */
export async function getActiveXReadCredentials(
  admin: AdminClient,
  userId: string,
  connectionId?: string,
  fetcher: FetchLike = fetch
): Promise<ActiveXCredentials | null> {
  const credentials = await getSocialConnectionCredentials(admin, userId, "x", connectionId);
  if (!credentials) return null;
  return withFreshXToken(admin, userId, credentials, false, fetcher);
}

export async function getActiveXPublishingCredentials(
  admin: AdminClient,
  userId: string,
  forceRefresh = false,
  fetcher: FetchLike = fetch
): Promise<ActiveXCredentials> {
  const credentials = await getSocialConnectionCredentials(admin, userId, "x");
  if (!credentials) {
    throw new Error("Connect the X account in Settings before publishing.");
  }
  if (!credentials.grantedScopes.includes("tweet.write")) {
    throw new Error("The connected X account did not grant posting permission. Reconnect it.");
  }
  return withFreshXToken(admin, userId, credentials, forceRefresh, fetcher);
}
