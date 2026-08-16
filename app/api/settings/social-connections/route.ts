import { NextResponse } from "next/server";
import { z } from "zod";
import {
  disconnectSocialConnection,
  listSocialConnectionsWithAccounts
} from "@/lib/social-connections";
import {
  socialConnectorIds,
  socialPlatformCapabilities
} from "@/lib/social-platform-capabilities";
import { getSocialOAuthProvider } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const disconnectSchema = z.object({
  connectorId: z.enum(socialConnectorIds)
});

const publicCapabilities = socialConnectorIds.map((connectorId) => {
  const capability = socialPlatformCapabilities[connectorId];
  return {
    id: capability.id,
    contentPlatform: capability.contentPlatform,
    label: capability.label,
    official: capability.official,
    current: capability.current,
    manualFallback: capability.manualFallback
  };
});

/** Lists safe connection summaries together with the official capability map. */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Social connections") }, { status: 503 });
    }

    const connections = await listSocialConnectionsWithAccounts(admin, userId);
    return NextResponse.json({
      capabilities: publicCapabilities,
      connections,
      oauthConnectors: {
        x: Boolean(getSocialOAuthProvider("x")),
        linkedin: Boolean(getSocialOAuthProvider("linkedin"))
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view social connections." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load social connections." },
      { status: 400 }
    );
  }
}

/**
 * Removes Finfold's local credentials and selected accounts. It does not
 * revoke the provider-side grant because provider-specific revocation must be
 * performed by the future adapter that owns that OAuth protocol.
 */
export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { connectorId } = disconnectSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Social connections") }, { status: 503 });
    }

    const connection = await disconnectSocialConnection(admin, userId, connectorId);
    return NextResponse.json({ connection });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to disconnect a social connection." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect social connection." },
      { status: 400 }
    );
  }
}