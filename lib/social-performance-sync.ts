import { getSocialAdapter } from "@/lib/social-adapters";
import {
  getSocialConnectionCredentials,
  type SocialConnectionAccountSummary
} from "@/lib/social-connections";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type SocialAdapterCredentialBundle = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
};

export type SocialSyncPostEvidence = {
  externalPostId: string;
  url: string | null;
  publishedAt: string | null;
  impressions: number | null;
  views: number | null;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  measuredAt: string;
};

export type SocialSyncAccountEvidence = {
  followerCount: number | null;
  views: number | null;
  reach: number | null;
  profileViews: number | null;
  measuredAt: string;
};

export type SocialConnectionAccountSyncOutcome = {
  accountId: string;
  displayName: string | null;
  handle: string | null;
  imported: number;
  created: number;
  updated: number;
  accountMetricsImported: boolean;
  portfolioSnapshotSaved: boolean;
  evidence: SocialSyncPostEvidence[];
  accountEvidence: SocialSyncAccountEvidence | null;
  error: string | null;
};

/**
 * Resolves which accounts a performance sync should cover. Without explicit
 * ids the behavior stays on the historical single-account default (the
 * connection's selected account, else its first account) so existing callers
 * are unaffected. Matrix callers pass every account id they manage.
 */
export function pickSocialSyncAccounts(
  accounts: SocialConnectionAccountSummary[],
  requestedAccountIds?: string[]
): { targets: SocialConnectionAccountSummary[]; missingAccountIds: string[] } {
  if (!requestedAccountIds || requestedAccountIds.length === 0) {
    const preferred = accounts.find((account) => account.isSelected) ?? accounts[0];
    return { targets: preferred ? [preferred] : [], missingAccountIds: [] };
  }
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const targets: SocialConnectionAccountSummary[] = [];
  const missingAccountIds: string[] = [];
  for (const id of requestedAccountIds) {
    const account = byId.get(id);
    if (account) targets.push(account);
    else missingAccountIds.push(id);
  }
  return { targets, missingAccountIds };
}

/**
 * Synchronizes read-only performance for exactly one connected account. Failures
 * are captured in the outcome instead of thrown so a matrix sync can continue
 * with the remaining accounts and still report which one failed.
 */
export async function syncSocialConnectionAccountPerformance(
  admin: AdminClient,
  userId: string,
  connectorId: "linkedin" | "instagram" | "x",
  credentials: SocialAdapterCredentialBundle,
  account: SocialConnectionAccountSummary
): Promise<SocialConnectionAccountSyncOutcome> {
  const outcome: SocialConnectionAccountSyncOutcome = {
    accountId: account.id,
    displayName: account.displayName,
    handle: account.handle,
    imported: 0,
    created: 0,
    updated: 0,
    accountMetricsImported: false,
    portfolioSnapshotSaved: false,
    evidence: [],
    accountEvidence: null,
    error: null
  };

  try {
    const adapter = getSocialAdapter(connectorId);
    const adapterTarget = {
      externalAccountId: account.externalAccountId,
      accountType: account.accountType
    };

    // X metering charges per read and its post-metrics channel stays closed,
    // so an X sync covers account-level metrics only — no owned-post walks.
    if (connectorId !== "x") {
      const postsResult = await adapter.listOwnedPosts(credentials, adapterTarget);
      if (postsResult.kind !== "ok") throw new Error(postsResult.reason);
      const postByUrn = new Map(postsResult.value.map((post) => [post.externalPostId, post]));

      const metricsResult = await adapter.pollPostMetrics(credentials, adapterTarget);
      if (metricsResult.kind !== "ok") throw new Error(metricsResult.reason);

      // Idempotency is scoped to the exact connected account, not only platform.
      const { data: existing, error: existingError } = await admin
        .from("official_social_post_metrics")
        .select("external_post_id")
        .eq("user_id", userId)
        .eq("connector_id", connectorId)
        .eq("connection_account_id", account.id);
      if (existingError) throw existingError;
      const existingPostIds = new Set((existing ?? []).map((row) => row.external_post_id));

      for (const metric of metricsResult.value) {
        if ([
          metric.impressions,
          metric.views,
          metric.reach,
          metric.uniqueImpressions,
          metric.reactions,
          metric.comments
        ].every((value) => value === null)) continue;
        const post = postByUrn.get(metric.externalPostId);
        const { error: metricsError } = await admin.rpc("save_official_social_post_metrics", {
          p_user_id: userId,
          p_connection_account_id: account.id,
          p_external_post_id: metric.externalPostId,
          p_post_url: post?.url ?? null,
          p_caption_excerpt: post?.text?.slice(0, 2000) ?? null,
          p_published_at: post?.publishedAt ?? null,
          p_impressions: metric.impressions,
          p_views: metric.views,
          p_reach: metric.reach ?? metric.uniqueImpressions,
          p_reactions: metric.reactions,
          p_comments: metric.comments,
          p_measured_at: metric.polledAt
        });
        if (metricsError) throw metricsError;
        if (existingPostIds.has(metric.externalPostId)) outcome.updated += 1;
        else outcome.created += 1;
        outcome.evidence.push({
          externalPostId: metric.externalPostId,
          url: post?.url ?? null,
          publishedAt: post?.publishedAt ?? null,
          impressions: metric.impressions,
          views: metric.views,
          reach: metric.reach ?? metric.uniqueImpressions,
          reactions: metric.reactions,
          comments: metric.comments,
          measuredAt: metric.polledAt
        });
      }
      outcome.imported = outcome.created + outcome.updated;
    }

    if (connectorId === "instagram" || connectorId === "x") {
      const accountMetrics = await adapter.pollAccountMetrics(credentials, adapterTarget);
      if (accountMetrics && accountMetrics.kind === "ok") {
        const matchingMetrics = accountMetrics.value.find((item) =>
          item.externalAccountId === account.externalAccountId
        );
        if (matchingMetrics) {
          const { error: saveAccountError } = await admin.rpc("save_official_social_account_metrics", {
            p_user_id: userId,
            p_connection_account_id: account.id,
            p_follower_count: matchingMetrics.followerCount,
            p_views: matchingMetrics.views,
            p_reach: matchingMetrics.reach,
            p_profile_views: matchingMetrics.profileViews,
            p_measured_at: matchingMetrics.polledAt
          });
          if (saveAccountError) throw saveAccountError;
          outcome.accountMetricsImported = true;
          outcome.accountEvidence = {
            followerCount: matchingMetrics.followerCount,
            views: matchingMetrics.views,
            reach: matchingMetrics.reach,
            profileViews: matchingMetrics.profileViews,
            measuredAt: matchingMetrics.polledAt
          };

          if (matchingMetrics.followerCount !== null || matchingMetrics.views !== null) {
            const { error: portfolioError } = await admin.rpc("upsert_official_account_portfolio_snapshot", {
              p_user_id: userId,
              p_connection_account_id: account.id,
              p_follower_count: matchingMetrics.followerCount,
              p_views: matchingMetrics.views,
              p_measured_at: matchingMetrics.polledAt
            });
            if (portfolioError) throw portfolioError;
            outcome.portfolioSnapshotSaved = true;
          }
        }
      }
    }
  } catch (error) {
    outcome.error = error instanceof Error ? error.message : "Performance sync failed.";
  }

  return outcome;
}

/**
 * Mirrors a freshly connected X account into the growth portfolio so it
 * appears under 「正在运营的账号」 immediately, without the manual add form.
 * Best-effort: callers swallow errors (logWarn) — a failed mirror must never
 * fail the OAuth redirect.
 */
export async function syncXAccountIntoPortfolioAfterConnection(
  admin: AdminClient,
  userId: string,
  connectionId: string
): Promise<boolean> {
  const credentials = await getSocialConnectionCredentials(admin, userId, "x", connectionId);
  if (!credentials) return false;
  const { data: accounts, error } = await admin
    .from("social_connection_accounts")
    .select("id, external_account_id, account_type, handle, display_name, avatar_url, is_selected, updated_at")
    .eq("connection_id", connectionId);
  if (error) throw error;
  const preferred = (accounts ?? []).find((row) => row.is_selected) ?? (accounts ?? [])[0];
  if (!preferred) return false;
  const outcome = await syncSocialConnectionAccountPerformance(
    admin,
    userId,
    "x",
    {
      connectionId,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      tokenExpiresAt: credentials.tokenExpiresAt,
      grantedScopes: credentials.grantedScopes
    },
    {
      id: preferred.id,
      connectionId,
      externalAccountId: preferred.external_account_id,
      accountType: preferred.account_type,
      handle: preferred.handle,
      displayName: preferred.display_name,
      avatarUrl: preferred.avatar_url,
      isSelected: preferred.is_selected,
      updatedAt: preferred.updated_at
    }
  );
  return outcome.portfolioSnapshotSaved;
}
