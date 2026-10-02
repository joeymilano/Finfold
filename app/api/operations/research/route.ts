import { NextResponse } from "next/server";
import {
  mapResearchMission,
  RESEARCH_MISSION_FIELDS,
  researchMissionCreateInputSchema
} from "@/lib/operations/research";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ missions: [], persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Research Center") }, { status: 503 });
    }
    const { data, error } = await admin
      .from("research_missions")
      .select(RESEARCH_MISSION_FIELDS)
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ missions: (data ?? []).map((row) => mapResearchMission(row as never)), persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to use Research Center." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load research missions." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = researchMissionCreateInputSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) {
        const now = new Date().toISOString();
        return NextResponse.json({
          mission: { ...input, id: "local-research-mission", status: "collecting", decision: null, createdAt: now, updatedAt: now },
          persisted: false
        });
      }
      return NextResponse.json({ error: persistenceUnavailableMessage("Research Center") }, { status: 503 });
    }
    if (input.operatingProgramId) {
      const { data: program } = await admin
        .from("operating_programs")
        .select("id")
        .eq("id", input.operatingProgramId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!program) return NextResponse.json({ error: "Operating program not found." }, { status: 404 });
    }
    const { data, error } = await admin
      .from("research_missions")
      .insert({
        user_id: userId,
        operating_program_id: input.operatingProgramId ?? null,
        platform: "xiaohongshu",
        mission_type: input.missionType,
        title: input.title,
        question: input.question,
        subjects: input.subjects,
        evidence: input.evidence,
        status: "collecting"
      })
      .select(RESEARCH_MISSION_FIELDS)
      .single();
    if (error) throw error;
    return NextResponse.json({ mission: mapResearchMission(data as never), persisted: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to create a research mission." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create research mission." }, { status: 400 });
  }
}
