import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getSocialConnectionCredentials, listSocialConnectionsWithAccounts } from "@/lib/social-connections";
import {
  pickSocialSyncAccounts,
  syncSocialConnectionAccountPerformance,
  type SocialSyncAccountEvidence,
  type SocialSyncPostEvidence
} from "@/lib/social-performance-sync";
import { getSocialOAuthProvider } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getWechatComponentConfig } from "@/lib/wechat-component";
import { syncWechatUserSummary } from "@/lib/wechat-connections";

const requestSchema = z.object({
  connectorId: z.enum(["linkedin", "instagram", "wechat"]),
  connectionId: z.string().uuid(),
  accountIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  beginDate: z.string().date().optional(),
  endDate: z.string().date().optional()
});

/**
 * Imports read-only performance data for one exact social connection. Without
 * accountIds it covers the connection's default account; passing accountIds
 * syncs every listed matrix account of that connection. Each synced post lands
 * in a dedicated nullable evidence table. A missing provider metric remains
 * null instead of becoming an invented zero in the manual performance pipeline.
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "performance:sync-social",
    limit: 10,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const body = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json({ error: "Unsupported connector." }, { status: 400 });
    }
    const connectorId = body.data.connectorId;

    const configured = connectorId === "wechat"
      ? Boolean(getWechatComponentConfig())
      : Boolean(getSocialOAuthProvider(connectorId));
    if (!configured) {
      return NextResponse.json({ error: "This social connection is not configured." }, { status: 503 });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Performance sync") }, { status: 503 });
    }

    if (connectorId === "wechat") {
      const result = await syncWechatUserSummary(admin, userId, {
        connectionId: body.data.connectionId,
        beginDate: body.data.beginDate,
        endDate: body.data.endDate
      });
      return NextResponse.json({ imported: result.rows, ...result });
    }

    const credentials = await getSocialConnectionCredentials(
      admin,
      userId,
      connectorId,
      body.data.connectionId
    );
    if (!credentials) {
      return NextResponse.json({ error: "Connect the account before syncing performance." }, { status: 409 });
    }

    const connections = await listSocialConnectionsWithAccounts(admin, userId);
    const connection = connections.find((item) =>
      item.id === body.data.connectionId
      && item.connectorId === connectorId
      && item.status === "connected"
    );
    if (!connection) {
      return NextResponse.json({ error: "Connect the account before syncing performance." }, { status: 409 });
    }

    const { targets, missingAccountIds } = pickSocialSyncAccounts(
      connection.accounts,
      body.data.accountIds
    );
    if (missingAccountIds.length > 0) {
      return NextResponse.json(
        { error: "Some selected accounts do not belong to this connection." },
        { status: 400 }
      );
    }
    if (targets.length === 0) {
      return NextResponse.json({ error: "Synchronize and select an account before importing performance." }, { status: 409 });
    }

    const outcomes = [];
    for (const target of targets) {
      outcomes.push(await syncSocialConnectionAccountPerformance(
        admin,
        userId,
        connectorId,
        credentials,
        target
      ));
    }

    const failures = outcomes.filter((outcome) => outcome.error !== null);
    if (failures.length === outcomes.length) {
      return NextResponse.json(
        { error: failures[0]?.error ?? "Could not import performance." },
        { status: 502 }
      );
    }

    const imported = outcomes.reduce((sum, outcome) => sum + outcome.imported, 0);
    const created = outcomes.reduce((sum, outcome) => sum + outcome.created, 0);
    const updated = outcomes.reduce((sum, outcome) => sum + outcome.updated, 0);
    const evidence: SocialSyncPostEvidence[] = outcomes.flatMap((outcome) => outcome.evidence);
    const accountEvidence: SocialSyncAccountEvidence | null = outcomes
      .map((outcome) => outcome.accountEvidence)
      .find((value): value is SocialSyncAccountEvidence => value !== null) ?? null;

    return NextResponse.json({
      imported,
      created,
      updated,
      syncedAccounts: outcomes.length,
      accountMetricsImported: outcomes.some((outcome) => outcome.accountMetricsImported),
      portfolioSnapshotsSaved: outcomes.filter((outcome) => outcome.portfolioSnapshotSaved).length,
      evidence,
      accountEvidence,
      perAccount: outcomes.map((outcome) => ({
        accountId: outcome.accountId,
        displayName: outcome.displayName,
        handle: outcome.handle,
        imported: outcome.imported,
        portfolioSnapshotSaved: outcome.portfolioSnapshotSaved,
        error: outcome.error
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to sync performance." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync performance." },
      { status: 400 }
    );
  }
}
