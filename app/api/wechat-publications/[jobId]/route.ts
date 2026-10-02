import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { toPublicWechatPublicationJob } from "@/lib/wechat-publication-jobs";

const paramsSchema = z.object({ jobId: z.string().uuid() });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { jobId } = paramsSchema.parse(await params);
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "公众号发布状态暂不可用。" }, { status: 503 });
    const { data, error } = await admin
      .from("wechat_publication_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到这个发布任务。" }, { status: 404 });
    const lang = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "zh";
    return NextResponse.json({ job: toPublicWechatPublicationJob(data, lang) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "发布任务编号无效。" }, { status: 400 });
    return NextResponse.json({ error: "暂时无法读取公众号发布状态。" }, { status: 503 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { jobId } = paramsSchema.parse(await params);
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "公众号发布状态暂不可用。" }, { status: 503 });
    const { data, error } = await admin
      .from("wechat_publication_jobs")
      .update({
        status: "cancelled",
        lease_token: null,
        lease_expires_at: null,
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "任务已开始，不能再取消。" }, { status: 409 });
    }
    return NextResponse.json({ job: toPublicWechatPublicationJob(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "发布任务编号无效。" }, { status: 400 });
    return NextResponse.json({ error: "暂时无法取消公众号发布。" }, { status: 503 });
  }
}
