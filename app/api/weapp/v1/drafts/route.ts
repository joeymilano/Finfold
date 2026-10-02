import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { authenticateWeappRequest } from "@/lib/weapp/auth";
import { runWeappDraftGeneration, type WeappDraftRow } from "@/lib/weapp/drafts";
import { reserveCredits } from "@/lib/payment/credits";
import { ACTION_CREDITS } from "@/lib/payment/types";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";

const DRAFT_COST = ACTION_CREDITS.singlePlatformCopy;

const bodySchema = z.object({
  source: z.enum(["opportunity", "free"]),
  opportunityId: z.string().uuid().optional(),
  platform: z.enum(["wechat", "xiaohongshu", "moments"]),
  topic: z.object({
    title: z.string().trim().min(2).max(120),
    fact: z.string().trim().max(600).optional(),
    angle: z.string().trim().max(300).optional(),
    keywords: z.array(z.string().trim().min(1).max(24)).max(8).optional()
  })
});

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, { scope: "weapp-draft-create", limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = bodySchema.parse(await request.json());

    if (body.source === "opportunity" && body.opportunityId) {
      const { data: owned } = await admin
        .from("topic_opportunities")
        .select("id")
        .eq("id", body.opportunityId)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (!owned) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });
    }

    // Reserve first: insufficient balance never starts a generation (402).
    const reservation = await reserveCredits(session.userId, DRAFT_COST, "singlePlatformCopy", "weapp", {
      platform: body.platform,
      opportunityId: body.opportunityId ?? null
    });
    if (!reservation) {
      return NextResponse.json(
        { error: "额度不足，请到 Finfold 主站充值后继续。", code: "insufficient_credits" },
        { status: 402 }
      );
    }

    const { data: row, error } = await admin
      .from("weapp_drafts")
      .insert({
        user_id: session.userId,
        source: body.source,
        opportunity_id: body.opportunityId ?? null,
        topic: body.topic,
        platform: body.platform,
        credits_charged: DRAFT_COST
      })
      .select("id,status,credits_charged,created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "draft insert failed");

    after(() => runWeappDraftGeneration(row.id));
    return NextResponse.json({
      id: row.id,
      status: row.status,
      cost: DRAFT_COST,
      available: reservation.available,
      createdAt: row.created_at
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "draft creation failed" },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  const session = await authenticateWeappRequest(request, admin);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await admin
    .from("weapp_drafts")
    .select("id,source,platform,topic,status,content,error,credits_charged,created_at,finished_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const drafts = (data ?? []) as unknown as WeappDraftRow[];
  return NextResponse.json({
    drafts: drafts.map((item) => ({
      id: item.id,
      title: item.topic?.title ?? "",
      platform: item.platform,
      status: item.status,
      content: item.status === "ready" ? item.content : null,
      createdAt: item.created_at
    }))
  });
}
