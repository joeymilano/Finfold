import { z } from "zod";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import { markGrowthMissionPosted } from "@/lib/agent/growth-missions";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { operatingPlatformSchema } from "@/lib/operations/program";
import { reconcileOperatingTaskAfterPublication } from "@/lib/operations/weekly-tasks";
import { logInfo } from "@/lib/observability";
import { readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { outputImageSourceSchema, requiresImageRightsConfirmation } from "@/lib/source-image";
import {
  addWechatArticleDraft,
  fetchWechatPublicationStatus,
  findRecentWechatArticleDraft,
  isWechatAccessTokenError,
  submitWechatArticleForPublication,
  uploadWechatArticleImage,
  uploadWechatCoverMaterial,
  WechatApiError,
  type WechatComponentEvent
} from "@/lib/wechat-component";
import { getActiveWechatPublishingCredentials } from "@/lib/wechat-connections";
import {
  deriveWechatPublishingCapability,
  describeWechatPublicationStatus,
  mapWechatProviderPublicationStatus,
  validateWechatPublicationSnapshot,
  wechatPublicationModes,
  wechatPublicationStatuses,
  type WechatPreparedPublicationSnapshot,
  type WechatPublicationSnapshot,
  type WechatPublicationStatus
} from "@/lib/wechat-publication";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const MAX_INLINE_IMAGE_BYTES = 1_000_000;
const MAX_COVER_IMAGE_BYTES = 10_000_000;
const POLL_INTERVAL_MS = 60_000;

const snapshotSchema = z.object({
  title: z.string(),
  summary: z.string(),
  contentHtml: z.string(),
  coverImageUrl: z.string(),
  inlineImageUrls: z.array(z.string()),
  theme: z.enum(["default", "grace", "simple"]),
  outputUpdatedAt: z.string()
});

const preparedSnapshotSchema = snapshotSchema.extend({
  coverThumbMediaId: z.string().min(1),
  uploadedImageUrls: z.record(z.string(), z.string().url())
});

const publicationJobRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kit_id: z.string().uuid(),
  output_id: z.string().uuid(),
  connection_account_id: z.string().uuid(),
  mode: z.enum(wechatPublicationModes),
  status: z.enum(wechatPublicationStatuses),
  scheduled_for: z.string(),
  approved_at: z.string(),
  approved_output_updated_at: z.string(),
  content_fingerprint: z.string().length(64),
  content_snapshot: snapshotSchema,
  prepared_snapshot: preparedSnapshotSchema.nullable(),
  draft_media_id: z.string().nullable(),
  publish_id: z.string().nullable(),
  article_id: z.string().nullable(),
  article_url: z.string().url().nullable(),
  provider_status: z.coerce.number().int().nullable(),
  attempt_count: z.coerce.number().int().nonnegative(),
  next_attempt_at: z.string(),
  lease_token: z.string().uuid().nullable(),
  lease_expires_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  published_at: z.string().nullable(),
  auto_review: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string()
});

export type WechatPublicationJobRow = z.infer<typeof publicationJobRowSchema>;

export type PublicWechatPublicationJob = {
  id: string;
  mode: WechatPublicationJobRow["mode"];
  status: WechatPublicationStatus;
  statusLabel: string;
  scheduledFor: string;
  articleUrl: string | null;
  error: string | null;
  canCancel: boolean;
  recoverableAction: "reapprove" | "inspect" | null;
  jevReviewed: { decision: "pass" | "overridden" } | null;
  updatedAt: string;
};

export type WechatPublicationDispatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
};

export function toPublicWechatPublicationJob(
  value: unknown,
  lang: "zh" | "en" = "zh"
): PublicWechatPublicationJob {
  const row = publicationJobRowSchema.parse(value);
  const review = row.auto_review;
  const jevReviewed = review && typeof review === "object"
    ? review.overridden === true
      ? { decision: "overridden" as const }
      : review.decision === "pass"
        ? { decision: "pass" as const }
        : null
    : null;
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    statusLabel: describeWechatPublicationStatus(row.status, lang),
    scheduledFor: row.scheduled_for,
    articleUrl: row.article_url,
    error: row.error_message,
    canCancel: row.status === "scheduled",
    recoverableAction: row.status === "needs_reapproval"
      ? "reapprove"
      : row.status === "attention_required"
        ? "inspect"
        : null,
    jevReviewed,
    updatedAt: row.updated_at
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceImageUrl(contentHtml: string, source: string, destination: string): string {
  return contentHtml
    .split(source).join(destination)
    .split(escapeAttribute(source)).join(escapeAttribute(destination));
}

async function readWechatImage(
  url: string,
  maxBytes: number
): Promise<{ bytes: Uint8Array; contentType: "image/jpeg" | "image/png" }> {
  const response = await safeExternalFetch(url, {
    headers: { Accept: "image/jpeg,image/png" },
    cache: "no-store"
  }, {
    timeoutMs: 15_000,
    allowedContentTypes: ["image/jpeg", "image/png"],
    auditPurpose: "wechat_publication_asset"
  });
  if (!response.ok) throw new Error(`Could not download a publication image (${response.status}).`);
  const bytes = await readBytesWithLimit(response, maxBytes);
  const inspection = inspectMediaUploadBytes(bytes);
  if (!inspection.ok || (inspection.contentType !== "image/jpeg" && inspection.contentType !== "image/png")) {
    throw new Error("WeChat article images must be valid static JPEG or PNG files.");
  }
  return { bytes, contentType: inspection.contentType };
}

async function updateClaimedJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  patch: Record<string, unknown>
): Promise<void> {
  if (!job.lease_token) throw new Error("The publication job lease is missing.");
  const { data, error } = await admin
    .from("wechat_publication_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("lease_token", job.lease_token)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The publication job lease expired.");
}

async function failClaimedJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  status: "failed" | "blocked" | "attention_required",
  code: string,
  message: string
): Promise<void> {
  await updateClaimedJob(admin, job, {
    status,
    error_code: code,
    error_message: message.slice(0, 1_000),
    lease_token: null,
    lease_expires_at: null
  });
}

async function retryClaimedJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  message: string
): Promise<void> {
  const delayMinutes = Math.min(Math.max(job.attempt_count, 1), 5);
  await updateClaimedJob(admin, job, {
    status: job.status,
    next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    error_code: "transient_processing_error",
    error_message: message.slice(0, 1_000),
    lease_token: null,
    lease_expires_at: null
  });
}

async function prepareWechatSnapshot(
  snapshot: WechatPublicationSnapshot,
  accessToken: string,
  providerFetch: FetchLike
): Promise<WechatPreparedPublicationSnapshot> {
  const cover = await readWechatImage(snapshot.coverImageUrl, MAX_COVER_IMAGE_BYTES);
  const coverThumbMediaId = await uploadWechatCoverMaterial(
    accessToken,
    cover.bytes,
    cover.contentType,
    providerFetch
  );
  const uploadedImageUrls: Record<string, string> = {};
  let contentHtml = snapshot.contentHtml;
  for (let offset = 0; offset < snapshot.inlineImageUrls.length; offset += 3) {
    const chunk = snapshot.inlineImageUrls.slice(offset, offset + 3);
    const uploaded = await Promise.all(chunk.map(async (sourceUrl) => {
      const image = await readWechatImage(sourceUrl, MAX_INLINE_IMAGE_BYTES);
      const wechatUrl = await uploadWechatArticleImage(
        accessToken,
        image.bytes,
        image.contentType,
        providerFetch
      );
      return { sourceUrl, wechatUrl };
    }));
    for (const item of uploaded) {
      uploadedImageUrls[item.sourceUrl] = item.wechatUrl;
      contentHtml = replaceImageUrl(contentHtml, item.sourceUrl, item.wechatUrl);
    }
  }
  if (/\ssrc=["']https?:\/\/(?!mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)/i.test(contentHtml)) {
    throw new Error("An external image remained in the WeChat article after material upload.");
  }
  return { ...snapshot, contentHtml, coverThumbMediaId, uploadedImageUrls };
}

async function finalizePublishedJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  article: { id: string | null; url: string; providerStatus: number }
): Promise<void> {
  const publishedAt = new Date().toISOString();
  const { error: outputError } = await admin
    .from("kit_outputs")
    .update({
      publish_status: "posted",
      published_url: article.url,
      published_at: publishedAt,
      updated_at: publishedAt
    })
    .eq("id", job.output_id)
    .eq("kit_id", job.kit_id)
    .eq("user_id", job.user_id);
  if (outputError) throw outputError;

  await updateClaimedJob(admin, job, {
    status: "published",
    article_id: article.id,
    article_url: article.url,
    provider_status: article.providerStatus,
    published_at: publishedAt,
    error_code: null,
    error_message: null,
    lease_token: null,
    lease_expires_at: null
  });
  logInfo("wechat_publication_published", { userId: job.user_id }, {
    provider_status: article.providerStatus,
    approval_to_publish_ms: Math.max(0, Date.now() - Date.parse(job.approved_at)),
    attempts: job.attempt_count
  });

  try {
    const { data: kit } = await admin
      .from("content_kits")
      .select("growth_mission_id")
      .eq("id", job.kit_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (kit?.growth_mission_id) {
      await markGrowthMissionPosted(admin, job.user_id, kit.growth_mission_id, "wechat");
    }
    if (operatingPlatformSchema.safeParse("wechat").success) {
      await reconcileOperatingTaskAfterPublication(admin, job.user_id, "wechat", job.output_id, new Date(publishedAt));
    }
    await advancePatrolAfterEvent(admin, job.user_id, {
      type: "output_posted",
      kitId: job.kit_id,
      outputId: job.output_id,
      platform: "wechat",
      publishedAt,
      missionId: kit?.growth_mission_id ?? null
    });
  } catch (error) {
    console.error("[wechat-publication] downstream reconciliation failed:", error);
  }
}

async function processProviderStatus(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  providerFetch: FetchLike
): Promise<void> {
  if (!job.publish_id) {
    await failClaimedJob(admin, job, "attention_required", "missing_publish_id", "微信发布编号缺失，Finfold 已停止自动重试。 ");
    return;
  }
  let active = await getActiveWechatPublishingCredentials(admin, job.user_id, job.connection_account_id, false, providerFetch);
  let providerStatus;
  try {
    providerStatus = await fetchWechatPublicationStatus(active.credentials.accessToken, job.publish_id, providerFetch);
  } catch (error) {
    if (!isWechatAccessTokenError(error)) throw error;
    active = await getActiveWechatPublishingCredentials(admin, job.user_id, job.connection_account_id, true, providerFetch);
    providerStatus = await fetchWechatPublicationStatus(active.credentials.accessToken, job.publish_id, providerFetch);
  }
  const status = mapWechatProviderPublicationStatus(providerStatus);
  if (status === "published" && providerStatus.articleUrl) {
    await finalizePublishedJob(admin, job, {
      id: providerStatus.articleId,
      url: providerStatus.articleUrl,
      providerStatus: providerStatus.status
    });
    return;
  }
  if (status === "publishing") {
    await updateClaimedJob(admin, job, {
      status: "publishing",
      provider_status: providerStatus.status,
      article_id: providerStatus.articleId,
      next_attempt_at: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
      lease_token: null,
      lease_expires_at: null
    });
    return;
  }
  await updateClaimedJob(admin, job, {
    status,
    provider_status: providerStatus.status,
    article_id: providerStatus.articleId,
    article_url: providerStatus.articleUrl,
    error_code: `wechat_publish_status_${providerStatus.status}`,
    error_message: describeWechatPublicationStatus(status, "zh"),
    lease_token: null,
    lease_expires_at: null
  });
}

/** The connected account's display name becomes the article byline; undefined falls back to the API default. */
async function draftAuthorForJob(
  admin: AdminClient,
  job: Pick<WechatPublicationJobRow, "connection_account_id">
): Promise<string | undefined> {
  const { data } = await admin
    .from("social_connection_accounts")
    .select("display_name")
    .eq("id", job.connection_account_id)
    .maybeSingle();
  const name = typeof data?.display_name === "string" ? data.display_name.trim() : "";
  return name ? name.slice(0, 30) : undefined;
}

async function processScheduledJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  providerFetch: FetchLike
): Promise<void> {
  const { data: output, error: outputError } = await admin
    .from("kit_outputs")
    .select("updated_at, image_source")
    .eq("id", job.output_id)
    .eq("kit_id", job.kit_id)
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (outputError) throw outputError;
  if (!output || Date.parse(output.updated_at) !== Date.parse(job.approved_output_updated_at)) {
    await updateClaimedJob(admin, job, {
      status: "needs_reapproval",
      error_code: "content_changed_after_approval",
      error_message: "内容在排期确认后发生变化，请重新确认。",
      lease_token: null,
      lease_expires_at: null
    });
    return;
  }
  const imageSource = outputImageSourceSchema.safeParse(output.image_source);
  if (imageSource.success && requiresImageRightsConfirmation(imageSource.data)) {
    await updateClaimedJob(admin, job, {
      status: "needs_reapproval",
      error_code: "image_rights_confirmation_required",
      error_message: "来源图片的使用权尚未确认，请确认后重新安排发布。",
      lease_token: null,
      lease_expires_at: null
    });
    return;
  }

  const validation = validateWechatPublicationSnapshot(job.content_snapshot);
  if (!validation.ok) {
    await failClaimedJob(admin, job, "failed", validation.code, validation.message);
    return;
  }

  let active = await getActiveWechatPublishingCredentials(admin, job.user_id, job.connection_account_id, false, providerFetch);
  const capability = deriveWechatPublishingCapability({
    grantedScopes: active.credentials.grantedScopes,
    providerMetadata: active.account.providerMetadata
  });
  if (!capability.canCreateDraft || (job.mode === "scheduled_publish" && !capability.canSubmitPublish)) {
    await failClaimedJob(admin, job, "blocked", "publishing_capability_unavailable", "当前公众号权限不足，已保留人工发布交接。 ");
    return;
  }
  await updateClaimedJob(admin, job, { status: "preparing", error_code: null, error_message: null });

  const callWithTokenRefresh = async <T>(operation: (accessToken: string) => Promise<T>): Promise<T> => {
    try {
      return await operation(active.credentials.accessToken);
    } catch (error) {
      if (!isWechatAccessTokenError(error)) throw error;
      active = await getActiveWechatPublishingCredentials(admin, job.user_id, job.connection_account_id, true, providerFetch);
      return operation(active.credentials.accessToken);
    }
  };

  const prepared = job.prepared_snapshot ?? await callWithTokenRefresh((accessToken) => (
    prepareWechatSnapshot(job.content_snapshot, accessToken, providerFetch)
  ));
  if (!job.prepared_snapshot) {
    await updateClaimedJob(admin, job, { prepared_snapshot: prepared });
  }

  let mediaId = job.draft_media_id;
  if (!mediaId) {
    mediaId = await callWithTokenRefresh((accessToken) => findRecentWechatArticleDraft(accessToken, {
      title: prepared.title,
      digest: prepared.summary,
      content: prepared.contentHtml
    }, providerFetch));
  }
  if (!mediaId) {
    mediaId = await callWithTokenRefresh(async (accessToken) => addWechatArticleDraft(accessToken, {
      title: prepared.title,
      // The byline is the account owner's own nickname, not Finfold.
      author: await draftAuthorForJob(admin, job),
      digest: prepared.summary,
      content: prepared.contentHtml,
      thumbMediaId: prepared.coverThumbMediaId
    }, providerFetch));
  }
  await updateClaimedJob(admin, job, { status: "draft_ready", draft_media_id: mediaId });
  logInfo("wechat_publication_draft_ready", { userId: job.user_id }, {
    mode: job.mode,
    attempts: job.attempt_count,
    approval_to_draft_ms: Math.max(0, Date.now() - Date.parse(job.approved_at))
  });
  if (job.mode === "draft_only") {
    await updateClaimedJob(admin, job, { lease_token: null, lease_expires_at: null });
    return;
  }

  try {
    const publishId = await callWithTokenRefresh((accessToken) => (
      submitWechatArticleForPublication(accessToken, mediaId!, providerFetch)
    ));
    await updateClaimedJob(admin, job, {
      status: "submitted",
      publish_id: publishId,
      next_attempt_at: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
      lease_token: null,
      lease_expires_at: null
    });
    logInfo("wechat_publication_submitted", { userId: job.user_id }, {
      attempts: job.attempt_count,
      approval_to_submit_ms: Math.max(0, Date.now() - Date.parse(job.approved_at))
    });
  } catch (error) {
    if (error instanceof WechatApiError) throw error;
    await failClaimedJob(
      admin,
      job,
      "attention_required",
      "publish_submit_result_unknown",
      "正式提交时连接中断，Finfold 不会重复提交；将等待微信回调或人工核对。"
    );
  }
}

async function processClaimedJob(
  admin: AdminClient,
  job: WechatPublicationJobRow,
  providerFetch: FetchLike
): Promise<void> {
  if (job.status === "scheduled") {
    await processScheduledJob(admin, job, providerFetch);
    return;
  }
  await processProviderStatus(admin, job, providerFetch);
}

export async function dispatchWechatPublicationJobs(
  admin: AdminClient,
  input: { limit?: number; providerFetch?: FetchLike } = {}
): Promise<WechatPublicationDispatchResult> {
  const { data, error } = await admin.rpc("claim_due_wechat_publication_jobs", {
    p_limit: Math.min(Math.max(input.limit ?? 10, 1), 25),
    p_lease_seconds: 90
  });
  if (error) throw error;
  const jobs = z.array(publicationJobRowSchema).parse(data ?? []);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await processClaimedJob(admin, job, input.providerFetch ?? fetch);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "WeChat publication processing failed.";
      try {
        const providerRetryable = !(error instanceof WechatApiError) || error.code === -1 || error.code === 45009;
        const pollingJob = job.status === "submitted" || job.status === "publishing" || job.status === "attention_required";
        if (providerRetryable && (pollingJob || job.attempt_count < 4)) {
          await retryClaimedJob(admin, job, message);
        } else {
          await failClaimedJob(admin, job, "failed", "processing_failed", message);
        }
      } catch (persistError) {
        console.error("[wechat-publication] failed to persist job failure:", persistError);
      }
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}

async function callbackEventKey(event: WechatComponentEvent): Promise<string> {
  const value = [
    event.authorizerAppId ?? "",
    event.publishId ?? "",
    event.publishStatus ?? "",
    event.articleId ?? "",
    event.articleUrl ?? "",
    event.createTime ?? ""
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function applyWechatPublicationCallback(
  admin: AdminClient,
  event: WechatComponentEvent
): Promise<"applied" | "duplicate" | "ignored"> {
  if (event.infoType.toUpperCase() !== "PUBLISHJOBFINISH" || !event.publishId || event.publishStatus === undefined) {
    return "ignored";
  }
  const eventKey = await callbackEventKey(event);
  const { error: replayError } = await admin.from("wechat_publication_callback_events").insert({
    event_key: eventKey,
    publish_id: event.publishId
  });
  if (replayError) {
    if (/duplicate|unique/i.test(replayError.message ?? "")) return "duplicate";
    throw replayError;
  }
  const initial = await admin
    .from("wechat_publication_jobs")
    .select("*")
    .eq("publish_id", event.publishId)
    .in("status", ["submitted", "publishing", "attention_required"])
    .maybeSingle();
  let data = initial.data;
  if (initial.error) throw initial.error;
  if (!data && event.authorizerAppId) {
    const { data: account, error: accountError } = await admin
      .from("social_connection_accounts")
      .select("id")
      .eq("external_account_id", event.authorizerAppId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (account?.id) {
      const uncertain = await admin
        .from("wechat_publication_jobs")
        .select("*")
        .eq("connection_account_id", account.id)
        .eq("status", "attention_required")
        .is("publish_id", null)
        .gte("updated_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (uncertain.error) throw uncertain.error;
      if (uncertain.data) {
        const linked = await admin
          .from("wechat_publication_jobs")
          .update({ publish_id: event.publishId, updated_at: new Date().toISOString() })
          .eq("id", uncertain.data.id)
          .is("publish_id", null)
          .select("*")
          .maybeSingle();
        if (linked.error) throw linked.error;
        data = linked.data;
      }
    }
  }
  if (!data) return "ignored";
  const job = publicationJobRowSchema.parse(data);
  const status = mapWechatProviderPublicationStatus({
    status: event.publishStatus,
    articleUrl: event.articleUrl ?? null
  });
  if (status === "published" && event.articleUrl) {
    const leased = { ...job, lease_token: crypto.randomUUID() };
    const { data: claimed, error: claimError } = await admin
      .from("wechat_publication_jobs")
      .update({ lease_token: leased.lease_token, lease_expires_at: new Date(Date.now() + 90_000).toISOString() })
      .eq("id", job.id)
      .is("lease_token", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return "duplicate";
    await finalizePublishedJob(admin, leased, {
      id: event.articleId ?? null,
      url: event.articleUrl,
      providerStatus: event.publishStatus
    });
    return "applied";
  }
  const { data: updated, error: updateError } = await admin
    .from("wechat_publication_jobs")
    .update({
      status,
      provider_status: event.publishStatus,
      article_id: event.articleId ?? null,
      article_url: event.articleUrl ?? null,
      error_code: status === "publishing" ? null : `wechat_publish_status_${event.publishStatus}`,
      error_message: status === "publishing" ? null : describeWechatPublicationStatus(status, "zh"),
      next_attempt_at: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .is("lease_token", null)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  return updated ? "applied" : "duplicate";
}

export { publicationJobRowSchema };
