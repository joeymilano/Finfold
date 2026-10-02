import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewPublicDemandSignal } from "@/lib/operations/demand-signals";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const reviewSchema = z.object({ status: z.enum(["kept", "dismissed"]) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid demand signal id." }, { status: 400 });
    }
    const input = reviewSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    const signal = await reviewPublicDemandSignal(admin, userId, id, input.status);
    await captureServerEvent(userId, "public_demand_signal_reviewed", {
      source: signal.source,
      decision: input.status
    });
    return NextResponse.json({ signal });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to review demand signals." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to review demand signal." },
      { status: 400 }
    );
  }
}
