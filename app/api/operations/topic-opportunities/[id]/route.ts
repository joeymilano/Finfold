import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { loadTopicOpportunity } from "@/lib/trends/service";

const idSchema = z.string().uuid();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "zh";
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Opportunity Radar requires persistent storage." }, { status: 503 });
    const opportunity = await loadTopicOpportunity(admin, userId, id, { personalize: true, locale });
    if (!opportunity) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    return NextResponse.json({ opportunity, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "登录后才能查看机会详情。" }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load this opportunity." }, { status: 400 });
  }
}
