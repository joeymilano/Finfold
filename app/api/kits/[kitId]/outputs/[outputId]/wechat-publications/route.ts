import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBoundedJson, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { apiError } from "@/lib/i18n";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { toPublicWechatPublicationJob } from "@/lib/wechat-publication-jobs";
import {
  createWechatPublicationJobFromOutput,
  type WechatPublicationCreateResult
} from "@/lib/wechat-publication-create";

const MAX_REQUEST_BYTES = 16 * 1024;
const requestSchema = z.object({
  accountId: z.string().uuid(),
  mode: z.enum(["draft_only", "scheduled_publish"]),
  scheduledFor: z.string().datetime({ offset: true }),
  contentVersion: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  theme: z.enum(["default", "grace", "simple"]).default("default"),
  forceAfterJev: z.boolean().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!checkRateLimit(`wechat-publication:${userId}`, 20, 60_000)) {
      return NextResponse.json({ error: apiError(request.headers, "发布安排过于频繁，请稍后再试。", "Too many publication requests. Please try again shortly.") }, { status: 429 });
    }
    const input = requestSchema.parse(await parseBoundedJson(request, MAX_REQUEST_BYTES));
    const { kitId, outputId } = await params;
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: apiError(request.headers, "公众号发布暂不可用。", "WeChat Official Account publishing is temporarily unavailable.") }, { status: 503 });

    const result = await createWechatPublicationJobFromOutput(admin, {
      userId,
      kitId,
      outputId,
      accountId: input.accountId,
      mode: input.mode,
      scheduledFor: input.scheduledFor,
      contentVersion: input.contentVersion,
      idempotencyKey: input.idempotencyKey,
      theme: input.theme,
      forceAfterJev: input.forceAfterJev
    });
    const mapped = mapCreateResult(request.headers, result);
    return mapped;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: apiError(request.headers, "发布请求过大。", "The publication request is too large.") }, { status: 413 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录。", "Please sign in first.") }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: apiError(request.headers, "发布信息不完整或格式不正确。", "The publication request is incomplete or malformed.") }, { status: 400 });
    }
    console.error("[wechat-publication] schedule failed:", error);
    return NextResponse.json({ error: apiError(request.headers, "暂时无法安排公众号发布，请使用人工交接。", "WeChat publishing cannot be scheduled right now. Use the manual handoff instead.") }, { status: 503 });
  }
}

function mapCreateResult(
  headers: Headers,
  result: WechatPublicationCreateResult
): NextResponse<Record<string, unknown>> {
  if (result.ok) {
    return NextResponse.json({ job: toPublicWechatPublicationJob(result.job), accepted: true }, { status: 202 });
  }
  switch (result.code) {
    case "output_not_found":
      return NextResponse.json({ error: apiError(headers, "找不到可发布的公众号内容。", "No publishable WeChat content was found.") }, { status: 404 });
    case "image_rights_confirmation_required":
      return NextResponse.json({ error: apiError(headers, "发布前请先确认所选来源图片的使用权。", "Confirm the usage rights of the selected source images before publishing."), code: "image_rights_confirmation_required" }, { status: 409 });
    case "content_version_changed":
      return NextResponse.json({ error: apiError(headers, "内容刚刚发生了变化，请检查后重新确认。", "The content just changed. Please review and confirm again."), code: "content_version_changed" }, { status: 409 });
    case "connection_not_found":
      return NextResponse.json({ error: apiError(headers, "找不到已连接的公众号账号。", "No connected Official Account was found.") }, { status: 404 });
    case "capability_insufficient":
      return NextResponse.json({
        error: apiError(headers, "当前账号权限不足，已保留复制富文本和打开公众号后台的交接方式。", "This account lacks the required permissions. Copy the rich text and hand off in the WeChat admin console instead."),
        capability: result.capability
      }, { status: 409 });
    case "invalid_schedule":
      return NextResponse.json({ error: apiError(headers, "请选择当前时间或未来的发布时间。", "Choose a publish time in the present or future.") }, { status: 400 });
    case "schedule_too_far":
      return NextResponse.json({ error: apiError(headers, "发布时间不能超过一年。", "The publish time cannot be more than one year out.") }, { status: 400 });
    case "platform_risk":
      return NextResponse.json({
        error: result.message,
        findings: result.findings,
        code: "platform_risk"
      }, { status: 409 });
    case "snapshot_invalid":
      return NextResponse.json({ error: result.message, code: result.validationCode ?? "snapshot_invalid" }, { status: 409 });
    case "jev_review_blocked":
      return NextResponse.json({
        error: apiError(headers, "内容质检未通过，请先处理以下问题，或确认仍要发布。", "Content review flagged this article. Resolve the findings or confirm publishing anyway."),
        findings: result.findings,
        code: "jev_review_blocked"
      }, { status: 409 });
    case "active_job_exists":
      return NextResponse.json({ error: apiError(headers, "这篇内容已有进行中的公众号发布任务。", "A WeChat publication job is already in progress for this content.") }, { status: 409 });
    case "persist_failed":
    default:
      console.error("[wechat-publication] create failed:", result.message);
      return NextResponse.json({ error: apiError(headers, "暂时无法安排公众号发布，请使用人工交接。", "WeChat publishing cannot be scheduled right now. Use the manual handoff instead.") }, { status: 503 });
  }
}
