import { NextResponse } from "next/server";
import { z } from "zod";
import { getGrowthMission } from "@/lib/agent/growth-missions";
import {
  campaignSlug,
  generateTrackingCode,
  sanitizeTrackingDestination
} from "@/lib/mission-attribution";
import { loadMissionControlDetail } from "@/lib/mission-control";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const requestSchema = z.object({
  destinationUrl: z.string().trim().min(1).max(2048),
  source: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().max(120).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { missionId } = await params;
    const input = requestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Mission tracking requires durable storage." }, { status: 503 });
    const mission = await getGrowthMission(admin, userId, missionId);
    if (!mission) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });

    const destinationUrl = sanitizeTrackingDestination(input.destinationUrl);
    const source = input.source || mission.platform;
    const campaign = campaignSlug(mission.title);
    const { data: existed, error } = await admin.rpc("upsert_mission_tracking_link", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_code: generateTrackingCode(),
      p_destination_url: destinationUrl,
      p_source: source,
      p_medium: "organic_social",
      p_campaign: campaign,
      p_content: input.content || null
    });
    if (error) throw error;
    await captureServerEvent(userId, "tracking_enabled", { mission_id: missionId, source, campaign });

    const detail = await loadMissionControlDetail(
      admin,
      userId,
      missionId,
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
    );
    return NextResponse.json(detail, { status: existed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to enable mission tracking." }, { status: 401 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid tracking link request." }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create tracking link." }, { status: 400 });
  }
}
