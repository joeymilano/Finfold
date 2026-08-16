import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createSocialOAuthAuthorization } from "@/lib/social-connections";
import {
  buildSocialOAuthAuthorizationUrl,
  createPkceChallenge,
  createPkceVerifier,
  createSocialOAuthState,
  getSocialOAuthCallbackUrl,
  getSocialOAuthProvider,
  hashSocialOAuthState,
  socialOAuthConnectorIdSchema
} from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { encryptSecret } from "@/lib/secret-encryption";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

/** Starts a feature-flagged OAuth flow for a configured connector. No provider credential reaches the browser. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "social-oauth:authorize",
    limit: 10,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const { connectorId: rawConnectorId } = await params;
    const connectorId = socialOAuthConnectorIdSchema.parse(rawConnectorId);
    const provider = getSocialOAuthProvider(connectorId);
    if (!provider) {
      return NextResponse.json(
        { error: "This social connection is not configured." },
        { status: 503 }
      );
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Social connections") },
        { status: 503 }
      );
    }

    const state = createSocialOAuthState();
    const pkceVerifier = createPkceVerifier();
    const callbackUrl = getSocialOAuthCallbackUrl(request, connectorId);
    const [stateHash, pkceChallenge, encryptedPkceVerifier] = await Promise.all([
      hashSocialOAuthState(state),
      createPkceChallenge(pkceVerifier),
      encryptSecret(pkceVerifier)
    ]);

    await createSocialOAuthAuthorization(admin, {
      userId,
      connectorId,
      stateHash,
      encryptedPkceVerifier,
      redirectUri: callbackUrl
    });

    return NextResponse.json({
      url: buildSocialOAuthAuthorizationUrl({ provider, callbackUrl, state, pkceChallenge })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to connect a social account." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start social connection." },
      { status: 400 }
    );
  }
}