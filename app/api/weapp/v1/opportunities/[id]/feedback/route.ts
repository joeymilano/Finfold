import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { authenticateWeappRequest } from "@/lib/weapp/auth";
import { topicOpportunityFeedbackSchema } from "@/lib/trends/types";

const idSchema = z.string().uuid();
const bodySchema = z.object({ feedback: topicOpportunityFeedbackSchema });

/** Mirrors the web feedback route with weapp token auth. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const parsedId = idSchema.parse(id);
    const { feedback } = bodySchema.parse(await request.json());
    const state = feedback === "later" ? "snoozed" : "dismissed";
    const { data, error } = await admin
      .from("topic_opportunities")
      .update({
        feedback,
        feedback_at: new Date().toISOString(),
        state,
        snoozed_until: feedback === "later" ? new Date(Date.now() + 24 * 3_600_000).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", parsedId)
      .eq("user_id", session.userId)
      .select("id,feedback,state")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });
    return NextResponse.json({ feedback: data.feedback, state: data.state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unable to save feedback" },
      { status: 400 }
    );
  }
}
