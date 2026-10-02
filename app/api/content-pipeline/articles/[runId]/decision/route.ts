import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { contentPipelineErrorResponse, guardContentPipelineRequest } from "@/lib/content-pipeline/settings";
import {
  findWechatConnectionTarget,
  regenerateDailyArticle
} from "@/lib/content-pipeline/generate";
import { regenerateDailyCardSet } from "@/lib/content-pipeline/cards";
import { createWechatPublicationJobFromOutput } from "@/lib/wechat-publication-create";

const requestSchema = z.object({
  decision: z.enum(["publish_to_draft", "discard", "regenerate", "override_review"]),
  title: z.string().trim().min(6).max(32).optional(),
  body: z.string().min(600).max(3_500).optional(),
  summary: z.string().trim().min(36).max(120).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const guard = await guardContentPipelineRequest();
  if (!guard.ok) return guard.response;
  const { userId, admin } = guard.context;
  try {
    if (!checkRateLimit(`content-pipeline-decision:${userId}`, 30, 60_000)) {
      return NextResponse.json({ error: "操作过于频繁，请稍后再试。" }, { status: 429 });
    }
    const input = requestSchema.parse(await request.json());
    const { runId } = await params;

    const { data: run } = await admin
      .from("content_pipeline_runs")
      .select("id, channel, status, output_id, kit_id, auto_review, extra")
      .eq("id", runId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!run) return NextResponse.json({ error: "找不到这条生成记录。" }, { status: 404 });
    const isCardRun = run.channel === "xhs_cards";

    if (input.decision === "regenerate") {
      const outcome = isCardRun
        ? await regenerateDailyCardSet(admin, userId, runId)
        : await regenerateDailyArticle(admin, userId, runId);
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (input.decision === "override_review") {
      if (!isCardRun) {
        return NextResponse.json({ error: "只有卡片组支持质检后仍要下载。" }, { status: 400 });
      }
      if (run.status !== "jev_blocked") {
        return NextResponse.json({ error: "这条记录没有被质检拦截。" }, { status: 409 });
      }
      const extra = (run.extra ?? {}) as Record<string, unknown>;
      const { error } = await admin
        .from("content_pipeline_runs")
        .update({
          extra: { ...extra, reviewOverridden: true },
          updated_at: new Date().toISOString()
        })
        .eq("id", runId)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (run.status === "draft_sent") {
      return NextResponse.json({ error: "这篇内容已进入草稿箱。" }, { status: 409 });
    }

    const now = new Date().toISOString();
    if (input.decision === "discard") {
      const { error } = await admin
        .from("content_pipeline_runs")
        .update({ status: "discarded", error_code: "user_discarded", updated_at: now })
        .eq("id", runId)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // publish_to_draft — wechat channel only; optionally save edits first,
    // then reuse the exact publication-creation path the workbench uses.
    if (isCardRun) {
      return NextResponse.json({ error: "卡片组走小红书手动发布，没有草稿箱动线。" }, { status: 400 });
    }
    if (!run.output_id || !run.kit_id) {
      return NextResponse.json({ error: "这条记录没有可发布的内容。" }, { status: 409 });
    }
    const edited = input.title !== undefined || input.body !== undefined || input.summary !== undefined;
    let outputUpdatedAt: string;
    if (edited) {
      const { data: updated, error: updateError } = await admin
        .from("kit_outputs")
        .update({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          user_edited: true,
          updated_at: now
        })
        .eq("id", run.output_id)
        .eq("kit_id", run.kit_id)
        .eq("user_id", userId)
        .select("updated_at")
        .single();
      if (updateError || !updated) {
        return NextResponse.json({ error: "保存修改失败，请重试。" }, { status: 400 });
      }
      outputUpdatedAt = updated.updated_at;
    } else {
      const { data: output } = await admin
        .from("kit_outputs")
        .select("updated_at")
        .eq("id", run.output_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!output) return NextResponse.json({ error: "内容已不存在。" }, { status: 404 });
      outputUpdatedAt = output.updated_at;
    }

    const connection = await findWechatConnectionTarget(admin, userId);
    if (!connection) {
      return NextResponse.json({ error: "尚未连接公众号，请先在设置页完成授权。" }, { status: 409 });
    }
    const { error: settingsError, data: settings } = await admin
      .from("content_pipeline_settings")
      .select("wechat_theme")
      .eq("user_id", userId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const theme = settings?.wechat_theme === "grace" || settings?.wechat_theme === "simple" ? settings.wechat_theme : "default";

    // An unedited article that already passed the unattended gate rides its
    // record; anything the human touched gets a fresh review (fail-open, a
    // person is clicking publish right now).
    const precomputed = !edited && run.auto_review
      && typeof run.auto_review === "object"
      && (run.auto_review as Record<string, unknown>).decision === "pass"
      ? (run.auto_review as Record<string, unknown>)
      : null;

    const creation = await createWechatPublicationJobFromOutput(admin, {
      userId,
      kitId: run.kit_id,
      outputId: run.output_id,
      accountId: connection.accountId,
      mode: "draft_only",
      scheduledFor: now,
      contentVersion: outputUpdatedAt,
      idempotencyKey: crypto.randomUUID(),
      theme,
      precomputedAutoReview: precomputed
    });
    if (!creation.ok) {
      return NextResponse.json(
        { error: creationMessage(creation.code, creation.findings), code: creation.code, findings: creation.findings },
        { status: 409 }
      );
    }
    const { error: runError } = await admin
      .from("content_pipeline_runs")
      .update({
        status: "draft_sent",
        publication_job_id: creation.job.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("user_id", userId);
    if (runError) throw runError;
    return NextResponse.json({ ok: true, jobId: creation.job.id });
  } catch (error) {
    return contentPipelineErrorResponse(error);
  }
}

function creationMessage(code: string, findings?: string[]): string {
  switch (code) {
    case "output_not_found":
    case "connection_not_found":
      return "找不到可发布的公众号内容或账号。";
    case "image_rights_confirmation_required":
      return "发布前请先确认所选来源图片的使用权。";
    case "content_version_changed":
      return "内容刚刚发生了变化，请检查后重新确认。";
    case "capability_insufficient":
      return "当前公众号权限不足，无法写入草稿箱。";
    case "snapshot_invalid":
      return "内容不满足公众号发布要求（标题长度、封面或正文体积），请调整后重试。";
    case "jev_review_blocked":
      return findings?.length
        ? `内容质检未通过：${findings.join("；")}。可修改后重试，或改用创作台手动发布。`
        : "内容质检未通过，请修改后重试。";
    case "active_job_exists":
      return "这篇内容已有进行中的公众号发布任务。";
    default:
      return "暂时无法写入草稿箱，请稍后再试。";
  }
}
