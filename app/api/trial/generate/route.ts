export const runtime = "edge";

import { NextResponse } from "next/server";
import { generateRequestSchema, type ContentKit } from "@/lib/content-schema";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = generateRequestSchema.parse(body);

    const moderation = moderateInput(input.ideaText);
    if (moderation.flagged) {
      return NextResponse.json({ error: moderation.reason }, { status: 422 });
    }

    const outputs = (await generateKitOutputs(input)).map((output) => ({
      ...output,
      locked: false,
      publishStatus: "draft" as const
    }));

    const kit: ContentKit = {
      id: crypto.randomUUID(),
      ideaText: input.ideaText,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: input.mediaAssets,
      outputs,
      status: "saved",
      createdAt: new Date().toISOString()
    };

    return NextResponse.json({ kit, entitlement: { authenticated: false, plan: "showcase", canUseOutputs: true, canAnalyze: true, trialAvailable: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Content generation is temporarily unavailable. Please try again later." },
      { status: 400 }
    );
  }
}
