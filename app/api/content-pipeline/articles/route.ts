import { NextResponse } from "next/server";
import { contentPipelineErrorResponse, guardContentPipelineRequest } from "@/lib/content-pipeline/settings";
import { findWechatConnectionTarget } from "@/lib/content-pipeline/generate";
import {
  describeWechatPublicationStatus,
  wechatPublicationStatuses,
  type WechatPublicationStatus
} from "@/lib/wechat-publication";

const LIST_DAYS = 14;

export type DailyPipelineArticle = {
  kitId: string;
  outputId: string;
  title: string;
  body: string;
  summary: string | null;
  cta: string;
  imageUrl: string | null;
  tags: string[];
  updatedAt: string;
};

export type DailyPipelineStory = {
  title: string;
  theme: string;
  artDirection: string;
  pages: Array<{
    id: string;
    role: string;
    kicker: string;
    title: string;
    body: string;
    points: string[];
    emphasis: string;
  }>;
};

export type DailyPipelineRunView = {
  id: string;
  channel: "wechat_articles" | "xhs_cards";
  status: "awaiting_review" | "jev_blocked" | "draft_sent" | "discarded" | "skipped_no_topic" | "failed";
  topicTitle: string | null;
  topicRef: string | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  review: { decision: "pass" | "blocked"; quality: number | null; findings: string[] } | null;
  article: DailyPipelineArticle | null;
  story: DailyPipelineStory | null;
  cardType: string | null;
  titleCandidates: string[];
  reviewOverridden: boolean;
  publication: { id: string; status: string; statusLabel: string } | null;
};

export async function GET() {
  const guard = await guardContentPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const { admin, userId } = guard.context;
    const since = new Date(Date.now() - LIST_DAYS * 86_400_000).toISOString();
    const { data: runRows, error } = await admin
      .from("content_pipeline_runs")
      .select("id, channel, status, topic_title, topic_ref, output_id, publication_job_id, auto_review, error_code, error_message, extra, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;

    const outputIds = (runRows ?? []).map((row) => row.output_id).filter((value): value is string => Boolean(value));
    const jobIds = (runRows ?? []).map((row) => row.publication_job_id).filter((value): value is string => Boolean(value));
    const cardOutputIds = (runRows ?? [])
      .filter((row) => row.channel === "xhs_cards" && row.output_id)
      .map((row) => String(row.output_id));
    const [outputsResult, jobsResult, storiesResult, connection] = await Promise.all([
      outputIds.length
        ? admin.from("kit_outputs")
            .select("id, kit_id, title, body, summary, cta, image_url, notes, updated_at")
            .in("id", outputIds)
        : Promise.resolve({ data: [] } as { data: Record<string, unknown>[] }),
      jobIds.length
        ? admin.from("wechat_publication_jobs")
            .select("id, status")
            .in("id", jobIds)
        : Promise.resolve({ data: [] } as { data: Record<string, unknown>[] }),
      cardOutputIds.length
        ? admin.from("visual_stories")
            .select("output_id, story_json")
            .in("output_id", cardOutputIds)
        : Promise.resolve({ data: [] } as { data: Record<string, unknown>[] }),
      findWechatConnectionTarget(admin, userId)
    ]);
    const outputsById = new Map((outputsResult.data ?? []).map((row) => [String(row.id), row]));
    const jobsById = new Map((jobsResult.data ?? []).map((row) => [String(row.id), row]));
    const storiesByOutputId = new Map((storiesResult.data ?? []).map((row) => [String(row.output_id), row]));

    const runs: DailyPipelineRunView[] = (runRows ?? []).map((row) => {
      const output = row.output_id ? outputsById.get(String(row.output_id)) : null;
      const job = row.publication_job_id ? jobsById.get(String(row.publication_job_id)) : null;
      const extra = (row.extra ?? {}) as Record<string, unknown>;
      const storyRow = row.channel === "xhs_cards" && row.output_id ? storiesByOutputId.get(String(row.output_id)) : null;
      return {
        id: row.id,
        channel: row.channel === "xhs_cards" ? "xhs_cards" : "wechat_articles",
        status: row.status,
        topicTitle: row.topic_title,
        topicRef: row.topic_ref,
        createdAt: row.created_at,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        review: parseAutoReview(row.auto_review),
        article: output ? {
          kitId: String(output.kit_id),
          outputId: String(output.id),
          title: String(output.title ?? ""),
          body: String(output.body ?? ""),
          summary: output.summary ? String(output.summary) : null,
          cta: String(output.cta ?? ""),
          imageUrl: output.image_url ? String(output.image_url) : null,
          tags: String(output.notes ?? "").split(/\s+/).filter(Boolean),
          updatedAt: String(output.updated_at)
        } : null,
        story: storyRow ? parseStory(storyRow.story_json) : null,
        cardType: typeof extra.cardType === "string" ? extra.cardType : null,
        titleCandidates: Array.isArray(extra.titleCandidates)
          ? extra.titleCandidates.filter((value): value is string => typeof value === "string")
          : [],
        reviewOverridden: extra.reviewOverridden === true,
        publication: job ? describePublication(job) : null
      };
    });
    return NextResponse.json({
      runs,
      meta: {
        hasWechatConnection: Boolean(connection),
        accountName: connection?.displayName ?? null
      }
    });
  } catch (error) {
    return contentPipelineErrorResponse(error);
  }
}

function parseStory(value: unknown): DailyPipelineStory | null {
  if (!value || typeof value !== "object") return null;
  const story = value as Record<string, unknown>;
  const pages = Array.isArray(story.pages) ? story.pages : [];
  return {
    title: typeof story.title === "string" ? story.title : "",
    theme: typeof story.theme === "string" ? story.theme : "editorial",
    artDirection: typeof story.artDirection === "string" ? story.artDirection : "",
    pages: pages.map((page, index) => {
      const record = (page ?? {}) as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : `page-${index}`,
        role: typeof record.role === "string" ? record.role : "insight",
        kicker: typeof record.kicker === "string" ? record.kicker : "",
        title: typeof record.title === "string" ? record.title : "",
        body: typeof record.body === "string" ? record.body : "",
        points: Array.isArray(record.points) ? record.points.filter((point): point is string => typeof point === "string") : [],
        emphasis: typeof record.emphasis === "string" ? record.emphasis : ""
      };
    })
  };
}

function describePublication(job: Record<string, unknown>): NonNullable<DailyPipelineRunView["publication"]> {
  const raw = String(job.status);
  const status = (wechatPublicationStatuses as readonly string[]).includes(raw)
    ? (raw as WechatPublicationStatus)
    : "failed";
  return {
    id: String(job.id),
    status,
    statusLabel: describeWechatPublicationStatus(status, "zh")
  };
}

function parseAutoReview(value: unknown): DailyPipelineRunView["review"] {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const metrics = (record.metrics ?? {}) as Record<string, unknown>;
  const quality = typeof metrics.quality === "number" ? metrics.quality : null;
  const reasons = Array.isArray(record.reasons)
    ? record.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return {
    decision: record.decision === "pass" ? "pass" : "blocked",
    quality,
    findings: REVIEW_FINDING_LABELS.filter(([reason]) => reasons.includes(reason)).map(([, label]) => label)
  };
}

const REVIEW_FINDING_LABELS: [string, string][] = [
  ["fabricated_data_risk", "疑似包含来源无法支撑的具体数据或事实"],
  ["clickbait_hype_risk", "标题或包装疑似标题党"],
  ["compliance_risk", "疑似存在平台合规风险"],
  ["ai_tell_risk", "AI 生成痕迹明显"],
  ["quality_below_floor", "内容质量低于自动放行下限"],
  ["jev_answer_missing", "质检结果不完整"],
  ["jev_unavailable", "自动质检暂不可用，转人工确认"]
];
