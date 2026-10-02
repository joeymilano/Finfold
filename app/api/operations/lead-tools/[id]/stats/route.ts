import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { loadLeadToolStats } from "@/lib/lead-tools/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    const { id } = await params;
    const stats = await loadLeadToolStats(admin, userId, id);
    if (!stats) return NextResponse.json({ error: "Lead tool not found." }, { status: 404 });
    return NextResponse.json({ stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauth = error instanceof Error && error.message === "Unauthorized";
    return NextResponse.json(
      { error: unauth ? "Please log in." : "Lead tools are temporarily unavailable." },
      { status: unauth ? 401 : 503 }
    );
  }
}
