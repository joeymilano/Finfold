import { z } from "zod";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { logInfo } from "@/lib/observability";
import { readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildXTweetUrl,
  isXRetryableError,
  isXUnauthorizedError,
  postTweet,
  uploadXMedia,
  XApiError
} from "@/lib/x-api";
import { getActiveXPublishingCredentials, type ActiveXCredentials } from "@/lib/x-connections";
import {
  autoReviewRecordSchema,
  describeXPublicationStatus,
  fingerprintXContentSnapshot,
  xContentSnapshotSchema,
  xPublicationStatuses,
  xTweetDraftSchema,
  type AutoReviewRecord,
  type XContentSnapshot,
  type XPublicationStatus,
  type XTweetDraft
} from "@/lib/x-pipeline/content";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const MAX_MEDIA_BYTES = 5_000_000;
const MAX_ATTEMPTS = 4;
const CIRCUIT_BREAKER_THRESHOLD = 3;

// Thrown after a terminal job outcome (e.g. content drift) has already been
// persisted, so dispatch counts the job as failed without writing twice.
class XJobFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XJobFailedError";
  }
}

const postedTweetIdsSchema = z.array(z.string().regex(/^[0-9]{1,32}$/)).max(12);

export const xPublicationJobRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  connection_account_id: z.string().uuid().nullable(),
  kind: z.enum(["post", "thread", "reply"]),
  status: z.enum(xPublicationStatuses),
  scheduled_for: z.string(),
  approved_at: z.string().nullable(),
  content_fingerprint: z.string().length(64),
  content_snapshot: xContentSnapshotSchema,
  // Advisory display field: malformed records degrade to "no badge" rather
  // than failing the whole row parse (which would block dispatch).
  auto_review: autoReviewRecordSchema.nullable().catch(null),
  posted_tweet_ids: z.array(z.string()),
  reply_to_tweet_id: z.string().nullable(),
  tweet_id: z.string().nullable(),
  tweet_url: z.string().url().nullable(),
  attempt_count: z.coerce.number().int().nonnegative(),
  next_attempt_at: z.string(),
  lease_token: z.string().uuid().nullable(),
  lease_expires_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  idempotency_key: z.string().uuid(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export type XPublicationJobRow = z.infer<typeof xPublicationJobRowSchema>;

export type PublicXPublicationJob = {
  id: string;
  kind: XContentSnapshot["kind"];
  status: XPublicationStatus;
  statusLabel: string;
  scheduledFor: string;
  approvedAt: string | null;
  autoReview: AutoReviewRecord | null;
  snapshot: XContentSnapshot;
  tweetUrl: string | null;
  error: string | null;
  canApprove: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
};

export type XPublicationDispatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
};

export function toPublicXPublicationJob(value: unknown): PublicXPublicationJob {
  const row = xPublicationJobRowSchema.parse(value);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    statusLabel: describeXPublicationStatus(row.status),
    scheduledFor: row.scheduled_for,
    approvedAt: row.approved_at,
    autoReview: row.auto_review,
    snapshot: row.content_snapshot,
    tweetUrl: row.tweet_url,
    error: row.error_message,
    canApprove: row.status === "needs_approval",
    canCancel: row.status === "needs_approval" || row.status === "scheduled",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function updateClaimedJob(
  admin: AdminClient,
  job: XPublicationJobRow,
  patch: Record<string, unknown>
): Promise<void> {
  if (!job.lease_token) throw new Error("The publication job lease is missing.");
  const { data, error } = await admin
    .from("x_publication_jobs")
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
  job: XPublicationJobRow,
  code: string,
  message: string
): Promise<void> {
  await updateClaimedJob(admin, job, {
    status: "failed",
    error_code: code,
    error_message: message.slice(0, 1_000),
    lease_token: null,
    lease_expires_at: null
  });
}

async function retryClaimedJob(
  admin: AdminClient,
  job: XPublicationJobRow,
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

async function downloadXMedia(
  url: string,
  auditPurpose: string
): Promise<{ bytes: Uint8Array; contentType: "image/jpeg" | "image/png" | "image/webp" }> {
  const response = await safeExternalFetch(url, {
    headers: { Accept: "image/jpeg,image/png,image/webp" },
    cache: "no-store"
  }, {
    timeoutMs: 20_000,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    auditPurpose
  });
  if (!response.ok) throw new Error(`Could not download the post image (${response.status}).`);
  const bytes = await readBytesWithLimit(response, MAX_MEDIA_BYTES);
  const inspection = inspectMediaUploadBytes(bytes);
  if (!inspection.ok) throw new Error("The post image is not a valid static image file.");
  const contentType = inspection.contentType;
  if (
    contentType !== "image/jpeg"
    && contentType !== "image/png"
    && contentType !== "image/webp"
  ) {
    throw new Error("X posts support JPEG, PNG, and WebP images only.");
  }
  return { bytes, contentType };
}

async function processClaimedJob(
  admin: AdminClient,
  job: XPublicationJobRow,
  providerFetch: FetchLike
): Promise<void> {
  const fingerprint = await fingerprintXContentSnapshot(job.content_snapshot);
  if (fingerprint !== job.content_fingerprint) {
    await failClaimedJob(
      admin,
      job,
      "content_fingerprint_mismatch",
      "内容快照与审核指纹不一致，已停止发布。"
    );
    throw new XJobFailedError("The approved content fingerprint no longer matches the snapshot.");
  }

  const posted = postedTweetIdsSchema.parse(job.posted_tweet_ids ?? []);
  const tweets = job.content_snapshot.tweets;
  if (posted.length >= tweets.length) {
    // A crash between the final tweet post and finalization — settle now
    // instead of reposting the thread.
    const rootId = posted[0];
    await updateClaimedJob(admin, job, {
      status: "published",
      tweet_id: rootId,
      tweet_url: buildXTweetUrl(rootId),
      published_at: job.published_at ?? new Date().toISOString(),
      error_code: null,
      error_message: null,
      lease_token: null,
      lease_expires_at: null
    });
    return;
  }

  let active: ActiveXCredentials = await getActiveXPublishingCredentials(
    admin,
    job.user_id,
    false,
    providerFetch
  );
  const callWithTokenRefresh = async <T>(operation: (accessToken: string) => Promise<T>): Promise<T> => {
    try {
      return await operation(active.accessToken);
    } catch (error) {
      if (!isXUnauthorizedError(error)) throw error;
      active = await getActiveXPublishingCredentials(admin, job.user_id, true, providerFetch);
      return operation(active.accessToken);
    }
  };

  if (job.status === "scheduled") {
    await updateClaimedJob(admin, job, { status: "publishing", error_code: null, error_message: null });
  }

  const progress = [...posted];
  for (let index = progress.length; index < tweets.length; index += 1) {
    const tweet = tweets[index];
    let mediaIds: string[] | undefined;
    if (tweet.mediaUrl) {
      const media = await downloadXMedia(tweet.mediaUrl, "x_publication_asset");
      const uploaded = await callWithTokenRefresh((accessToken) => (
        uploadXMedia(accessToken, media, providerFetch)
      ));
      mediaIds = [uploaded.mediaId];
    }
    const replyToTweetId = job.content_snapshot.kind === "reply"
      ? job.content_snapshot.replyToTweetId
      : index > 0
        ? progress[index - 1]
        : null;
    const created = await callWithTokenRefresh((accessToken) => (
      postTweet(accessToken, {
        text: tweet.text,
        replyToTweetId,
        quoteTweetId: job.content_snapshot.quoteTweetId,
        mediaIds
      }, providerFetch)
    ));
    progress.push(created.id);
    await updateClaimedJob(admin, job, {
      posted_tweet_ids: progress,
      tweet_id: progress[0],
      tweet_url: buildXTweetUrl(progress[0])
    });
  }

  const publishedAt = new Date().toISOString();
  await updateClaimedJob(admin, job, {
    status: "published",
    published_at: publishedAt,
    error_code: null,
    error_message: null,
    lease_token: null,
    lease_expires_at: null
  });
  logInfo("x_publication_published", { userId: job.user_id }, {
    kind: job.kind,
    tweets: progress.length,
    attempts: job.attempt_count,
    approval_to_publish_ms: job.approved_at
      ? Math.max(0, Date.now() - Date.parse(job.approved_at))
      : null
  });
}

/**
 * Trip-after-3 breaker: consecutive failed jobs pause the whole user pipeline
 * (generation and engagement runs skip paused users) until the owner clears
 * the switch in the review console. A single success resets the streak.
 */
async function applyCircuitBreaker(
  admin: AdminClient,
  perUser: Map<string, { succeeded: number; failed: number }>
): Promise<void> {
  for (const [userId, outcome] of perUser) {
    if (outcome.failed === 0 && outcome.succeeded === 0) continue;
    try {
      const { data: row } = await admin
        .from("x_pipeline_settings")
        .select("consecutive_failures, paused")
        .eq("user_id", userId)
        .maybeSingle();
      const nextStreak = outcome.succeeded > 0
        ? 0
        : Math.max(0, (row?.consecutive_failures ?? 0)) + outcome.failed;
      const shouldPause = !row?.paused && nextStreak >= CIRCUIT_BREAKER_THRESHOLD;
      await admin
        .from("x_pipeline_settings")
        .upsert({
          user_id: userId,
          consecutive_failures: nextStreak,
          ...(shouldPause ? { paused: true, paused_reason: "circuit_breaker" } : {}),
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      if (shouldPause) {
        logInfo("x_pipeline_circuit_breaker_tripped", { userId }, { failures: nextStreak });
      }
    } catch (error) {
      console.error("[x-publication] failed to apply circuit breaker:", error);
    }
  }
}

export async function dispatchXPublicationJobs(
  admin: AdminClient,
  input: { limit?: number; providerFetch?: FetchLike } = {}
): Promise<XPublicationDispatchResult> {
  const { data, error } = await admin.rpc("claim_due_x_publication_jobs", {
    p_limit: Math.min(Math.max(input.limit ?? 10, 1), 25),
    p_lease_seconds: 90
  });
  if (error) throw error;
  const jobs = z.array(xPublicationJobRowSchema).parse(data ?? []);
  let succeeded = 0;
  let failed = 0;
  const perUser = new Map<string, { succeeded: number; failed: number }>();
  const track = (userId: string, outcome: "succeeded" | "failed"): void => {
    const current = perUser.get(userId) ?? { succeeded: 0, failed: 0 };
    current[outcome] += 1;
    perUser.set(userId, current);
  };
  for (const job of jobs) {
    try {
      await processClaimedJob(admin, job, input.providerFetch ?? fetch);
      succeeded += 1;
      track(job.user_id, "succeeded");
    } catch (error) {
      failed += 1;
      track(job.user_id, "failed");
      if (error instanceof XJobFailedError) continue;
      const message = error instanceof Error ? error.message : "X publication processing failed.";
      try {
        // 4xx provider rejections (invalid text, duplicate content, revoked
        // app) never succeed on retry; transport and rate-limit errors do.
        const providerRetryable = isXRetryableError(error);
        if (providerRetryable && job.attempt_count < MAX_ATTEMPTS) {
          await retryClaimedJob(admin, job, message);
        } else {
          await failClaimedJob(
            admin,
            job,
            error instanceof XApiError ? `x_api_${error.status}` : "processing_failed",
            message
          );
        }
      } catch (persistError) {
        console.error("[x-publication] failed to persist job failure:", persistError);
      }
    }
  }
  await applyCircuitBreaker(admin, perUser);
  return { claimed: jobs.length, succeeded, failed };
}

export type CreateXPublicationJobInput = {
  userId: string;
  snapshot: XContentSnapshot;
  scheduledFor: string;
  initialStatus: "needs_approval" | "scheduled";
  connectionAccountId?: string | null;
  idempotencyKey?: string;
};

export async function createXPublicationJob(
  admin: AdminClient,
  input: CreateXPublicationJobInput
): Promise<{ ok: true; id: string } | { ok: false; reason: "duplicate" }> {
  const snapshot = xContentSnapshotSchema.parse(input.snapshot);
  const contentFingerprint = await fingerprintXContentSnapshot(snapshot);
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await admin
    .from("x_publication_jobs")
    .insert({
      user_id: input.userId,
      connection_account_id: input.connectionAccountId ?? null,
      kind: snapshot.kind,
      status: input.initialStatus,
      scheduled_for: input.scheduledFor,
      approved_at: input.initialStatus === "scheduled" ? new Date().toISOString() : null,
      content_fingerprint: contentFingerprint,
      content_snapshot: snapshot,
      reply_to_tweet_id: snapshot.replyToTweetId,
      idempotency_key: idempotencyKey
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? "")) return { ok: false, reason: "duplicate" };
    throw error;
  }
  return { ok: true, id: data.id };
}

export async function approveXPublicationJob(
  admin: AdminClient,
  userId: string,
  jobId: string,
  input: { revisedTweets?: XTweetDraft[]; scheduledFor?: string } = {}
): Promise<PublicXPublicationJob | null> {
  const { data: job, error } = await admin
    .from("x_publication_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!job) return null;
  const row = xPublicationJobRowSchema.parse(job);
  if (row.status !== "needs_approval") return null;

  const snapshot: XContentSnapshot = input.revisedTweets
    ? xContentSnapshotSchema.parse({ ...row.content_snapshot, tweets: input.revisedTweets })
    : row.content_snapshot;
  const revisedTweets = z.array(xTweetDraftSchema).min(1).parse(snapshot.tweets);
  const contentFingerprint = await fingerprintXContentSnapshot(snapshot);
  const approvedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("x_publication_jobs")
    .update({
      status: "scheduled",
      approved_at: approvedAt,
      content_snapshot: { ...snapshot, tweets: revisedTweets },
      content_fingerprint: contentFingerprint,
      scheduled_for: input.scheduledFor ?? row.scheduled_for,
      error_code: null,
      error_message: null,
      updated_at: approvedAt
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .eq("status", "needs_approval")
    .select("*")
    .single();
  if (updateError) throw updateError;
  return toPublicXPublicationJob(updated);
}

export async function closeXPublicationJob(
  admin: AdminClient,
  userId: string,
  jobId: string,
  outcome: "cancelled" | "rejected"
): Promise<boolean> {
  const { data, error } = await admin
    .from("x_publication_jobs")
    .update({
      status: outcome,
      error_code: outcome === "rejected" ? "rejected_by_user" : "cancelled_by_user",
      lease_token: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["needs_approval", "scheduled"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listXPublicationJobs(
  admin: AdminClient,
  userId: string,
  input: { statuses?: readonly XPublicationStatus[]; limit?: number } = {}
): Promise<PublicXPublicationJob[]> {
  let query = admin
    .from("x_publication_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
  if (input.statuses?.length) {
    query = query.in("status", [...input.statuses]);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPublicXPublicationJob);
}
