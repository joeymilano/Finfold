export const runtime = "edge";

import { NextResponse } from "next/server";
import { buildCampaignPlan, campaignRequestSchema } from "@/lib/campaign";

export async function POST(request: Request) {
  try {
    const input = campaignRequestSchema.parse(await request.json());
    const campaign = buildCampaignPlan(input);

    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate campaign plan." },
      { status: 400 }
    );
  }
}
