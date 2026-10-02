import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { listSocialConnectionsWithAccounts, selectSocialConnectionAccount } from "@/lib/social-connections";
import { socialConnectionAuthorizationConnectorIdSchema } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const selectAccountSchema = z.object({
  connectionId: z.string().uuid()
});

/** Selects a persisted account after the database verifies connection ownership. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectorId: string; accountId: string }> }
) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "social-connection:account-select",
    limit: 30,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const [{ connectorId: rawConnectorId, accountId }, body] = await Promise.all([
      params,
      request.json()
    ]);
    const connectorId = socialConnectionAuthorizationConnectorIdSchema.parse(rawConnectorId);
    const { connectionId } = selectAccountSchema.parse(body);
    const accountIdSchema = z.string().uuid();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Social connections") }, { status: 503 });
    }

    const connections = await listSocialConnectionsWithAccounts(admin, userId);
    if (!connections.some((connection) =>
      connection.id === connectionId
      && connection.connectorId === connectorId
      && connection.accounts.some((account) => account.id === accountId)
    )) return new NextResponse("Not found", { status: 404 });
    const account = await selectSocialConnectionAccount(admin, {
      userId,
      connectionId,
      accountId: accountIdSchema.parse(accountId)
    });
    return NextResponse.json({ account });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to select a social account." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to select the social account." },
      { status: 400 }
    );
  }
}
