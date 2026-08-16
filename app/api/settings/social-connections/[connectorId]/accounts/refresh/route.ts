import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { syncSocialConnectionAccounts } from "@/lib/social-connections";
import { getSocialOAuthProvider, socialOAuthConnectorIdSchema } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

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
    const { connectorId: rawConnectorId } = await params;
    const connectorId = socialOAuthConnectorIdSchema.parse(rawConnectorId);
    if (!getSocialOAuthProvider(connectorId)) {
      return NextResponse.json({ error: "This social connection is not configured." }, { status: 503 });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Social connections") }, { status: 503 });
    }

    const accounts = await syncSocialConnectionAccounts(admin, userId, connectorId);
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