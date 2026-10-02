import { NextResponse } from "next/server";
import { growthAccountArchiveInputSchema, growthAccountInputSchema } from "@/lib/growth-portfolio";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = growthAccountInputSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json(
          { error: "Local preview cannot save account data. Connect durable storage to add real numbers." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Growth overview") },
        { status: 503 }
      );
    }

    const { data, error } = await admin.rpc("save_growth_portfolio_account", {
      p_user_id: userId,
      p_account_id: input.accountId ?? null,
      p_platform: input.platform,
      p_display_name: input.displayName,
      p_handle: input.handle || null,
      p_follower_count: input.followerCount,
      p_period_follower_growth: input.periodFollowerGrowth ?? null,
      p_views: input.views ?? null,
      p_leads: input.leads ?? null,
      p_measured_at: input.measuredAt ?? new Date().toISOString()
    });
    if (error) throw error;
    return NextResponse.json({ saved: data, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save account data." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save account data." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = growthAccountArchiveInputSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json(
          { error: "Local preview cannot remove accounts. Connect durable storage to manage real accounts." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Growth overview") },
        { status: 503 }
      );
    }

    const { data, error } = await admin
      .from("managed_social_accounts")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", input.accountId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({ removed: true, accountId: data.id, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to remove an account." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove the account." },
      { status: 400 }
    );
  }
}
