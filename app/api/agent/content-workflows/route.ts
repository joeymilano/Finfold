import { NextResponse } from "next/server";
import { z } from "zod";
import { listAgentContentWorkflows } from "@/lib/agent/content-workflow";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6)
});

/** Restores factual workflow state after the original Agent chat/SSE session ends. */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { limit } = querySchema.parse({
      limit: new URL(request.url).searchParams.get("limit") ?? undefined
    });
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Agent content workflows") }, { status: 503 });
    }
    return NextResponse.json({ workflows: await listAgentContentWorkflows(admin, userId, limit) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view Agent content workflows." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Agent content workflows." },
      { status: 400 }
    );
  }
}