import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import {
  buildGrowthPortfolioOverview,
  type GrowthPortfolioGoalRow,
  type ManagedSocialAccountRow,
  type SocialAccountSnapshotRow
} from "@/lib/growth-portfolio";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { buildLocalGrowthPortfolioDesignPreview } from "@/lib/growth-portfolio-preview";

function isMissingOverviewSchema(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ["42P01", "PGRST205"].includes(String((error as { code: unknown }).code));
}

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json({
          overview: process.env.GROWTH_PORTFOLIO_DESIGN_PREVIEW === "true"
            ? buildLocalGrowthPortfolioDesignPreview()
            : buildGrowthPortfolioOverview([], [], null),
          persisted: false
        });
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Growth overview") },
        { status: 503 }
      );
    }

    const [accountsResult, snapshotsResult, goalResult, connectionsResult] = await Promise.all([
      admin
        .from("managed_social_accounts")
        .select("id,platform,display_name,handle,avatar_url,status,created_at,updated_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      admin
        .from("social_account_snapshots")
        .select("id,account_id,follower_count,period_follower_growth,views,leads,source,measured_at")
        .eq("user_id", userId)
        .order("measured_at", { ascending: true })
        .limit(2000),
      admin
        .from("growth_portfolio_goals")
        .select("id,period_type,period_start,period_end,metric,target_value,status")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("social_connections")
        .select("connector_id")
        .eq("user_id", userId)
        .eq("status", "connected")
    ]);

    const error = accountsResult.error ?? snapshotsResult.error ?? goalResult.error ?? connectionsResult.error;
    if (error) {
      if (isMissingOverviewSchema(error)) {
        return NextResponse.json(
          { error: "Growth overview needs database migration 084 before it can store real data." },
          { status: 503 }
        );
      }
      throw error;
    }

    const overview = buildGrowthPortfolioOverview(
      (accountsResult.data ?? []) as ManagedSocialAccountRow[],
      (snapshotsResult.data ?? []) as SocialAccountSnapshotRow[],
      (goalResult.data ?? null) as GrowthPortfolioGoalRow | null,
      new Date(),
      (connectionsResult.data ?? []) as Array<{ connector_id: string }>
    );
    return NextResponse.json({ overview, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能查看增长总览。", "Please log in to load your growth overview.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法加载增长总览。", "Failed to load the growth overview.") },
      { status: 400 }
    );
  }
}
