import { z } from "zod";
import {
  socialConnectorIds,
  type SocialConnectorId
} from "@/lib/social-platform-capabilities";
import { socialOAuthConnectorIds, type SocialOAuthConnectorId } from "@/lib/social-oauth";
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
  connector_id: z.enum(socialOAuthConnectorIds),
  encrypted_pkce_verifier: z.string().min(1),
  redirect_uri: z.string().url()
});

export type SocialOAuthAuthorization = {
  userId: string;
  connectorId: SocialOAuthConnectorId;
  encryptedPkceVerifier: string;
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
  is_selected: z.boolean(),
  updated_at: z.string().min(1)
});

const socialConnectionCredentialSchema = z.object({
  id: z.string().uuid(),
  connector_id: z.enum(socialOAuthConnectorIds),
  status: z.literal("connected"),
  encrypted_access_token: z.string().min(1),
  encrypted_refresh_token: z.string().min(1).nullable()
});

export type SocialConnectionAccountSummary = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  accountType: "profile" | "page" | "organization";
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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
  const row = socialConnectionAccountSummarySchema.parse(value);
  return {
    id: row.id,
    connectionId: row.connection_id,
    externalAccountId: row.external_account_id,
    accountType: row.account_type,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
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
    .select("id, connection_id, external_account_id, account_type, handle, display_name, avatar_url, is_selected, updated_at")
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
  connectorId: SocialOAuthConnectorId
): Promise<{ connectionId: string; accessToken: string; refreshToken: string | null } | null> {
  const { data, error } = await admin
    .from("social_connections")
    .select("id, connector_id, status, encrypted_access_token, encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const connection = socialConnectionCredentialSchema.safeParse(data);
  if (!connection.success) return null;
  return {
    connectionId: connection.data.id,
    accessToken: await decryptSecret(connection.data.encrypted_access_token),
    refreshToken: connection.data.encrypted_refresh_token
      ? await decryptSecret(connection.data.encrypted_refresh_token)
      : null
  };
}

async function upsertSocialConnectionAccount(
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
  connectorId: SocialOAuthConnectorId
): Promise<SocialConnectionAccountSummary[]> {
  const credentials = await getConnectedCredentials(admin, userId, connectorId);
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
  userId: string
): Promise<SocialConnectionAccountSummary[]> {
  return syncSocialConnectionAccounts(admin, userId, "x");
}

/**
 * Exposes decrypted server-only credentials for a connected account so other
 * server modules (e.g. the performance sync pilot) can call the adapter without
 * re-implementing credential lookup or decryption.
 */
export async function getSocialConnectionCredentials(
  admin: AdminClient,
  userId: string,
  connectorId: SocialOAuthConnectorId
): Promise<{ connectionId: string; accessToken: string; refreshToken: string | null } | null> {
  return getConnectedCredentials(admin, userId, connectorId);
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
  connectorId: SocialConnectorId
): Promise<SocialConnectionSummary | null> {
  const { data, error } = await admin.rpc("disconnect_social_connection", {
    p_user_id: userId,
    p_connector_id: connectorId
  });
  if (error) throw error;
  return data ? toSocialConnectionSummary(data) : null;
}

export async function createSocialOAuthAuthorization(
  admin: AdminClient,
  input: {
    userId: string;
    connectorId: SocialOAuthConnectorId;
    stateHash: string;
    encryptedPkceVerifier: string;
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
  const { data, error } = await admin.rpc("consume_social_oauth_authorization", {
    p_state_hash: stateHash
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const authorization = socialOAuthAuthorizationSchema.parse(row);
  return {
    userId: authorization.user_id,
    connectorId: authorization.connector_id,
    encryptedPkceVerifier: authorization.encrypted_pkce_verifier,
    redirectUri: authorization.redirect_uri
  };
}

export async function completeSocialOAuthConnection(
  admin: AdminClient,
  input: {
    userId: string;
    connectorId: SocialOAuthConnectorId;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: string | null;
    grantedScopes: string[];
  }
): Promise<SocialConnectionSummary> {
  const { data, error } = await admin.rpc("complete_social_oauth_connection", {
    p_user_id: input.userId,
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