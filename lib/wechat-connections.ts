import { z } from "zod";
import {
  getSocialConnectionCredentials,
  refreshSocialConnectionCredentials,
  toSocialConnectionAccountSummary,
  upsertSocialConnectionAccount,
  type SocialConnectionAccountSummary
} from "@/lib/social-connections";
import { tokenExpiresAt } from "@/lib/social-oauth";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildWechatComponentAuthorizationUrl,
  buildWechatAnalyticsRequestRanges,
  createWechatPreAuthorizationCode,
  exchangeWechatAuthorizationCode,
  fetchWechatAuthorizerAccount,
  fetchWechatComponentAccessToken,
  fetchWechatUserCumulate,
  fetchWechatUserSummary,
  getWechatComponentConfig,
  isWechatAccessTokenError,
  refreshWechatAuthorizerToken,
  type WechatAuthorizerAccount,
  type WechatAuthorizerToken,
  type WechatComponentConfig,
  type WechatComponentEvent
} from "@/lib/wechat-component";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const componentTicketSchema = z.object({
  encrypted_verify_ticket: z.string().min(1),
  received_at: z.string().min(1)
});

const componentTokenCacheSchema = z.object({
  encrypted_access_token: z.string().min(1),
  expires_at: z.string().min(1)
});

const connectionAccountRowSchema = z.object({
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

const componentTokenRefreshes = new Map<string, Promise<string>>();
type ActiveWechatCredentials = NonNullable<Awaited<ReturnType<typeof getSocialConnectionCredentials>>>;
const authorizerTokenRefreshes = new Map<string, Promise<ActiveWechatCredentials>>();

export type WechatComponentAuthorizationResult = {
  token: WechatAuthorizerToken;
  account: WechatAuthorizerAccount;
  grantedScopes: string[];
};

export type WechatUserSummarySyncResult = {
  beginDate: string;
  endDate: string;
  rows: number;
  followerCount: number | null;
  periodFollowerGrowth: number;
  newUsers: number;
  cancelledUsers: number;
  measuredAt: string;
};

export async function storeWechatComponentVerifyTicket(
  admin: AdminClient,
  config: WechatComponentConfig,
  event: WechatComponentEvent
): Promise<void> {
  if (event.infoType !== "component_verify_ticket" || !event.componentVerifyTicket) {
    throw new Error("The WeChat event does not contain a component verification ticket.");
  }
  const receivedAt = event.createTime
    ? new Date(event.createTime * 1_000).toISOString()
    : new Date().toISOString();
  const { error } = await admin.from("wechat_component_tickets").upsert({
    component_app_id: config.appId,
    encrypted_verify_ticket: await encryptSecret(event.componentVerifyTicket),
    received_at: receivedAt,
    updated_at: new Date().toISOString()
  }, { onConflict: "component_app_id" });
  if (error) throw error;
}

async function readWechatComponentVerifyTicket(
  admin: AdminClient,
  config: WechatComponentConfig,
  now = new Date()
): Promise<string> {
  const { data, error } = await admin
    .from("wechat_component_tickets")
    .select("encrypted_verify_ticket, received_at")
    .eq("component_app_id", config.appId)
    .maybeSingle();
  if (error) throw error;
  const ticket = componentTicketSchema.safeParse(data);
  if (!ticket.success) {
    throw new Error("Finfold has not received a WeChat component verification ticket yet. Check the authorized event callback URL.");
  }
  if (now.getTime() - Date.parse(ticket.data.received_at) > 30 * 60 * 1_000) {
    throw new Error("The WeChat component verification ticket is stale. Check the authorized event callback URL.");
  }
  return decryptSecret(ticket.data.encrypted_verify_ticket);
}

async function getComponentAccessToken(
  admin: AdminClient,
  config: WechatComponentConfig,
  fetcher: FetchLike
): Promise<string> {
  const { data } = await admin
    .from("wechat_component_tokens")
    .select("encrypted_access_token, expires_at")
    .eq("component_app_id", config.appId)
    .maybeSingle();
  const cached = componentTokenCacheSchema.safeParse(data);
  if (cached.success && Date.parse(cached.data.expires_at) > Date.now() + 5 * 60 * 1_000) {
    return decryptSecret(cached.data.encrypted_access_token);
  }

  const inFlight = componentTokenRefreshes.get(config.appId);
  if (inFlight) return inFlight;
  const refresh = (async () => {
    const ticket = await readWechatComponentVerifyTicket(admin, config);
    const token = await fetchWechatComponentAccessToken(config, ticket, fetcher);
    const expiresAt = new Date(Date.now() + token.expiresIn * 1_000).toISOString();
    const { error } = await admin.from("wechat_component_tokens").upsert({
      component_app_id: config.appId,
      encrypted_access_token: await encryptSecret(token.accessToken),
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }, { onConflict: "component_app_id" });
    if (error) throw error;
    return token.accessToken;
  })();
  componentTokenRefreshes.set(config.appId, refresh);
  try {
    return await refresh;
  } finally {
    componentTokenRefreshes.delete(config.appId);
  }
}

export async function createWechatConnectionAuthorizationUrl(
  admin: AdminClient,
  config: WechatComponentConfig,
  callbackUrl: string,
  fetcher: FetchLike = fetch
): Promise<string> {
  const componentAccessToken = await getComponentAccessToken(admin, config, fetcher);
  const preAuthorizationCode = await createWechatPreAuthorizationCode(config, componentAccessToken, fetcher);
  return buildWechatComponentAuthorizationUrl({ config, preAuthorizationCode, callbackUrl });
}

function grantedScopes(permissionIds: number[]): string[] {
  return ["wechat_authorized", ...permissionIds.map((id) => `wechat_func_${id}`)];
}

export async function completeWechatComponentAuthorization(
  admin: AdminClient,
  config: WechatComponentConfig,
  authorizationCode: string,
  fetcher: FetchLike = fetch
): Promise<WechatComponentAuthorizationResult> {
  const componentAccessToken = await getComponentAccessToken(admin, config, fetcher);
  const token = await exchangeWechatAuthorizationCode(config, componentAccessToken, authorizationCode, fetcher);
  const account = await fetchWechatAuthorizerAccount(
    config,
    componentAccessToken,
    token.authorizerAppId,
    fetcher
  );
  return { token, account, grantedScopes: grantedScopes(token.permissionIds) };
}

async function getWechatConnectionAccount(
  admin: AdminClient,
  connectionId: string
): Promise<SocialConnectionAccountSummary> {
  const { data, error } = await admin
    .from("social_connection_accounts")
    .select("id, connection_id, external_account_id, account_type, handle, display_name, avatar_url, provider_metadata, is_selected, updated_at")
    .eq("connection_id", connectionId)
    .order("is_selected", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = connectionAccountRowSchema.safeParse(data);
  if (!row.success) throw new Error("The connected WeChat Official Account profile is missing.");
  return toSocialConnectionAccountSummary(row.data);
}

export async function syncWechatConnectionAccountProfile(
  admin: AdminClient,
  userId: string,
  connectionId: string,
  fetcher: FetchLike = fetch
): Promise<SocialConnectionAccountSummary[]> {
  const config = getWechatComponentConfig();
  if (!config) throw new Error("The WeChat Official Account connection is not configured.");
  const credentials = await getSocialConnectionCredentials(admin, userId, "wechat", connectionId);
  if (!credentials) throw new Error("Connect the WeChat Official Account before synchronizing its profile.");
  const existing = await getWechatConnectionAccount(admin, credentials.connectionId);
  const componentAccessToken = await getComponentAccessToken(admin, config, fetcher);
  const account = await fetchWechatAuthorizerAccount(
    config,
    componentAccessToken,
    existing.externalAccountId,
    fetcher
  );
  const saved = await upsertSocialConnectionAccount(admin, {
    userId,
    connectionId: credentials.connectionId,
    account: {
      externalAccountId: account.authorizerAppId,
      accountType: "page",
      handle: account.handle,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl
    }
  });
  const { data: updated, error } = await admin
    .from("social_connection_accounts")
    .update({
      provider_metadata: {
        ...(saved.providerMetadata ?? {}),
        verified: account.verified,
        serviceType: account.serviceType
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", saved.id)
    .eq("connection_id", saved.connectionId)
    .select("id, connection_id, external_account_id, account_type, handle, display_name, avatar_url, provider_metadata, is_selected, updated_at")
    .single();
  if (error) throw error;
  return [toSocialConnectionAccountSummary(updated)];
}

async function refreshActiveWechatCredentials(
  admin: AdminClient,
  userId: string,
  connectionId: string,
  accountExternalId: string,
  credentials: ActiveWechatCredentials,
  config: WechatComponentConfig,
  fetcher: FetchLike
) {
  const existingRefresh = authorizerTokenRefreshes.get(connectionId);
  if (existingRefresh) return existingRefresh;
  const refresh = (async () => {
    if (!credentials.refreshToken) throw new Error("The WeChat account authorization cannot be refreshed. Reconnect it.");
    const componentAccessToken = await getComponentAccessToken(admin, config, fetcher);
    const refreshed = await refreshWechatAuthorizerToken(
      config,
      componentAccessToken,
      accountExternalId,
      credentials.refreshToken,
      fetcher
    );
    const next = {
      ...credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: tokenExpiresAt(refreshed.expiresIn)
    };
    await refreshSocialConnectionCredentials(admin, {
      userId,
      connectorId: "wechat",
      connectionId: credentials.connectionId,
      encryptedAccessToken: await encryptSecret(refreshed.accessToken),
      encryptedRefreshToken: await encryptSecret(refreshed.refreshToken),
      tokenExpiresAt: next.tokenExpiresAt
    });
    return next;
  })();
  authorizerTokenRefreshes.set(connectionId, refresh);
  try {
    return await refresh;
  } finally {
    authorizerTokenRefreshes.delete(connectionId);
  }
}

export async function getActiveWechatPublishingCredentials(
  admin: AdminClient,
  userId: string,
  accountId: string,
  forceRefresh = false,
  fetcher: FetchLike = fetch
) {
  const config = getWechatComponentConfig();
  if (!config) throw new Error("The WeChat Official Account connection is not configured.");
  const credentials = await getSocialConnectionCredentials(admin, userId, "wechat");
  if (!credentials) throw new Error("Connect the WeChat Official Account before publishing.");
  const account = await getWechatConnectionAccount(admin, credentials.connectionId);
  if (account.id !== accountId) throw new Error("The selected WeChat Official Account is not connected.");
  const hasDraftPermission = credentials.grantedScopes.some((scope) => scope === "wechat_func_11" || scope === "wechat_func_100");
  if (!hasDraftPermission) throw new Error("The connected WeChat account did not grant draft permission.");
  const expiresSoon = !credentials.tokenExpiresAt
    || Date.parse(credentials.tokenExpiresAt) <= Date.now() + 5 * 60 * 1_000;
  const activeCredentials = forceRefresh || expiresSoon
    ? await refreshActiveWechatCredentials(
        admin,
        userId,
        credentials.connectionId,
        account.externalAccountId,
        credentials,
        config,
        fetcher
      )
    : credentials;
  return { config, credentials: activeCredentials, account };
}

async function activeWechatCredentials(
  admin: AdminClient,
  userId: string,
  connectionId: string,
  forceRefresh: boolean,
  fetcher: FetchLike
) {
  const config = getWechatComponentConfig();
  if (!config) throw new Error("The WeChat Official Account connection is not configured.");
  const credentials = await getSocialConnectionCredentials(admin, userId, "wechat", connectionId);
  if (!credentials) throw new Error("Connect the WeChat Official Account before synchronizing user data.");
  if (!credentials.grantedScopes.includes("wechat_func_2")) {
    throw new Error("The connected WeChat account did not grant user analytics permission. Reauthorize it and include user management data.");
  }
  const account = await getWechatConnectionAccount(admin, credentials.connectionId);
  const expiresSoon = !credentials.tokenExpiresAt
    || Date.parse(credentials.tokenExpiresAt) <= Date.now() + 5 * 60 * 1_000;
  if (!forceRefresh && !expiresSoon) return { config, credentials, account };
  const refreshedCredentials = await refreshActiveWechatCredentials(
    admin,
    userId,
    credentials.connectionId,
    account.externalAccountId,
    credentials,
    config,
    fetcher
  );
  return { config, credentials: refreshedCredentials, account };
}

export async function syncWechatUserSummary(
  admin: AdminClient,
  userId: string,
  input: { connectionId: string; beginDate?: string; endDate?: string },
  fetcher: FetchLike = fetch
): Promise<WechatUserSummarySyncResult> {
  const ranges = buildWechatAnalyticsRequestRanges(input);
  const beginDate = ranges[0].beginDate;
  const endDate = ranges[ranges.length - 1].endDate;
  let active = await activeWechatCredentials(admin, userId, input.connectionId, false, fetcher);

  const read = async (accessToken: string) => {
    const chunks = [];
    for (const range of ranges) {
      chunks.push(await Promise.all([
        fetchWechatUserSummary(accessToken, range.beginDate, range.endDate, fetcher),
        fetchWechatUserCumulate(accessToken, range.beginDate, range.endDate, fetcher)
      ]));
    }
    return {
      summary: chunks.flatMap(([summary]) => summary),
      cumulate: chunks.flatMap(([, cumulate]) => cumulate)
    };
  };

  let data;
  try {
    data = await read(active.credentials.accessToken);
  } catch (error) {
    if (!isWechatAccessTokenError(error)) throw error;
    active = await activeWechatCredentials(admin, userId, input.connectionId, true, fetcher);
    data = await read(active.credentials.accessToken);
  }
  const { summary, cumulate } = data;

  const newUsers = summary.reduce((total, row) => total + row.newUser, 0);
  const cancelledUsers = summary.reduce((total, row) => total + row.cancelUser, 0);
  const followerCount = [...cumulate]
    .sort((left, right) => right.refDate.localeCompare(left.refDate))[0]?.cumulateUser ?? null;
  const measuredAt = new Date(`${endDate}T12:00:00+08:00`).toISOString();
  const { data: saved, error } = await admin.rpc("save_wechat_official_account_metrics", {
    p_user_id: userId,
    p_connection_account_id: active.account.id,
    p_summary_rows: summary.map((row) => ({
      ref_date: row.refDate,
      user_source: row.userSource,
      new_user: row.newUser,
      cancel_user: row.cancelUser
    })),
    p_follower_count: followerCount,
    p_period_follower_growth: newUsers - cancelledUsers,
    p_measured_at: measuredAt
  });
  if (error) throw error;
  const savedResult = z.object({
    managed_account_id: z.string().uuid(),
    summary_rows: z.coerce.number().int().nonnegative(),
    period_follower_growth: z.coerce.number().int()
  }).safeParse(saved);
  if (!savedResult.success) throw new Error("The WeChat user summary could not be saved.");

  return {
    beginDate,
    endDate,
    rows: summary.length,
    followerCount,
    periodFollowerGrowth: savedResult.data.period_follower_growth,
    newUsers,
    cancelledUsers,
    measuredAt
  };
}
