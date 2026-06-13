export const runtime = "edge";

import { NextResponse } from "next/server";
import { buildCampaignPlan, campaignRequestSchema } from "@/lib/campaign";
import { getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    await getCurrentUserId();
    const input = campaignRequestSchema.parse(await request.json());
    const campaign = buildCampaignPlan(input);

    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to generate campaign plans." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate campaign plan." },
      { status: 400 }
    );
  }
}
