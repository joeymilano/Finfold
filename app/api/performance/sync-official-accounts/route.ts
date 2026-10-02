import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  getSocialConnectionCredentials,
  listSocialConnectionsWithAccounts
} from "@/lib/social-connections";
import { syncSocialConnectionAccountPerformance } from "@/lib/social-performance-sync";
import { getSocialOAuthProvider } from "@/lib/social-oauth";
import { getActiveXReadCredentials } from "@/lib/x-connections";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getWechatComponentConfig } from "@/lib/wechat-component";
import { syncWechatUserSummary } from "@/lib/wechat-connections";

type SyncResult = {
  connectorId: string;
  connectionId: string;
  accountId: string | null;
  accountLabel: string | null;
  status: "synced" | "failed" | "skipped";
  imported: number;
  portfolioSnapshotSaved: boolean;
  error: string | null;
};

/**
 * One-tap matrix sync for the growth overview: walks every connected
 * authorization and every account under it, importing read-only performance
 * and mirroring account-level snapshots into the growth portfolio. WeChat
 * reuses its dedicated summary pipeline (migration 090); X syncs account
 * metrics only (public_metrics via users.read — post metrics stay closed to
 * avoid metered reads).
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "performance:sync-official-accounts",
    limit: 5,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Performance sync") }, { status: 503 });
    }

    const connections = (await listSocialConnectionsWithAccounts(admin, userId))
      .filter((connection) => connection.status === "connected");
    const results: SyncResult[] = [];

    for (const connection of connections) {
      const label = (name: string | null, handle: string | null) => name ?? handle ?? connection.connectorId;

      if (connection.connectorId === "wechat") {
        if (!getWechatComponentConfig()) {
          results.push({
            connectorId: connection.connectorId,
            connectionId: connection.id,
            accountId: null,
            accountLabel: null,
            status: "skipped",
            imported: 0,
            portfolioSnapshotSaved: false,
            error: "WeChat sync is not configured in this environment."
          });
          continue;
        }
        try {
          const summary = await syncWechatUserSummary(admin, userId, { connectionId: connection.id });
          results.push({
            connectorId: connection.connectorId,
            connectionId: connection.id,
            accountId: null,
            accountLabel: null,
            status: "synced",
            imported: summary.rows,
            portfolioSnapshotSaved: true,
            error: null
          });
        } catch (error) {
          results.push({
            connectorId: connection.connectorId,
            connectionId: connection.id,
            accountId: null,
            accountLabel: null,
            status: "failed",
            imported: 0,
            portfolioSnapshotSaved: false,
            error: error instanceof Error ? error.message : "WeChat sync failed."
          });
        }
        continue;
      }

      if (
        connection.connectorId !== "linkedin"
        && connection.connectorId !== "instagram"
        && connection.connectorId !== "x"
      ) {
        continue;
      }

      if (!getSocialOAuthProvider(connection.connectorId)) {
        results.push({
          connectorId: connection.connectorId,
          connectionId: connection.id,
          accountId: null,
          accountLabel: null,
          status: "skipped",
          imported: 0,
          portfolioSnapshotSaved: false,
          error: `${connection.connectorId} sync is not configured in this environment.`
        });
        continue;
      }

      // X access tokens live two hours, so reads must go through the
      // refresh-aware credential path; a dead refresh token surfaces here as
      // a per-account failure instead of a silent 401 on users/me.
      let credentials: Awaited<ReturnType<typeof getSocialConnectionCredentials>>;
      try {
        credentials = connection.connectorId === "x"
          ? await getActiveXReadCredentials(admin, userId, connection.id)
          : await getSocialConnectionCredentials(admin, userId, connection.connectorId, connection.id);
      } catch (error) {
        results.push({
          connectorId: connection.connectorId,
          connectionId: connection.id,
          accountId: null,
          accountLabel: label(connection.accounts[0]?.displayName ?? null, connection.accounts[0]?.handle ?? null),
          status: "failed",
          imported: 0,
          portfolioSnapshotSaved: false,
          error: error instanceof Error ? error.message : "Credentials for this authorization could not be refreshed."
        });
        continue;
      }
      if (!credentials) {
        results.push({
          connectorId: connection.connectorId,
          connectionId: connection.id,
          accountId: null,
          accountLabel: null,
          status: "failed",
          imported: 0,
          portfolioSnapshotSaved: false,
          error: "Credentials for this authorization could not be read."
        });
        continue;
      }

      for (const account of connection.accounts) {
        const outcome = await syncSocialConnectionAccountPerformance(
          admin,
          userId,
          connection.connectorId,
          credentials,
          account
        );
        results.push({
          connectorId: connection.connectorId,
          connectionId: connection.id,
          accountId: account.id,
          accountLabel: label(outcome.displayName, outcome.handle),
          status: outcome.error ? "failed" : "synced",
          imported: outcome.imported,
          portfolioSnapshotSaved: outcome.portfolioSnapshotSaved,
          error: outcome.error
        });
      }
    }

    const synced = results.filter((result) => result.status === "synced").length;
    const failed = results.filter((result) => result.status === "failed").length;
    return NextResponse.json({ results, synced, failed });
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
