import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { addLeadToolOutcome } from "@/lib/lead-tools/service";

const STAGES = new Set(["clicked", "left_need", "won"]);

/** Owner-confirmed consultation outcome — always manual, never inferred. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    const { id } = await params;

    const body = await request.json();
    const stage = String(body?.stage ?? "");
    if (!STAGES.has(stage)) {
      return NextResponse.json({ error: "stage must be clicked / left_need / won." }, { status: 400 });
    }
    await addLeadToolOutcome(admin, userId, id, {
      occurredOn: String(body?.occurredOn ?? ""),
      stage: stage as "clicked" | "left_need" | "won",
      note: String(body?.note ?? "")
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const unauth = error instanceof Error && error.message === "Unauthorized";
    const invalid = error instanceof Error && error.message.includes("日期");
    return NextResponse.json(
      { error: unauth ? "Please log in." : invalid ? (error as Error).message : "Lead tools are temporarily unavailable." },
      { status: unauth ? 401 : invalid ? 422 : 503 }
    );
  }
}
