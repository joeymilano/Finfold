import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completeSocialOAuthConnection,
  consumeSocialOAuthAuthorization,
  syncSocialConnectionAccounts
} from "@/lib/social-connections";
import {
  exchangeSocialOAuthAuthorizationCode,
  getSocialOAuthCallbackUrl,
  getSocialOAuthProvider,
  getSocialOAuthSettingsUrl,
  hashSocialOAuthState,
  socialOAuthConnectorIdSchema,
  tokenExpiresAt,
  type SocialOAuthConnectorId
} from "@/lib/social-oauth";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import { logWarn } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase";

const callbackSchema = z.object({
  state: z.string().min(32).max(128),
  code: z.string().min(1).max(4_096).optional(),
  error: z.string().min(1).max(128).optional()
});

function redirectToSettings(
  request: Request,
  connectorId: SocialOAuthConnectorId,
  status: "connected" | "denied" | "expired" | "failed" | "unavailable"
) {
  return NextResponse.redirect(getSocialOAuthSettingsUrl(request, connectorId, status));
}

/** Completes a state-bound OAuth callback and stores only encrypted credentials. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  let connectorId: SocialOAuthConnectorId;
  try {
    const routeParams = await params;
    connectorId = socialOAuthConnectorIdSchema.parse(routeParams.connectorId);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
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

    const callbackUrl = getSocialOAuthCallbackUrl(request, connectorId);
    if (authorization.redirectUri !== callbackUrl) {
      return redirectToSettings(request, connectorId, "failed");
    }
    if (callback.data.error || !callback.data.code) {
      return redirectToSettings(request, connectorId, "denied");
    }

    const token = await exchangeSocialOAuthAuthorizationCode({
      provider,
      code: callback.data.code,
      callbackUrl,
      pkceVerifier: await decryptSecret(authorization.encryptedPkceVerifier)
    });
    await completeSocialOAuthConnection(admin, {
      userId: authorization.userId,
      connectorId,
      encryptedAccessToken: await encryptSecret(token.accessToken),
      encryptedRefreshToken: token.refreshToken ? await encryptSecret(token.refreshToken) : null,
      tokenExpiresAt: tokenExpiresAt(token.expiresIn),
      grantedScopes: token.grantedScopes
    });

    try {
      await syncSocialConnectionAccounts(admin, authorization.userId, connectorId);
    } catch {
      // OAuth itself succeeded. The Settings retry action can recover a
      // transient profile-lookup failure without asking the user to reauthorize.
      logWarn("social_connection_account_sync_failed", { userId: authorization.userId }, {
        connectorId
      });
    }

    return redirectToSettings(request, connectorId, "connected");
  } catch {
    // Provider errors can include user or grant details. Keep them server-side
    // and redirect with a fixed outcome rather than reflecting them into HTML.
    return redirectToSettings(request, connectorId, "failed");
  }
}