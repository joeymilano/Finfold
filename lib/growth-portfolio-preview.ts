import {
  buildGrowthPortfolioOverview,
  type GrowthPortfolioGoalRow,
  type ManagedSocialAccountRow,
  type SocialAccountSnapshotRow
} from "@/lib/growth-portfolio";

/**
 * Explicit local-only visual fixture. The overview route exposes this only
 * when both ALLOW_MOCK and GROWTH_PORTFOLIO_DESIGN_PREVIEW are enabled outside
 * production. It is never a fallback for missing user data.
 */
export function buildLocalGrowthPortfolioDesignPreview() {
  const accounts: ManagedSocialAccountRow[] = [
    ["qa-xhs", "xiaohongshu", "Finfold 小红书", "@finfold"],
    ["qa-wechat", "wechat", "Finfold 公众号", "Finfold"],
    ["qa-linkedin", "linkedin", "Joey on LinkedIn", "joeyzhao"],
    ["qa-x", "x", "Finfold on X", "@finfoldapp"]
  ].map(([id, platform, displayName, handle]) => ({
    id,
    platform: platform as ManagedSocialAccountRow["platform"],
    display_name: displayName,
    handle,
    avatar_url: null,
    status: "active" as const,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-08-16T08:00:00.000Z"
  }));

  const starts = [41_200, 28_600, 19_800, 17_400];
  const gains = [2_840, 1_020, 720, 310];
  const snapshots: SocialAccountSnapshotRow[] = [];
  for (let day = 0; day < 76; day += 5) {
    accounts.forEach((account, index) => {
      const growth = Math.round(gains[index] * (day / 75));
      snapshots.push({
        id: `qa-${account.id}-${day}`,
        account_id: account.id,
        follower_count: starts[index] + growth,
        period_follower_growth: day === 75 ? gains[index] : Math.round(gains[index] * 0.82),
        views: 40_000 + index * 17_000 + day * 900,
        leads: 4 + index + Math.floor(day / 15),
        source: index === 2 ? "official_sync" : "manual",
        measured_at: new Date(Date.UTC(2026, 5, 2 + day, 8)).toISOString()
      });
    });
  }

  const goal: GrowthPortfolioGoalRow = {
    id: "qa-goal",
    period_type: "month",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    metric: "follower_growth",
    target_value: 6_600,
    status: "active"
  };
  return buildGrowthPortfolioOverview(accounts, snapshots, goal, new Date("2026-08-16T12:00:00.000Z"));
}
