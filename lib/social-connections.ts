import { z } from "zod";
import {
  socialConnectorIds,
  type SocialConnectorId
} from "@/lib/social-platform-capabilities";
import {
  socialConnectionAuthorizationConnectorIds,
  type SocialConnectionAuthorizationConnectorId,
  type SocialOAuthConnectorId
} from "@/lib/social-oauth";
import { getSocialAdapter, type SocialExternalAccount } from "@/lib/social-adapters";
import { decryptSecret } from "@/lib/secret-encryption";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const socialConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "expired",
  "revoked",
  "error",
  "disconnected"
]);

export type SocialConnectionStatus = z.infer<typeof socialConnectionStatusSchema>;

const socialOAuthAuthorizationSchema = z.object({
  user_id: z.string().uuid(),
  connector_id: z.enum(socialConnectionAuthorizationConnectorIds),
  connection_id: z.string().uuid(),
  encrypted_pkce_verifier: z.string().min(1).nullable(),
  redirect_uri: z.string().url()
});

export type SocialOAuthAuthorization = {
  userId: string;
  connectorId: SocialConnectionAuthorizationConnectorId;
  connectionId: string;
  encryptedPkceVerifier: string | null;
  redirectUri: string;
};

const socialConnectionSummarySchema = z.object({
  id: z.string().uuid(),
  connector_id: z.enum(socialConnectorIds),
  status: socialConnectionStatusSchema,
  token_expires_at: z.string().min(1).nullable(),
  granted_scopes: z.array(z.string()),
  last_error_code: z.string().nullable(),
  connected_at: z.string().min(1).nullable(),
  updated_at: z.string().min(1)
});

export type SocialConnectionSummary = {
  id: string;
  connectorId: SocialConnectorId;
  status: SocialConnectionStatus;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
  lastErrorCode: string | null;
  connectedAt: string | null;
  updatedAt: string;
};

const socialConnectionAccountSummarySchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  external_account_id: z.string().min(1),
  account_type: z.enum(["profile", "page", "organization"]),
  handle: z.string().min(1).nullable(),
  display_name: z.string().min(1).nullable(),
  avatar_url: z.string().url().nullable(),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
  is_selected: z.boolean(),
  updated_at: z.string().min(1)
});

const socialConnectionCredentialSchema = z.object({
  id: z.string().uuid(),
  connector_id: z.enum(socialConnectionAuthorizationConnectorIds),
  status: z.literal("connected"),
  encrypted_access_token: z.string().min(1),
  encrypted_refresh_token: z.string().min(1).nullable(),
  token_expires_at: z.string().min(1).nullable(),
  granted_scopes: z.array(z.string())
});

export type SocialConnectionAccountSummary = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  accountType: "profile" | "page" | "organization";
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  providerMetadata?: Record<string, unknown>;
  isSelected: boolean;
  updatedAt: string;
};

export type SocialConnectionWithAccounts = SocialConnectionSummary & {
  accounts: SocialConnectionAccountSummary[];
};

/**
 * Converts the intentionally narrow database projection into a response-safe
 * shape. OAuth credentials are never selected or represented here.
 */
export function toSocialConnectionSummary(value: unknown): SocialConnectionSummary {
  const row = socialConnectionSummarySchema.parse(value);
  return {
    id: row.id,
    connectorId: row.connector_id,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    grantedScopes: row.granted_scopes,
    lastErrorCode: row.last_error_code,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at
  };
}

export function toSocialConnectionAccountSummary(value: unknown): SocialConnectionAccountSummary {
  const includesProviderMetadata = value !== null
    && typeof value === "object"
    && Object.hasOwn(value, "provider_metadata");
  const row = socialConnectionAccountSummarySchema.parse(value);
  return {
    id: row.id,
    connectionId: row.connection_id,
    externalAccountId: row.external_account_id,
    accountType: row.account_type,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    ...(includesProviderMetadata ? { providerMetadata: row.provider_metadata } : {}),
    isSelected: row.is_selected,
    updatedAt: row.updated_at
  };
}

export async function listSocialConnectionSummaries(
  admin: AdminClient,
  userId: string
): Promise<SocialConnectionSummary[]> {
  const { data, error } = await admin
    .from("social_connections")
    .select("id, connector_id, status, token_expires_at, granted_scopes, last_error_code, connected_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map(toSocialConnectionSummary);
}

export async function listSocialConnectionsWithAccounts(
  admin: AdminClient,
  userId: string
): Promise<SocialConnectionWithAccounts[]> {
  const connections = await listSocialConnectionSummaries(admin, userId);
  if (connections.length === 0) return [];

  const { data, error } = await admin
    .from("social_connection_accounts")
    .select("id, connection_id, external_account_id, account_type, handle, display_name, avatar_url, provider_metadata, is_selected, updated_at")
    .in("connection_id", connections.map((connection) => connection.id));
  if (error) throw error;

  const accountsByConnection = new Map<string, SocialConnectionAccountSummary[]>();
  for (const account of (data ?? []).map(toSocialConnectionAccountSummary)) {
    const accounts = accountsByConnection.get(account.connectionId) ?? [];
    accounts.push(account);
    accountsByConnection.set(account.connectionId, accounts);
  }

  return connections.map((connection) => ({
    ...connection,
    accounts: accountsByConnection.get(connection.id) ?? []
  }));
}

/** Reads and decrypts OAuth credentials only for a connected account on the server. */
async function getConnectedCredentials(
  admin: AdminClient,
  userId: string,
  connectorId: SocialConnectionAuthorizationConnectorId,
  connectionId?: string
): Promise<{ connectionId: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null; grantedScopes: string[] } | null> {
  let query = admin
    .from("social_connections")
    .select("id, connector_id, status, encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(2);
  if (connectionId) query = query.eq("id", connectionId);
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (!connectionId && data.length > 1) {
    throw new Error(`Select a specific ${connectorId} connection before using its credentials.`);
  }

  const connection = socialConnectionCredentialSchema.safeParse(data[0]);
  if (!connection.success) return null;
  return {
    connectionId: connection.data.id,
    accessToken: await decryptSecret(connection.data.encrypted_access_token),
    refreshToken: connection.data.encrypted_refresh_token
      ? await decryptSecret(connection.data.encrypted_refresh_token)
      : null,
    tokenExpiresAt: connection.data.token_expires_at,
    grantedScopes: connection.data.granted_scopes
  };
}

export async function upsertSocialConnectionAccount(
  admin: AdminClient,
  input: { userId: string; connectionId: string; account: SocialExternalAccount }
): Promise<SocialConnectionAccountSummary> {
  const { data, error } = await admin.rpc("upsert_social_connection_account", {
    p_user_id: input.userId,
    p_connection_id: input.connectionId,
    p_external_account_id: input.account.externalAccountId,
    p_account_type: input.account.accountType,
    p_handle: input.account.handle,
    p_display_name: input.account.displayName,
    p_avatar_url: input.account.avatarUrl
  });
  if (error) throw error;
  return toSocialConnectionAccountSummary(Array.isArray(data) ? data[0] : data);
}

/**
 * Discovers the authorized profile(s) for a connector and upserts only their
 * safe public metadata. Dispatches by connectorId so the OAuth callback and the
 * Settings refresh action share one safe code path.
 */
export async function syncSocialConnectionAccounts(
  admin: AdminClient,
  userId: string,
  connectorId: SocialOAuthConnectorId,
  connectionId: string
): Promise<SocialConnectionAccountSummary[]> {
  const credentials = await getConnectedCredentials(admin, userId, connectorId, connectionId);
  if (!credentials) {
    throw new Error(`No connected ${connectorId} account is available to synchronize.`);
  }

  const result = await getSocialAdapter(connectorId).listAccounts(credentials);
  if (result.kind !== "ok") {
    throw new Error(result.reason);
  }

  return Promise.all(result.value.map((account) => upsertSocialConnectionAccount(admin, {
    userId,
    connectionId: credentials.connectionId,
    account
  })));
}

/** Backwards-compatible X wrapper over the connector-dispatched sync. */
export async function syncXSocialConnectionAccounts(
  admin: AdminClient,
  userId: string,
  connectionId: string
): Promise<SocialConnectionAccountSummary[]> {
  return syncSocialConnectionAccounts(admin, userId, "x", connectionId);
}

/**
 * Exposes decrypted server-only credentials for a connected account so other
 * server modules (e.g. the performance sync pilot) can call the adapter without
 * re-implementing credential lookup or decryption.
 */
export async function getSocialConnectionCredentials(
  admin: AdminClient,
  userId: string,
  connectorId: SocialConnectionAuthorizationConnectorId,
  connectionId?: string
): Promise<{ connectionId: string; accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null; grantedScopes: string[] } | null> {
  return getConnectedCredentials(admin, userId, connectorId, connectionId);
}

/** Replaces a short-lived provider token after a server-side refresh. */
export async function refreshSocialConnectionCredentials(
  admin: AdminClient,
  input: {
    userId: string;
    connectorId: SocialConnectionAuthorizationConnectorId;
    connectionId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: string | null;
  }
): Promise<void> {
  const { data, error } = await admin
    .from("social_connections")
    .update({
      encrypted_access_token: input.encryptedAccessToken,
      encrypted_refresh_token: input.encryptedRefreshToken,
      token_expires_at: input.tokenExpiresAt,
      status: "connected",
      last_error_code: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.connectionId)
    .eq("user_id", input.userId)
    .eq("connector_id", input.connectorId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The social connection could not be refreshed.");

  const { error: auditError } = await admin.from("social_connection_audit_events").insert({
    user_id: input.userId,
    connection_id: input.connectionId,
    event_type: "connection_refreshed",
    metadata: { connector_id: input.connectorId }
  });
  if (auditError) throw auditError;
}

/** Atomically makes an existing account the connection's selected destination. */
export async function selectSocialConnectionAccount(
  admin: AdminClient,
  input: { userId: string; connectionId: string; accountId: string }
): Promise<SocialConnectionAccountSummary> {
  const { data, error } = await admin.rpc("select_social_connection_account", {
    p_user_id: input.userId,
    p_connection_id: input.connectionId,
    p_account_id: input.accountId
  });
  if (error) throw error;
  return toSocialConnectionAccountSummary(Array.isArray(data) ? data[0] : data);
}

/**
 * Revokes local use of a connection through a server-only RPC. The function
 * clears encrypted credentials and account selections atomically before it
 * records the non-sensitive audit event.
 */
export async function disconnectSocialConnection(
  admin: AdminClient,
  userId: string,
  connectionId: string
): Promise<SocialConnectionSummary | null> {
  const { data, error } = await admin.rpc("disconnect_social_connection_by_id", {
    p_user_id: userId,
    p_connection_id: connectionId
  });
  if (error) throw error;
  return data ? toSocialConnectionSummary(data) : null;
}

export async function createSocialOAuthAuthorization(
  admin: AdminClient,
  input: {
    userId: string;
    connectorId: SocialConnectionAuthorizationConnectorId;
    stateHash: string;
    encryptedPkceVerifier: string | null;
    redirectUri: string;
  }
): Promise<void> {
  const { error } = await admin.rpc("create_social_oauth_authorization", {
    p_user_id: input.userId,
    p_connector_id: input.connectorId,
    p_state_hash: input.stateHash,
    p_encrypted_pkce_verifier: input.encryptedPkceVerifier,
    p_redirect_uri: input.redirectUri
  });
  if (error) throw error;
}

export async function consumeSocialOAuthAuthorization(
  admin: AdminClient,
  stateHash: string
): Promise<SocialOAuthAuthorization | null> {
  const { data, error } = await admin.rpc("consume_social_oauth_authorization_v2", {
    p_state_hash: stateHash
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const authorization = socialOAuthAuthorizationSchema.parse(row);
  return {
    userId: authorization.user_id,
    connectorId: authorization.connector_id,
    connectionId: authorization.connection_id,
    encryptedPkceVerifier: authorization.encrypted_pkce_verifier,
    redirectUri: authorization.redirect_uri
  };
}

export async function completeSocialOAuthConnection(
  admin: AdminClient,
  input: {
    userId: string;
    connectionId: string;
    connectorId: SocialConnectionAuthorizationConnectorId;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: string | null;
    grantedScopes: string[];
  }
): Promise<SocialConnectionSummary> {
  const { data, error } = await admin.rpc("complete_social_oauth_connection_v2", {
    p_user_id: input.userId,
    p_connection_id: input.connectionId,
    p_connector_id: input.connectorId,
    p_encrypted_access_token: input.encryptedAccessToken,
    p_encrypted_refresh_token: input.encryptedRefreshToken,
    p_token_expires_at: input.tokenExpiresAt,
    p_granted_scopes: input.grantedScopes
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return toSocialConnectionSummary(row);
}

export async function failSocialOAuthConnection(
  admin: AdminClient,
  input: { userId: string; connectionId: string; errorCode: string }
): Promise<SocialConnectionSummary | null> {
  const { data, error } = await admin.rpc("fail_social_oauth_connection", {
    p_user_id: input.userId,
    p_connection_id: input.connectionId,
    p_error_code: input.errorCode
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? toSocialConnectionSummary(row) : null;
}
