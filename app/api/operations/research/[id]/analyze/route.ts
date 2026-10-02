import { NextResponse } from "next/server";
import {
  RESEARCH_MISSION_FIELDS,
  researchMissionInputSchema
} from "@/lib/operations/research";
import { getActiveSubscription, resolveEffectivePlan } from "@/lib/payment/entitlements";
import {
  generateResearchDecisionForMission,
  ResearchMissionServiceError
} from "@/lib/operations/research-service";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { locale?: string };
    const locale = body.locale === "en" ? "en" : "zh";
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Research persistence is unavailable." }, { status: 503 });

    const { data: row, error: readError } = await admin
      .from("research_missions")
      .select(`${RESEARCH_MISSION_FIELDS}, user_id`)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Research mission not found." }, { status: 404 });
    if (row.mission_type === "creator_scout") {
      return NextResponse.json(
        { error: "Creator collaboration research is read-only. Use Finfold Agent to analyze transferable creator style from real samples." },
        { status: 410 }
      );
    }

    const input = researchMissionInputSchema.parse({
      operatingProgramId: row.operating_program_id,
      missionType: row.mission_type,
      title: row.title,
      question: row.question,
      subjects: row.subjects,
      evidence: row.evidence
    });
    if (input.evidence.length === 0) {
      return NextResponse.json({ error: "Add at least one real evidence item before analysis." }, { status: 422 });
    }

    const [{ data: program }, { data: profile }, { data: subscriptions }] = await Promise.all([
      input.operatingProgramId
        ? admin.from("operating_programs").select("offer, audience, objective, qualified_lead_rule, watchlist, baseline").eq("id", input.operatingProgramId).eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      admin.from("subscriptions").select("status, current_period_end").eq("user_id", userId).eq("payment_provider", "creem").order("updated_at", { ascending: false })
    ]);
    const effectivePlan = resolveEffectivePlan(
      profile?.plan,
      getActiveSubscription((subscriptions ?? []).map((subscription) => ({
        status: String(subscription.status ?? ""),
        currentPeriodEnd: subscription.current_period_end
      })))
    );
    const mission = await generateResearchDecisionForMission({
      admin,
      userId,
      plan: effectivePlan,
      missionId: id,
      mission: input,
      program: program as Record<string, unknown> | null,
      locale,
      billingSource: "research_center"
    });
    return NextResponse.json({ mission });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to analyze research." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze research evidence." },
      { status: error instanceof ResearchMissionServiceError ? error.status : 400 }
    );
  }
}
