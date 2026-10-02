/**
 * Shared creation path for WeChat Official Account publication jobs.
 *
 * Extracted verbatim from the /api/kits/.../wechat-publications route so the
 * daily content pipeline can create draft_only jobs through the exact same
 * validations (ownership, image rights, optimistic content versioning,
 * connection capability, content readiness, snapshot validation, Jev gate,
 * reapproval reuse, active-job uniqueness) without duplicating them. The
 * route maps these outcomes to bilingual HTTP responses; the pipeline maps
 * them to run-row statuses.
 */
import { z } from "zod";
import { assessContentReadiness } from "@/lib/content-readiness";
import type { KitOutput, VisualAsset } from "@/lib/content-schema";
import { logInfo } from "@/lib/observability";
import { listSocialConnectionsWithAccounts } from "@/lib/social-connections";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  buildWechatPublicationSnapshot,
  deriveWechatPublishingCapability,
  fingerprintWechatPublicationSnapshot,
  validateWechatPublicationSnapshot
} from "@/lib/wechat-publication";
import {
  publicationJobRowSchema,
  type WechatPublicationJobRow
} from "@/lib/wechat-publication-jobs";
import { outputImageSourceSchema, requiresImageRightsConfirmation } from "@/lib/source-image";
import { runWechatJevReview, wechatReviewFindings } from "@/lib/wechat-jev-review";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const outputSchema = z.object({
  id: z.string().uuid(),
  platform: z.literal("wechat"),
  title: z.string(),
  body: z.string(),
  summary: z.string().nullable(),
  cta: z.string(),
  final_body: z.string().nullable(),
  image_url: z.string().nullable(),
  image_source: z.unknown().nullable(),
  updated_at: z.string()
});

const visualAssetSchema = z.object({
  id: z.string().uuid(),
  image_url: z.string().url(),
  alt_text: z.string(),
  asset_type: z.literal("article_illustration"),
  position_index: z.coerce.number().int().nonnegative(),
  source_excerpt: z.string(),
  placement_hint: z.string(),
  visual_role: z.enum(["concept", "process", "comparison", "evidence"]),
  prompt: z.string(),
  revision: z.coerce.number().int().positive(),
  is_current: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

function mapVisualAsset(row: z.infer<typeof visualAssetSchema>): VisualAsset {
  return {
    id: row.id,
    imageUrl: row.image_url,
    altText: row.alt_text,
    assetType: row.asset_type,
    positionIndex: row.position_index,
    sourceExcerpt: row.source_excerpt,
    placementHint: row.placement_hint,
    role: row.visual_role,
    prompt: row.prompt,
    revision: row.revision,
    isCurrent: row.is_current,
    metadata: row.metadata
  };
}

export type WechatPublicationCreateInput = {
  userId: string;
  kitId: string;
  outputId: string;
  accountId: string;
  mode: "draft_only" | "scheduled_publish";
  /** ISO datetime; ignored for draft_only (always "now"). */
  scheduledFor: string;
  /** Must equal kit_outputs.updated_at at call time. */
  contentVersion: string;
  idempotencyKey: string;
  theme: "default" | "grace" | "simple";
  /** Human clicked "publish anyway" past a blocked Jev review. */
  forceAfterJev?: boolean;
  /** Fresh Jev record from an unattended gate; skips the second Jev call. */
  precomputedAutoReview?: Record<string, unknown> | null;
};

export type WechatPublicationCreateFailure = {
  ok: false;
  code:
    | "output_not_found"
    | "image_rights_confirmation_required"
    | "content_version_changed"
    | "connection_not_found"
    | "capability_insufficient"
    | "invalid_schedule"
    | "schedule_too_far"
    | "platform_risk"
    | "snapshot_invalid"
    | "jev_review_blocked"
    | "active_job_exists"
    | "persist_failed";
  message?: string;
  validationCode?: string;
  findings?: string[];
  capability?: ReturnType<typeof deriveWechatPublishingCapability>;
};

export type WechatPublicationCreateResult =
  | { ok: true; job: WechatPublicationJobRow; replayed: boolean }
  | WechatPublicationCreateFailure;

export async function createWechatPublicationJobFromOutput(
  admin: AdminClient,
  input: WechatPublicationCreateInput
): Promise<WechatPublicationCreateResult> {
  const startedAt = Date.now();

  const { data: existingIdempotent, error: idempotentError } = await admin
    .from("wechat_publication_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("connection_account_id", input.accountId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (idempotentError) throw idempotentError;
  if (existingIdempotent) {
    return { ok: true, job: publicationJobRowSchema.parse(existingIdempotent), replayed: true };
  }

  const [{ data: rawOutput, error: outputError }, { data: rawAssets, error: assetsError }, connections] = await Promise.all([
    admin
      .from("kit_outputs")
      .select("id, platform, title, body, summary, cta, final_body, image_url, image_source, updated_at")
      .eq("id", input.outputId)
      .eq("kit_id", input.kitId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    admin
      .from("visual_assets")
      .select("id, image_url, alt_text, asset_type, position_index, source_excerpt, placement_hint, visual_role, prompt, revision, is_current, metadata")
      .eq("output_id", input.outputId)
      .eq("kit_id", input.kitId)
      .eq("user_id", input.userId)
      .eq("is_current", true)
      .order("position_index", { ascending: true }),
    listSocialConnectionsWithAccounts(admin, input.userId)
  ]);
  if (outputError || assetsError) throw outputError ?? assetsError;
  const parsedOutput = outputSchema.safeParse(rawOutput);
  if (!parsedOutput.success) return { ok: false, code: "output_not_found" };
  const outputImageSource = outputImageSourceSchema.safeParse(parsedOutput.data.image_source);
  if (outputImageSource.success && requiresImageRightsConfirmation(outputImageSource.data)) {
    return { ok: false, code: "image_rights_confirmation_required" };
  }
  if (Date.parse(parsedOutput.data.updated_at) !== Date.parse(input.contentVersion)) {
    return { ok: false, code: "content_version_changed" };
  }

  const connection = connections.find((item) => (
    item.connectorId === "wechat"
    && item.status === "connected"
    && item.accounts.some((candidate) => candidate.id === input.accountId)
  ));
  const account = connection?.accounts.find((item) => item.id === input.accountId);
  if (!connection || !account) return { ok: false, code: "connection_not_found" };
  const capability = deriveWechatPublishingCapability({
    grantedScopes: connection.grantedScopes,
    providerMetadata: account.providerMetadata
  });
  if (!capability.canCreateDraft || (input.mode === "scheduled_publish" && !capability.canSubmitPublish)) {
    return { ok: false, code: "capability_insufficient", capability };
  }

  const scheduledFor = input.mode === "draft_only" ? new Date() : new Date(input.scheduledFor);
  if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() - 60_000) {
    return { ok: false, code: "invalid_schedule" };
  }
  if (scheduledFor.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1_000) {
    return { ok: false, code: "schedule_too_far" };
  }

  const visualAssets = z.array(visualAssetSchema).parse(rawAssets ?? []).map(mapVisualAsset);
  const output: Pick<KitOutput, "title" | "body" | "summary" | "finalBody" | "cta" | "imageUrl" | "visualAssets" | "platform"> = {
    platform: "wechat",
    title: parsedOutput.data.title,
    body: parsedOutput.data.body,
    summary: parsedOutput.data.summary ?? undefined,
    finalBody: parsedOutput.data.final_body ?? undefined,
    cta: parsedOutput.data.cta,
    imageUrl: parsedOutput.data.image_url ?? undefined,
    visualAssets
  };
  const readiness = assessContentReadiness(output as KitOutput, "zh");
  if (readiness.publishability.status === "platform-risk") {
    return {
      ok: false,
      code: "platform_risk",
      message: readiness.publishability.summary,
      findings: readiness.publishability.findings
    };
  }
  const snapshot = buildWechatPublicationSnapshot({
    output,
    outputUpdatedAt: parsedOutput.data.updated_at,
    theme: input.theme
  });
  const validation = validateWechatPublicationSnapshot(snapshot);
  if (!validation.ok) {
    return { ok: false, code: "snapshot_invalid", message: validation.message, validationCode: validation.code };
  }
  const fingerprint = await fingerprintWechatPublicationSnapshot(snapshot);
  const now = new Date().toISOString();

  // Jev pre-approval review. A precomputed record from an unattended gate is
  // trusted as-is (it already ran fail-closed). Otherwise: pass stores the
  // audit record; block returns overridable findings; Jev unavailability
  // fails open because a human is explicitly clicking approve right now.
  let autoReviewRecord: Record<string, unknown> | null = null;
  if (input.precomputedAutoReview && input.precomputedAutoReview.decision === "pass") {
    autoReviewRecord = input.precomputedAutoReview;
  } else {
    try {
      const review = await runWechatJevReview(input.userId, {
        title: snapshot.title, summary: snapshot.summary, contentHtml: snapshot.contentHtml
      });
      if (review.decision === "pass") {
        autoReviewRecord = review;
      } else if (!input.forceAfterJev) {
        return {
          ok: false,
          code: "jev_review_blocked",
          findings: wechatReviewFindings(review.reasons)
        };
      } else {
        autoReviewRecord = { ...review, overridden: true };
      }
    } catch (error) {
      logInfo("jev_unavailable", { userId: input.userId }, {
        operation: "wechat_publication_review",
        reason: (error instanceof Error ? error.message : "unknown").slice(0, 200)
      });
    }
  }

  const { data: reapproval } = await admin
    .from("wechat_publication_jobs")
    .select("id")
    .eq("output_id", input.outputId)
    .eq("connection_account_id", input.accountId)
    .eq("user_id", input.userId)
    .eq("status", "needs_reapproval")
    .maybeSingle();
  const row = {
    mode: input.mode,
    status: "scheduled",
    scheduled_for: scheduledFor.toISOString(),
    approved_at: now,
    approved_output_updated_at: parsedOutput.data.updated_at,
    content_fingerprint: fingerprint,
    content_snapshot: snapshot,
    prepared_snapshot: null,
    draft_media_id: null,
    publish_id: null,
    article_id: null,
    article_url: null,
    provider_status: null,
    attempt_count: 0,
    next_attempt_at: scheduledFor.toISOString(),
    lease_token: null,
    lease_expires_at: null,
    error_code: null,
    error_message: null,
    idempotency_key: input.idempotencyKey,
    // Conditional so scheduling still works before the migration is applied.
    ...(autoReviewRecord ? { auto_review: autoReviewRecord } : {}),
    updated_at: now
  };
  const query = reapproval
    ? admin.from("wechat_publication_jobs").update(row).eq("id", reapproval.id).eq("user_id", input.userId)
    : admin.from("wechat_publication_jobs").insert({
        ...row,
        user_id: input.userId,
        kit_id: input.kitId,
        output_id: input.outputId,
        connection_account_id: input.accountId
      });
  const { data: saved, error: saveError } = await query.select("*").single();
  if (saveError) {
    if (/wechat_publication_jobs_one_active_output_idx|duplicate|unique/i.test(saveError.message ?? "")) {
      return { ok: false, code: "active_job_exists" };
    }
    return { ok: false, code: "persist_failed", message: saveError.message ?? undefined };
  }
  const job = publicationJobRowSchema.parse(saved);

  if (input.mode === "scheduled_publish") {
    const { error: planError } = await admin
      .from("kit_outputs")
      .update({ publish_status: "planned" })
      .eq("id", input.outputId)
      .eq("kit_id", input.kitId)
      .eq("user_id", input.userId);
    if (planError) console.error("[wechat-publication] failed to mark output planned:", planError);
  }
  logInfo("wechat_publication_task_accepted", { userId: input.userId }, {
    mode: input.mode,
    source: input.precomputedAutoReview ? "daily_pipeline" : "workbench",
    scheduled_delay_seconds: Math.max(0, Math.round((scheduledFor.getTime() - Date.now()) / 1_000)),
    acceptance_ms: Date.now() - startedAt
  });
  return { ok: true, job, replayed: false };
}
