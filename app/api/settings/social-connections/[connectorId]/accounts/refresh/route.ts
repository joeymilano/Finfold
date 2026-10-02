import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { syncSocialConnectionAccounts } from "@/lib/social-connections";
import { getSocialOAuthProvider, socialConnectionAuthorizationConnectorIdSchema } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getWechatComponentConfig } from "@/lib/wechat-component";
import { syncWechatConnectionAccountProfile } from "@/lib/wechat-connections";
import { getActiveXReadCredentials } from "@/lib/x-connections";

const refreshSchema = z.object({ connectionId: z.string().uuid() });

/** Re-reads safe public account metadata using the server-held OAuth credential. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "social-connection:account-sync",
    limit: 20,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const [{ connectorId: rawConnectorId }, body] = await Promise.all([
      params,
      request.json().catch(() => ({}))
    ]);
    const connectorId = socialConnectionAuthorizationConnectorIdSchema.parse(rawConnectorId);
    const { connectionId } = refreshSchema.parse(body);
    const configured = connectorId === "wechat"
      ? Boolean(getWechatComponentConfig())
      : Boolean(getSocialOAuthProvider(connectorId));
    if (!configured) {
      return NextResponse.json({ error: "This social connection is not configured." }, { status: 503 });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Social connections") }, { status: 503 });
    }

    // X access tokens live two hours, so re-reading profile metadata runs the
    // refresh-aware credential path first; syncSocialConnectionAccounts then
    // re-reads the freshly persisted token instead of demanding a reconnect.
    if (connectorId === "x") {
      const active = await getActiveXReadCredentials(admin, userId, connectionId);
      if (!active) {
        return NextResponse.json({ error: "Connect the account before synchronizing." }, { status: 409 });
      }
    }

    const accounts = connectorId === "wechat"
      ? await syncWechatConnectionAccountProfile(admin, userId, connectionId)
      : await syncSocialConnectionAccounts(admin, userId, connectorId, connectionId);
    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to synchronize a social account." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to synchronize the social account." },
      { status: 400 }
    );
  }
}
