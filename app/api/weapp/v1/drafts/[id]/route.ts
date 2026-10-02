import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { authenticateWeappRequest } from "@/lib/weapp/auth";
import { settleStaleWeappDraft, type WeappDraftRow } from "@/lib/weapp/drafts";
import { getAvailableCredits } from "@/lib/payment/credits";

const idSchema = z.string().uuid();

/** Poll endpoint for a single draft; refunds + fails stale pendings on read. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data } = await admin
    .from("weapp_drafts")
    .select("*")
    .eq("id", parsedId.data)
    .eq("user_id", session.userId)
    .maybeSingle();
  const row = data as unknown as WeappDraftRow | null;
  if (!row) return NextResponse.json({ error: "draft not found" }, { status: 404 });

  const settled = await settleStaleWeappDraft(admin, row);
  const credits = settled.status === "failed" ? await getAvailableCredits(session.userId) : null;
  return NextResponse.json({
    id: settled.id,
    status: settled.status,
    platform: settled.platform,
    title: settled.topic?.title ?? "",
    content: settled.content,
    error: settled.error,
    creditsCharged: settled.credits_charged,
    createdAt: settled.created_at,
    finishedAt: settled.finished_at,
    ...(credits !== null ? { available: credits } : {})
  });
}
