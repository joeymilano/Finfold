import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { topicOpportunityFeedbackSchema } from "@/lib/trends/types";

const idSchema = z.string().uuid();
const bodySchema = z.object({ feedback: topicOpportunityFeedbackSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const { feedback } = bodySchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Opportunity feedback requires persistent storage." }, { status: 503 });
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
      .eq("id", id)
      .eq("user_id", userId)
      .select("id,feedback,state")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    return NextResponse.json({ feedback: data.feedback, state: data.state });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "登录后才能提交反馈。" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save feedback." }, { status: 400 });
  }
}
