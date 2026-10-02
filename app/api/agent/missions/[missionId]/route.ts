
import { NextResponse } from "next/server";
import { z } from "zod";
import { getGrowthMission } from "@/lib/agent/growth-missions";
import { loadMissionControlDetail } from "@/lib/mission-control";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const updateMissionSchema = z.object({
  status: z.enum(["dismissed"])
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { missionId } = await params;
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Growth Missions require Supabase." }, { status: 503 });
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(_request.url).origin;
    const detail = await loadMissionControlDetail(admin, userId, missionId, appUrl);
    return detail
      ? NextResponse.json(detail)
      : NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view this Growth Mission." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Growth Mission." },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { missionId } = await params;
    const input = updateMissionSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Growth Missions require Supabase." }, { status: 503 });
    }
    const { data, error } = await admin
      .from("growth_missions")
      .update({
        status: input.status,
        execution_state: "closed",
        updated_at: new Date().toISOString()
      })
      .eq("id", missionId)
      .eq("user_id", userId)
      .in("status", ["accepted", "draft_ready", "posted"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Active Growth Mission not found." }, { status: 404 });
    }
    const mission = await getGrowthMission(admin, userId, missionId);
    return NextResponse.json({ mission });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to update this Growth Mission." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update Growth Mission." },
      { status: 400 }
    );
  }
}
