import { NextResponse } from "next/server";
import { z } from "zod";
import { listNativeLeadSubmissions } from "@/lib/native-leads";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const missionIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const missionId = missionIdSchema.parse((await params).missionId);
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Lead inbox requires durable storage." }, { status: 503 });
    }
    const { data: mission, error: missionError } = await admin
      .from("growth_missions")
      .select("id")
      .eq("id", missionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (missionError) throw missionError;
    if (!mission) return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });

    const leads = await listNativeLeadSubmissions(admin, { userId, missionId });
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view lead submissions." }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Growth Mission not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load lead submissions." },
      { status: 400 }
    );
  }
}
