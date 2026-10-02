import { NextResponse } from "next/server";
import { growthGoalInputSchema } from "@/lib/growth-portfolio";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = growthGoalInputSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        return NextResponse.json(
          { error: "Local preview cannot save goals. Connect durable storage to keep real progress." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: persistenceUnavailableMessage("Growth goals") },
        { status: 503 }
      );
    }

    const { data, error } = await admin.rpc("set_growth_portfolio_goal", {
      p_user_id: userId,
      p_period_type: input.periodType,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_metric: input.metric,
      p_target_value: input.targetValue
    });
    if (error) throw error;
    return NextResponse.json({ goal: data, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save a growth goal." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save the growth goal." },
      { status: 400 }
    );
  }
}
