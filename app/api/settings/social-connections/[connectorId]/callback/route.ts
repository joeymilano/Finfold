import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeSocialOAuthConnection,
  consumeSocialOAuthAuthorization,
  failSocialOAuthConnection,
  syncSocialConnectionAccounts,
  upsertSocialConnectionAccount
} from "@/lib/social-connections";
import {
  exchangeSocialOAuthAuthorizationCode,
  getSocialOAuthCallbackUrl,
  getSocialOAuthProvider,
  getSocialOAuthSettingsUrl,
  hashSocialOAuthState,
  socialConnectionAuthorizationConnectorIdSchema,
  tokenExpiresAt,
  type SocialConnectionAuthorizationConnectorId
} from "@/lib/social-oauth";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import { logWarn } from "@/lib/observability";
import { syncXAccountIntoPortfolioAfterConnection } from "@/lib/social-performance-sync";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { getWechatComponentConfig } from "@/lib/wechat-component";
import { completeWechatComponentAuthorization } from "@/lib/wechat-connections";

const callbackSchema = z.object({
  state: z.string().min(32).max(128),
  code: z.string().min(1).max(4_096).optional(),
  error: z.string().min(1).max(128).optional()
});

const wechatCallbackSchema = z.object({
  state: z.string().min(32).max(128),
  auth_code: z.string().min(1).max(4_096).optional()
});

function redirectToSettings(
  request: Request,
  connectorId: SocialConnectionAuthorizationConnectorId,
  status: "connected" | "denied" | "expired" | "failed" | "unavailable"
) {
  return NextResponse.redirect(getSocialOAuthSettingsUrl(request, connectorId, status));
}

async function completeWechatCallback(
  request: Request,
  callback: z.infer<typeof wechatCallbackSchema>
) {
  const config = getWechatComponentConfig();
  if (!config) return redirectToSettings(request, "wechat", "unavailable");
  const admin = createSupabaseAdminClient();
  if (!admin) return redirectToSettings(request, "wechat", "unavailable");

  const authorization = await consumeSocialOAuthAuthorization(
    admin,
    await hashSocialOAuthState(callback.state)
  );
  if (!authorization || authorization.connectorId !== "wechat") {
    return redirectToSettings(request, "wechat", "expired");
  }
  const callbackUrl = new URL(getSocialOAuthCallbackUrl(request, "wechat"));
  callbackUrl.searchParams.set("state", callback.state);
  if (authorization.redirectUri !== callbackUrl.toString()) {
    await failSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectionId: authorization.connectionId,
      errorCode: "callback_mismatch"
    });
    return redirectToSettings(request, "wechat", "failed");
  }
  if (!callback.auth_code) {
    await failSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectionId: authorization.connectionId,
      errorCode: "authorization_denied"
    });
    return redirectToSettings(request, "wechat", "denied");
  }

  try {
    const result = await completeWechatComponentAuthorization(
      admin,
      config,
      callback.auth_code
    );
    const connection = await completeSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectionId: authorization.connectionId,
      connectorId: "wechat",
      encryptedAccessToken: await encryptSecret(result.token.accessToken),
      encryptedRefreshToken: await encryptSecret(result.token.refreshToken),
      tokenExpiresAt: tokenExpiresAt(result.token.expiresIn),
      grantedScopes: result.grantedScopes
    });
    const savedAccount = await upsertSocialConnectionAccount(admin, {
      userId: authorization.userId,
      connectionId: connection.id,
      account: {
        externalAccountId: result.account.authorizerAppId,
        accountType: "page",
        handle: result.account.handle,
        displayName: result.account.displayName,
        avatarUrl: result.account.avatarUrl
      }
    });
    try {
      const { error: metadataError } = await admin
        .from("social_connection_accounts")
        .update({
          provider_metadata: {
            verified: result.account.verified,
            serviceType: result.account.serviceType,
            permissionIds: result.token.permissionIds
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", savedAccount.id)
        .eq("connection_id", connection.id);
      if (metadataError) throw metadataError;
    } catch {
      // Authorization and encrypted token storage already succeeded. A Settings
      // profile refresh safely repopulates this non-secret capability cache.
      logWarn("wechat_account_capability_cache_failed", { userId: authorization.userId }, {
        connectionId: connection.id
      });
    }
  } catch (error) {
    await failSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectionId: authorization.connectionId,
      errorCode: "provider_callback_failed"
    });
    throw error;
  }
  return redirectToSettings(request, "wechat", "connected");
}

/** Completes a state-bound OAuth callback and stores only encrypted credentials. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  let connectorId: SocialConnectionAuthorizationConnectorId;
  let authorizationToFail: { userId: string; connectionId: string } | null = null;
  try {
    const routeParams = await params;
    connectorId = socialConnectionAuthorizationConnectorIdSchema.parse(routeParams.connectorId);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    if (connectorId === "wechat") {
      const callback = wechatCallbackSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!callback.success) return redirectToSettings(request, connectorId, "failed");
      return await completeWechatCallback(request, callback.data);
    }

    const provider = getSocialOAuthProvider(connectorId);
    if (!provider) return redirectToSettings(request, connectorId, "unavailable");

    const callback = callbackSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!callback.success) return redirectToSettings(request, connectorId, "failed");

    const admin = createSupabaseAdminClient();
    if (!admin) return redirectToSettings(request, connectorId, "unavailable");

    const authorization = await consumeSocialOAuthAuthorization(
      admin,
      await hashSocialOAuthState(callback.data.state)
    );
    if (!authorization || authorization.connectorId !== connectorId) {
      return redirectToSettings(request, connectorId, "expired");
    }
    authorizationToFail = {
      userId: authorization.userId,
      connectionId: authorization.connectionId
    };

    const callbackUrl = getSocialOAuthCallbackUrl(request, connectorId);
    if (authorization.redirectUri !== callbackUrl) {
      await failSocialOAuthConnection(admin, {
        ...authorizationToFail,
        errorCode: "callback_mismatch"
      });
      authorizationToFail = null;
      return redirectToSettings(request, connectorId, "failed");
    }
    if (callback.data.error || !callback.data.code) {
      await failSocialOAuthConnection(admin, {
        ...authorizationToFail,
        errorCode: "authorization_denied"
      });
      authorizationToFail = null;
      return redirectToSettings(request, connectorId, "denied");
    }
    if (provider.pkce === "s256" && !authorization.encryptedPkceVerifier) {
      await failSocialOAuthConnection(admin, {
        ...authorizationToFail,
        errorCode: "pkce_verifier_missing"
      });
      authorizationToFail = null;
      return redirectToSettings(request, connectorId, "failed");
    }

    const token = await exchangeSocialOAuthAuthorizationCode({
      provider,
      code: callback.data.code,
      callbackUrl,
      pkceVerifier: authorization.encryptedPkceVerifier
        ? await decryptSecret(authorization.encryptedPkceVerifier)
        : null
    });
    const connection = await completeSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectionId: authorization.connectionId,
      connectorId,
      encryptedAccessToken: await encryptSecret(token.accessToken),
      encryptedRefreshToken: token.refreshToken ? await encryptSecret(token.refreshToken) : null,
      tokenExpiresAt: tokenExpiresAt(token.expiresIn),
      grantedScopes: token.grantedScopes
    });
    authorizationToFail = null;

    try {
      await syncSocialConnectionAccounts(admin, authorization.userId, connectorId, connection.id);
    } catch {
      // OAuth itself succeeded. The Settings retry action can recover a
      // transient profile-lookup failure without asking the user to reauthorize.
      logWarn("social_connection_account_sync_failed", { userId: authorization.userId }, {
        connectorId
      });
    }

    if (connectorId === "x") {
      // The growth portfolio should list the freshly connected X account
      // immediately — no manual 「添加社交账号」 entry. Best-effort: the
      // one-tap sync button can always backfill.
      try {
        await syncXAccountIntoPortfolioAfterConnection(admin, authorization.userId, connection.id);
      } catch {
        logWarn("x_portfolio_mirror_after_connect_failed", { userId: authorization.userId }, {
          connectionId: connection.id
        });
      }
    }

    return redirectToSettings(request, connectorId, "connected");
  } catch {
    // Provider errors can include user or grant details. Keep them server-side
    // and redirect with a fixed outcome rather than reflecting them into HTML.
    if (authorizationToFail) {
      try {
        const admin = createSupabaseAdminClient();
        if (admin) {
          await failSocialOAuthConnection(admin, {
            ...authorizationToFail,
            errorCode: "provider_callback_failed"
          });
        }
      } catch {
        // The original callback failure remains the user-facing result. A
        // failed audit update must never reflect provider details to the URL.
      }
    }
    return redirectToSettings(request, connectorId, "failed");
  }
}
