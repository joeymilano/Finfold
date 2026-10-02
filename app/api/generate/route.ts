import { capturePersistedGenerationOutcome } from "@/lib/generation-analytics";
import { normalizeGenerationAnalytics, type GenerationAnalyticsContext } from "@/lib/generation-analytics-context";

import { z } from "zod";
import { generateRequestSchema, type ContentKit } from "@/lib/content-schema";
import { getTerminalGenerationAllowance } from "@/lib/generation-allowance";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { contentInputFingerprint } from "@/lib/content-fingerprint";
import { buildTextFreeVisualPrompt, coverImageSizeForPlatform, generateImage, isImageGenConfigured } from "@/lib/image-gen";
import { persistGeneratedImageForDelivery } from "@/lib/image-persistence";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { getActiveSubscription, getPlanModelTier, getPlanPlatformLimit, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, PLAN_CREDITS, computeKitCost, ensurePlanCredits, getAvailableCredits, refundCredits, reserveCredits, type ModelTier, type PlanId } from "@/lib/payment";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId, hasSupabaseConfig } from "@/lib/supabase";
import { createLettaAgent, getLettaAgent, isLettaConfigured } from "@/lib/letta";
import { encodeSSE, SSE_HEADERS } from "@/lib/sse";
import { applyFlywheelExperiment } from "@/lib/flywheel-experiment";
import { industryPackIdSchema, type IndustryPackId } from "@/lib/industry-rules/types";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { completeReferralForKit } from "@/lib/referrals";
import { getGrowthMission, type GrowthMission } from "@/lib/agent/growth-missions";
import {
  buildResearchGenerationContext,
  type ResearchGenerationContext
} from "@/lib/operations/research";
import { loadOwnedResearchMission } from "@/lib/operations/research-store";
import { loadXhsGenerationContext } from "@/lib/agent/xhs-workflow";
import {
  resolvePrivateAttachmentEvidence,
  type ResolvedAttachmentEvidence
} from "@/lib/agent/attachment-content";
import {
  attachAgentContentWorkflowGenerationRun,
  claimAgentContentWorkflowGeneration,
  loadAgentContentWorkflowGenerationContext,
  releaseAgentContentWorkflowGeneration
} from "@/lib/agent/content-workflow";
import {
  logError,
  logInfo,
  logWarn,
  resolveRequestId,
  type TelemetryContext
} from "@/lib/observability";
import {
  advanceGenerationRun,
  assertGenerationRunLease,
  claimGenerationRun,
  classifyGenerationFailure,
  completeGenerationRun,
  failGenerationRun,
  GenerationRunError,
  hashGenerationRequest,
  reserveGenerationRunCredits,
  resolveGenerationRequestId,
  toPublicGenerationRun,
  type GenerationRunRecord,
  type GenerationRunStep
} from "@/lib/generation-runs";
import {
  claimGenerationJob,
  createQueuedGenerationRun,
  finishGenerationJob,
  heartbeatGenerationJob,
  publishGenerationJob,
  recordGenerationAttemptModel,
  retryGenerationJob,
  type GenerationJobRecord
} from "@/lib/generation-jobs";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { isOwnedCachedSourceImage, type OutputImageSource } from "@/lib/source-image";
import {
  applyStagingPartialPlatformFailure,
  generationJobLeaseSecondsForFaultMode,
  getStagingGenerationFaultMode,
  injectStagingConsumerInterruptionAfterClaim,
  injectStagingFaultBeforeProvider,
  StagingConsumerInterruption,
  type StagingGenerationFaultMode
} from "@/lib/staging-fault-injection";

/**
 * Streams the kit as Server-Sent Events instead of buffering the whole
 * response: each platform's text arrives as soon as it's generated (Letta
 * batches 2 platforms per request — see lib/llm.ts), and a final "done" event carries the
 * persisted kit + allowance. Trial/local-mock generation still streams
 * foreground output. Authenticated
 * production requests create a durable job and return after Queue publication;
 * the same route is invoked by the private Queue consumer to execute the job.
 */
export async function POST(request: Request) {
  const httpRequestId = resolveRequestId(request.headers.get("x-request-id"));
  const requestStartedAt = Date.now();
  // Tracks an in-flight credit reservation so the catch block can refund it
  // if generation fails after billing (§10.3 — failure must never cost credits).
  let analyticsContext: GenerationAnalyticsContext | undefined;
  let reservation: { userId: string; cost: number } | null = null;
  let creditsRefunded = false;
  let generationRequestId: string | null = null;
  let telemetryUserId: string | null = null;
  let runContext: {
    admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
    run: GenerationRunRecord;
  } | null = null;
  let jobContext: {
    job: GenerationJobRecord;
    leaseToken: string;
    queueAttempt: number;
  } | null = null;
  let stagingFaultMode: StagingGenerationFaultMode | null = null;
  const internalExecution =
    request.headers.has("x-finfold-queue-attempt");
  const telemetryContext = (): TelemetryContext => ({
    requestId: generationRequestId ?? httpRequestId,
    traceId: runContext?.run.trace_id ?? httpRequestId,
    generationRunId: runContext?.run.id ?? null,
    userId: telemetryUserId
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: string, data: unknown) {
        if (internalExecution && event !== "worker") return;
        controller.enqueue(encodeSSE(event, data));
      }

      let agentContentWorkflowGeneration: {
        workflowId: string;
        requestId: string;
        userId: string;
        admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
      } | null = null;
      let topicOpportunityId: string | null = null;
      try {
        const persistenceAdmin = createSupabaseAdminClient();
        let userId: string;
        let input: z.infer<typeof generateRequestSchema>;
        let requestId: string;
        let growthMission: GrowthMission | null = null;
        let intelligenceContext: ResearchGenerationContext | null = null;
        let xhsWorkflowContext: Awaited<ReturnType<typeof loadXhsGenerationContext>> | null = null;
        let attachmentEvidence: ResolvedAttachmentEvidence | null = null;

        if (internalExecution) {
          if (!(await verifyInternalWorkerRequest(request))) {
            emit("worker", {
              status: "failed",
              retryable: false,
              error: "Forbidden internal generation request."
            });
            return;
          }
          if (!persistenceAdmin) {
            emit("worker", {
              status: "retry",
              retryable: true,
              error: "Generation persistence is unavailable."
            });
            return;
          }
          stagingFaultMode = getStagingGenerationFaultMode();
          const claim = await claimGenerationJob(
            persistenceAdmin,
            await request.json(),
            {
              leaseSeconds: generationJobLeaseSecondsForFaultMode(
                stagingFaultMode
              )
            }
          );
          if (claim.outcome !== "claimed") {
            if (claim.outcome === "reconciled") {
              // A prior invocation already persisted this run's content kit
              // and died before the terminal write. claim_generation_job
              // finalized it as succeeded instead of re-running (and
              // re-billing) generation — nothing left to do here.
              emit("worker", {
                status: "succeeded",
                retryable: false,
                contentKitId: claim.contentKitId
              });
            } else if (claim.outcome === "terminal") {
              emit("worker", {
                status: "terminal",
                terminalStatus: claim.status,
                retryable: false
              });
            } else {
              emit("worker", {
                status: claim.outcome === "busy" ? "busy" : "terminal",
                retryable: false
              });
            }
            return;
          }

          userId = claim.run.user_id;
          input = {
            ...generateRequestSchema.parse(claim.job.payload),
            intelligenceContext: undefined
          };
          analyticsContext = normalizeGenerationAnalytics(input.analytics);
          requestId = claim.run.request_id;
          runContext = { admin: persistenceAdmin, run: claim.run };
          jobContext = {
            job: claim.job,
            leaseToken: claim.leaseToken,
            // Database attempts survive outbox republishing, whereas a new
            // Cloudflare Queue message starts its delivery counter at one.
            // Retry exhaustion must therefore use the durable attempt number.
            queueAttempt: claim.attemptNumber
          };
          // This fault must happen before the first heartbeat extends the
          // deliberately short staging lease back to the normal 15 minutes.
          injectStagingConsumerInterruptionAfterClaim(
            stagingFaultMode,
            jobContext.queueAttempt
          );
          if (
            stagingFaultMode === "consumer_interruption_once" &&
            jobContext.queueAttempt > 1
          ) {
            // The recovery claim starts with the same five-second test lease.
            // Extend it immediately so a healthy provider call on attempt 2
            // uses the normal production-length lease.
            await heartbeatGenerationJob(persistenceAdmin, {
              jobId: jobContext.job.id,
              runId: claim.run.id,
              leaseToken: jobContext.leaseToken,
              step: claim.run.current_step
            });
          }
        } else {
          userId = await getCurrentUserId();
          input = {
            ...generateRequestSchema.parse(await request.json()),
            intelligenceContext: undefined
          };
          analyticsContext = normalizeGenerationAnalytics(input.analytics);
          requestId = resolveGenerationRequestId(
            request.headers.get("Idempotency-Key")
          );

          if (input.agentContentWorkflowId) {
            if (!persistenceAdmin) {
              throw new GenerationRunError({
                code: "invalid_context",
                message: "Agent content workflow validation is unavailable in this environment.",
                retryable: true
              });
            }
            const workflowContext = await claimAgentContentWorkflowGeneration(
              persistenceAdmin,
              userId,
              input.agentContentWorkflowId,
              requestId
            );
            input = generateRequestSchema.parse(workflowContext.generationRequest);
            agentContentWorkflowGeneration = {
              workflowId: workflowContext.workflow.id,
              requestId,
              userId,
              admin: persistenceAdmin
            };
          }

          // ---- Content dedup pre-check -------------------------------------
          // Before committing to a (chargeable) generation, check whether this
          // user already generated the exact same configuration. We only emit
          // a soft "duplicate" event — the client decides whether to open the
          // existing kit or force a fresh generation (x-finfold-force-regenerate
          // header). Skipped for internal queue workers and Agent-driven
          // workflows, which carry their own idempotency. The lookup is
          // fail-safe: if the input_fingerprint column is missing (migration
          // not yet applied) the query resolves to null and generation simply
          // proceeds, so a deploy ordering mistake can never block generation.
          const isServerDrivenGeneration =
            internalExecution || !!input.agentContentWorkflowId;
          const forceRegenerate =
            request.headers.get("x-finfold-force-regenerate") === "1";
          if (persistenceAdmin && !isServerDrivenGeneration && !forceRegenerate) {
            const duplicateFingerprint = await contentInputFingerprint({
              ideaText: input.ideaText,
              goal: input.goal,
              persona: input.persona,
              platforms: input.platforms,
              language: input.language,
              researchMissionId: input.researchMissionId,
              sourceTopicOpportunityId: input.sourceTopicOpportunityId,
              sourceAttachmentIds: (input.sourceAttachments ?? []).map((attachment) => attachment.id)
            });
            const { data: existingKit } = await persistenceAdmin
              .from("content_kits")
              .select("id, created_at, persona, platforms")
              .eq("user_id", userId)
              .eq("input_fingerprint", duplicateFingerprint)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existingKit) {
              logInfo("generation_duplicate_detected", telemetryContext(), {
                existing_kit_id: existingKit.id,
                platform_count: input.platforms.length
              });
              emit("duplicate", {
                contentKitId: existingKit.id,
                createdAt: existingKit.created_at,
                persona: existingKit.persona,
                platforms: existingKit.platforms
              });
              return;
            }
          }

          if (
            persistenceAdmin &&
            process.env.GENERATION_EXECUTION_MODE === "queue"
          ) {
            const claim = await createQueuedGenerationRun(persistenceAdmin, {
              userId,
              requestId,
              requestFingerprint: await hashGenerationRequest(input),
              platformCount: input.platforms.length,
              payload: input
            });

            emit("run", {
              run: toPublicGenerationRun(claim.run),
              durable: true
            });
            if (claim.outcome !== "claimed") {
              const conflict = claim.outcome === "conflict";
              emit("error", {
                error: conflict
                  ? "This idempotency key was already used for different generation input."
                  : claim.run.status === "succeeded" || claim.run.status === "partial_success"
                    ? "This generation request already completed. Open the saved content kit instead of charging it again."
                    : "This generation request is already being processed or has already finished.",
                code: conflict
                  ? "idempotency_conflict"
                  : "duplicate_request",
                generationRunId: claim.run.id,
                contentKitId: claim.run.content_kit_id,
                retryable: false
              });
              return;
            }
            if (!claim.job) {
              throw new Error("Generation outbox row was not created.");
            }
            if (agentContentWorkflowGeneration) {
              await attachAgentContentWorkflowGenerationRun(
                persistenceAdmin,
                userId,
                agentContentWorkflowGeneration.workflowId,
                agentContentWorkflowGeneration.requestId,
                claim.run.id
              );
            }

            let dispatchDelayed = false;
            try {
              await publishGenerationJob(persistenceAdmin, claim.job);
            } catch (publishError) {
              dispatchDelayed = true;
              logWarn("generation_queue_publish_delayed", {
                requestId,
                traceId: claim.run.trace_id,
                generationRunId: claim.run.id,
                userId
              }, {
                http_request_id: httpRequestId,
                error:
                  publishError instanceof Error
                    ? publishError.message
                    : String(publishError)
              });
            }
            emit("queued", {
              generationRunId: claim.run.id,
              dispatchDelayed
            });
            return;
          }

          if (persistenceAdmin) {
            const claim = await claimGenerationRun(persistenceAdmin, {
              userId,
              requestId,
              requestFingerprint: await hashGenerationRequest(input),
              platformCount: input.platforms.length
            });

            if (claim.outcome !== "claimed") {
              const conflict = claim.outcome === "conflict";
              logWarn("generation_duplicate_request", {
                requestId,
                traceId: claim.run.trace_id,
                generationRunId: claim.run.id,
                userId
              }, {
                http_request_id: httpRequestId,
                outcome: claim.outcome,
                status: claim.run.status,
                latency_ms: Date.now() - requestStartedAt
              });
              emit("run", {
                run: toPublicGenerationRun(claim.run),
                durable: true
              });
              emit("error", {
                error: conflict
                  ? "This idempotency key was already used for different generation input."
                  : claim.run.status === "succeeded" || claim.run.status === "partial_success"
                    ? "This generation request already completed. Open the saved content kit instead of charging it again."
                    : "This generation request is already being processed or has already finished.",
                code: conflict ? "idempotency_conflict" : "duplicate_request",
                generationRunId: claim.run.id,
                contentKitId: claim.run.content_kit_id,
                retryable: false
              });
              return;
            }

            runContext = { admin: persistenceAdmin, run: claim.run };
            if (agentContentWorkflowGeneration) {
              await attachAgentContentWorkflowGenerationRun(
                persistenceAdmin,
                userId,
                agentContentWorkflowGeneration.workflowId,
                agentContentWorkflowGeneration.requestId,
                claim.run.id
              );
            }
            emit("run", {
              run: toPublicGenerationRun(claim.run),
              durable: true
            });
          } else if (isLocalMockMode()) {
            emit("run", {
              run: {
                id: crypto.randomUUID(),
                requestId,
                traceId: crypto.randomUUID(),
                status: "running",
                currentStep: "validate_request"
              },
              durable: false
            });
          }
        }

        generationRequestId = requestId;
        telemetryUserId = userId;
        topicOpportunityId = input.sourceTopicOpportunityId ?? null;

        async function advanceDurableStep(
          step: GenerationRunStep,
          details?: { modelTier?: ModelTier; creditCost?: number }
        ) {
          if (!runContext) return;
          await advanceGenerationRun(runContext.admin, {
            runId: runContext.run.id,
            userId,
            leaseToken: runContext.run.lease_token,
            step,
            modelTier: details?.modelTier,
            creditCost: details?.creditCost
          });
          if (jobContext) {
            await heartbeatGenerationJob(runContext.admin, {
              jobId: jobContext.job.id,
              runId: runContext.run.id,
              leaseToken: jobContext.leaseToken,
              step
            });
          }
        }

        if (input.growthMissionId) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Growth Mission validation is unavailable in this environment.",
              retryable: true
            });
          }
          growthMission = await getGrowthMission(
            persistenceAdmin,
            userId,
            input.growthMissionId
          );
          if (!growthMission || !["accepted", "draft_ready"].includes(growthMission.status)) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "This Growth Mission is no longer active. Return to the Agent and start a new mission.",
              retryable: false
            });
          }
        }
        if (input.researchMissionId) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Research Mission validation is unavailable in this environment.",
              retryable: true
            });
          }
          const researchMission = await loadOwnedResearchMission(
            persistenceAdmin,
            userId,
            input.researchMissionId
          );
          if (!researchMission) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "This Research Mission was not found or is not available to this workspace.",
              retryable: false
            });
          }
          if (researchMission.status !== "ready" || !researchMission.decision) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Finish the Research decision before using it in Workbench.",
              retryable: false
            });
          }
          intelligenceContext = buildResearchGenerationContext(researchMission);
        }
        if (input.sourceTopicOpportunityId) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Topic Opportunity validation is unavailable in this environment.",
              retryable: true
            });
          }
          const { data: opportunity, error: opportunityError } = await persistenceAdmin
            .from("topic_opportunities")
            .select("id,state,preparation_status")
            .eq("id", input.sourceTopicOpportunityId)
            .eq("user_id", userId)
            .maybeSingle();
          if (opportunityError) throw opportunityError;
          if (!opportunity || opportunity.state !== "active" || !["confirmed", "generating", "ready"].includes(String(opportunity.preparation_status))) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "This Topic Opportunity was not confirmed or is no longer active.",
              retryable: false
            });
          }
          const { error: markGeneratingError } = await persistenceAdmin
            .from("topic_opportunities")
            .update({ preparation_status: "generating", updated_at: new Date().toISOString() })
            .eq("id", input.sourceTopicOpportunityId)
            .eq("user_id", userId)
            .neq("preparation_status", "ready");
          if (markGeneratingError) throw markGeneratingError;
        }
        if (input.xhsWorkflowId) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Xiaohongshu workflow validation is unavailable in this environment.",
              retryable: true
            });
          }
          xhsWorkflowContext = await loadXhsGenerationContext(
            persistenceAdmin,
            userId,
            input.xhsWorkflowId,
            input.artifactVersionIds ?? []
          );
        }
        if (input.agentContentWorkflowId) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Agent content workflow validation is unavailable in this environment.",
              retryable: true
            });
          }
          const workflowContext = await loadAgentContentWorkflowGenerationContext(
            persistenceAdmin,
            userId,
            input.agentContentWorkflowId,
            {
              requestId,
              runId: runContext?.run.id
            }
          );
          // The durable workflow is the source of truth after confirmation.
          // Do not let browser-supplied fields drift from the approved request.
          input = generateRequestSchema.parse(workflowContext.generationRequest);
          agentContentWorkflowGeneration = {
            workflowId: workflowContext.workflow.id,
            requestId,
            userId,
            admin: persistenceAdmin
          };
        }

        const { limit, plan, platformLimit, modelTier } = await getPlanLimit(userId);
        logInfo("generation_started", telemetryContext(), {
          http_request_id: httpRequestId,
          plan,
          model_tier: modelTier,
          platform_count: input.platforms.length,
          has_media: input.mediaAssets.length > 0 || (input.sourceAttachments ?? []).some(
            (attachment) => attachment.kind === "image" || attachment.kind === "video"
          ),
          source_attachment_count: input.sourceAttachments?.length ?? 0,
          has_research_intelligence: Boolean(intelligenceContext)
        });

        if (input.platforms.length > platformLimit) {
          throw new GenerationRunError({
            code: "plan_limit",
            message: `你当前的套餐最多支持 ${platformLimit} 个平台，升级可解锁更多。(Your plan supports up to ${platformLimit} platforms — upgrade to unlock more.)`,
            retryable: false
          });
        }

        if ((input.sourceAttachments?.length ?? 0) > 0) {
          if (!persistenceAdmin) {
            throw new GenerationRunError({
              code: "invalid_context",
              message: "Private source-file analysis is unavailable in this environment.",
              retryable: true
            });
          }
          attachmentEvidence = await resolvePrivateAttachmentEvidence(
            persistenceAdmin,
            userId,
            input.sourceAttachments ?? []
          );
          if (attachmentEvidence.usableCount === 0) {
            const details = attachmentEvidence.extractions
              .map((item) => `${item.attachment.name}: ${item.detail ?? "unreadable"}`)
              .join("; ");
            throw new GenerationRunError({
              code: "invalid_context",
              message: `Finfold could not read the attached source files. ${details}`.slice(0, 800),
              retryable: false
            });
          }
          if (input.ideaText.trim().length < 20) {
            input = {
              ...input,
              ideaText: defaultAttachmentBrief((input.sourceAttachments ?? []).map((attachment) => attachment.name))
            };
          }
        }

        // standardImage (8 credits/platform) costs more than the entire
        // multi-platform text kit itself (contentKitBase 15 + perPlatformCopy
        // 3 × extra platforms). Free's allowance was sized for one full text
        // proof cycle (see PLAN_CREDITS.free), not per-platform AI images —
        // enforced server-side since the client toggle is not trustworthy.
        if (plan === "free") {
          input = {
            ...input,
            withImage: false,
            visualMode: input.visualMode === "ai_generate" ? "none" : input.visualMode
          };
        }
        if (
          input.visualMode === "source_first"
          && input.visualSource
          && !(await isOwnedCachedSourceImage(input.visualSource, userId))
        ) {
          throw new GenerationRunError({
            code: "invalid_context",
            message: "The selected visual is not a user-owned Finfold source image. Choose it again from Smart Visual.",
            retryable: false
          });
        }
        if (input.withImage && input.visualMode === undefined) {
          logInfo("with_image_deprecated", telemetryContext(), { caller: "legacy_api" });
        }

        // Credits model: make sure this cycle's plan allowance exists, then
        // reserve EXACTLY what this generation will cost (contentKitBase + a
        // per-platform fee), not a flat "1 kit". A null return means the
        // balance is insufficient — nothing is deducted.
        await ensurePlanCredits(userId, plan);
        const cost = computeKitCost(input.platforms.length);
        await advanceDurableStep("reserve_credits", { modelTier, creditCost: cost });
        const creditDetail = {
          platforms: input.platforms.length,
          generationRunId: runContext?.run.id ?? null,
          requestId
        };
        const reserved = runContext?.run.credits_reserved
          ? await getAvailableCredits(userId)
          : runContext
            ? await reserveGenerationRunCredits(runContext.admin, {
                runId: runContext.run.id,
                userId,
                leaseToken: runContext.run.lease_token,
                amount: cost,
                action: "contentKitBase",
                source: "workbench",
                detail: creditDetail
              })
            : await reserveCredits(
                userId,
                cost,
                "contentKitBase",
                "workbench",
                creditDetail
              );
        if (reserved === null) {
          throw new GenerationRunError({
            code: "insufficient_credits",
            message: "本月创作点数已用完 · 升级或购买补充包继续 — Out of AI Credits for this cycle. Upgrade or top up to keep generating.",
            retryable: false
          });
        }
        reservation = { userId, cost };

        await advanceDurableStep("moderate_input");
        const moderation = moderateInput(
          attachmentEvidence?.context
            ? `${input.ideaText}\n\n${attachmentEvidence.context}`
            : input.ideaText
        );
        if (moderation.flagged) {
          throw new GenerationRunError({
            code: "moderation_rejected",
            message: moderation.reason,
            retryable: false
          });
        }

        await advanceDurableStep("load_context");
        const lettaAgentId = await resolveLettaAgentId(userId);

        // Best-effort: inject this user's own high-performing past posts as
        // few-shot examples and record which experiment bucket this kit
        // landed in, so a later readout can compare treatment vs. control
        // engagement. Falls open to the original `input` on any failure.
        const perfAdmin = persistenceAdmin;
        const experiment = perfAdmin
          ? await applyFlywheelExperiment(perfAdmin, userId, input)
          : { input, bucket: null as null, meta: null as null };

        // Resolve the user's enabled industry compliance packs server-side
        // (never trust client-sent pack ids) — same server-populated-only
        // pattern as perfExamples above. See lib/industry-rules/.
        const industryPackIds = perfAdmin ? await resolveEnabledIndustryPacks(perfAdmin, userId) : [];
        const generationInput = {
          ...experiment.input,
          ideaText: attachmentEvidence?.context
            ? `${experiment.input.ideaText}\n\n${attachmentEvidence.context}`
            : experiment.input.ideaText,
          mediaAssets: attachmentEvidence
            ? [...experiment.input.mediaAssets, ...attachmentEvidence.mediaAssets].filter(
                (asset, index, all) => all.findIndex((candidate) => candidate.id === asset.id) === index
              )
            : experiment.input.mediaAssets,
          industryPackIds,
          experimentContext: growthMission
            ? {
                platform: growthMission.platform,
                hypothesis: growthMission.hypothesis,
                primaryMetric: growthMission.primaryMetric,
                primaryMetricKey: growthMission.primaryMetricKey,
                baselineValue: growthMission.baselineValue,
                targetValue: growthMission.targetValue,
                variants: growthMission.variants.map((variant) => ({
                  name: variant.name,
                  angle: variant.angle,
                  hookInstruction: variant.hookInstruction,
                  format: variant.format
                }))
              }
            : undefined,
          xhsWorkflowContext: xhsWorkflowContext ?? undefined,
          intelligenceContext: intelligenceContext ?? undefined
        };

        // Assign each output's row id at generation time (rather than at
        // insert time, as before) so the id streamed to the client via the
        // "output"/"done" SSE events is the SAME id the row gets in
        // kit_outputs — the client needs that id to address PUT
        // /api/kits/[kitId]/outputs/[outputId] for edits. Mutating the
        // object onOutput receives is safe: generateKitOutputs returns that
        // same reference in its resolved array (see lib/llm.ts), so the id
        // assigned here is the one that ends up in `outputs` below too.
        await advanceDurableStep("generate_outputs");
        if (jobContext) {
          injectStagingFaultBeforeProvider(
            stagingFaultMode,
            jobContext.queueAttempt
          );
        }
        const modelHeartbeat = jobContext && runContext
          ? setInterval(() => {
              void heartbeatGenerationJob(runContext!.admin, {
                jobId: jobContext!.job.id,
                runId: runContext!.run.id,
                leaseToken: jobContext!.leaseToken,
                step: "generate_outputs"
              }).catch((heartbeatError) => {
                console.error(
                  "[generate] model-call heartbeat failed:",
                  heartbeatError
                );
              });
            }, 60_000)
          : null;
        let outputs: Awaited<ReturnType<typeof generateKitOutputs>>;
        try {
          outputs = await generateKitOutputs(generationInput, {
            lettaAgentId: lettaAgentId ?? undefined,
            modelTier,
            telemetry: telemetryContext(),
            onModelAttempt: jobContext && runContext
              ? async (audit) => {
                  try {
                    await recordGenerationAttemptModel(runContext!.admin, {
                      runId: runContext!.run.id,
                      leaseToken: jobContext!.leaseToken,
                      audit
                    });
                  } catch (auditError) {
                    // The model response is already paid for. Do not repeat the
                    // provider request solely because telemetry persistence had
                    // a transient outage; the queue attempt terminal row still
                    // records normalized success/failure and timings.
                    console.error(
                      "[generate] failed to persist model attempt audit:",
                      auditError
                    );
                  }
                }
              : undefined,
            onOutput: (output) => {
              output.id = crypto.randomUUID();
              emit("output", { output });
            }
          });
          outputs = applyStagingPartialPlatformFailure(
            stagingFaultMode,
            outputs
          );
        } finally {
          if (modelHeartbeat) clearInterval(modelHeartbeat);
        }
        const partialSuccess = outputs.length < input.platforms.length;

        const inputFingerprint = await contentInputFingerprint({
          ideaText: input.ideaText,
          goal: input.goal,
          persona: input.persona,
          platforms: input.platforms,
          language: input.language,
          researchMissionId: input.researchMissionId,
          sourceTopicOpportunityId: input.sourceTopicOpportunityId,
          sourceAttachmentIds: (input.sourceAttachments ?? []).map((attachment) => attachment.id)
        });

        const visualSource = input.visualMode === "source_first" ? input.visualSource : undefined;
        const pendingImageSource: OutputImageSource | undefined = visualSource
          ? { ...visualSource, renderStatus: "pending", renderAttemptCount: 0 }
          : undefined;
        const kit: ContentKit = {
          id: crypto.randomUUID(),
          growthMissionId: input.growthMissionId,
          researchMissionId: input.researchMissionId,
          sourceTopicOpportunityId: input.sourceTopicOpportunityId,
          xhsWorkflowId: input.xhsWorkflowId,
          artifactVersionIds: xhsWorkflowContext?.artifactVersionIds,
          ideaText: input.ideaText,
          goal: input.goal,
          persona: input.persona,
          platforms: input.platforms,
          mediaAssets: input.mediaAssets,
          visualSource,
          outputs: outputs.map((output) => ({
            ...output,
            locked: false,
            publishStatus: "draft",
            imageUrl: visualSource?.cachedUrl,
            imageSource: pendingImageSource ? { ...pendingImageSource } : undefined
          })),
          status: "saved",
          createdAt: new Date().toISOString()
        };

        if (runContext) {
          await advanceDurableStep("persist_kit");
          await assertGenerationRunLease(runContext.admin, {
            runId: runContext.run.id,
            userId,
            leaseToken: runContext.run.lease_token
          });
        }
        // Persist the text kit BEFORE image generation runs (previously
        // this happened after). A Worker kill during image generation now
        // reconciles through claim_generation_job's kit-exists check
        // instead of re-running — and re-billing — the LLM call that
        // already succeeded (see migration 073's incident notes: killed
        // invocations were silently re-claimed and re-ran generation from
        // scratch, one job reaching attempt_count = 21). A kill before
        // images finish now just leaves that platform's kit without an
        // image, which is free to recover from, unlike re-running
        // generateKitOutputs.
        await persistGeneratedKit(userId, kit, input.brandBrain, {
          experimentBucket: experiment.bucket,
          flywheelMeta: experiment.meta,
          growthMissionId: input.growthMissionId,
          researchMissionId: input.researchMissionId,
          sourceTopicOpportunityId: input.sourceTopicOpportunityId,
          researchEvidenceCount: intelligenceContext?.evidence.length,
          researchOpportunityCount: intelligenceContext?.opportunities.length,
          xhsWorkflowId: input.xhsWorkflowId,
          agentContentWorkflowId: input.agentContentWorkflowId,
          xhsArtifactVersionIds: xhsWorkflowContext?.artifactVersionIds,
          generationRunId: runContext?.run.id,
          inputFingerprint
        }, industryPackIds);
        reservation = null;

        // AI 配图仅在 visualMode=ai_generate 或旧版 withImage=true 时运行。
        // source_first never enters this branch and therefore never spends
        // standardImage Credits.
        // 完全分开结算——每张独立 reserve→generate→settle/refund，复用
        // /api/image/generate 同款管线与 Workers AI 成本护栏。某张额度不足或
        // 失败只跳过那张，不阻断内容、不多扣（image-gen.ts 内部也会释放
        // Neurons）。文本已经落库，这里只对已持久化的 kit_outputs 行补写
        // image_url。并行生成，时延≈最慢一张。
        const shouldGenerateAiImage = input.visualMode === "ai_generate" || input.withImage === true;
        if (shouldGenerateAiImage && isImageGenConfigured("illustration")) {
          await Promise.all(kit.outputs.map(async (output) => {
            const billing = createAiUsageBilling({
              operationKey: `image-generation:${userId}:${requestId}:${output.platform}`,
              userId,
              action: "standardImage",
              cost: ACTION_CREDITS.standardImage,
              source: "workbench_image",
              detail: { requestId, platform: output.platform }
            });
            const imageReservation = await billing.reserveAndStart();
            if (imageReservation.outcome !== "authorized") return; // 额度不足/重复：跳过这张
            try {
              // Visual theme = the generated headline (the content's essence)
              // backed by the raw idea, NOT the raw request text alone — a
              // 500-char brief reads as "mood" to an image model and yields
              // abstract gradients. The headline keeps the subject concrete.
              const visualPrompt = buildTextFreeVisualPrompt(
                [output.title, input.ideaText.slice(0, 200)]
                  .filter(Boolean)
                  .join(". "),
                output.platform
              );
              const imageOutcome = await generateImage(
                visualPrompt,
                coverImageSizeForPlatform(output.platform),
                undefined,
                { purpose: "illustration" }
              );
              const imageUrl = await persistGeneratedImageForDelivery(userId, imageOutcome);
              output.imageUrl = imageUrl;
              output.imageSource = {
                id: `ai-${crypto.randomUUID()}`,
                cachedUrl: imageUrl,
                originalUrl: imageUrl,
                pageUrl: imageUrl,
                provider: "ai",
                domain: new URL(imageUrl).hostname,
                width: 0,
                height: 0,
                alt: visualPrompt,
                rightsStatus: "generated",
                confidence: "high",
                capturedAt: new Date().toISOString(),
                renderStatus: "ready",
                renderAttemptCount: 0
              };
              if (output.id && persistenceAdmin) {
                const { error: imageUpdateError } = await persistenceAdmin
                  .from("kit_outputs")
                  .update({ image_url: imageUrl, image_source: output.imageSource })
                  .eq("id", output.id)
                  .eq("user_id", userId);
                if (imageUpdateError) {
                  console.error(
                    "[generate] failed to persist image_url for",
                    output.platform,
                    JSON.stringify(imageUpdateError)
                  );
                }
              }
              await billing.settle();
              emit("image", { platform: output.platform, imageUrl, imageSource: output.imageSource });
            } catch (imageError) {
              await billing.refund("workbench_image_failed").catch(() => undefined);
              console.error(
                `[generate] image generation skipped for ${output.platform}:`,
                imageError instanceof Error ? imageError.message : imageError
              );
            }
          }));
        }

        if (runContext) {
          try {
            // No advanceDurableStep("finalize") round-trip here on purpose:
            // completeGenerationRun below already sets current_step to
            // "finalize" itself, and every extra await here widens the
            // window in which a killed invocation (Worker CPU limit) can
            // leave a persisted kit with an unfinalized run.
            await completeGenerationRun(runContext.admin, {
              runId: runContext.run.id,
              userId,
              leaseToken: runContext.run.lease_token,
              contentKitId: kit.id,
              partialSuccess
            });
            await capturePersistedGenerationOutcome(runContext.admin, runContext.run.id, runContext.run.user_id, analyticsContext);
            if (jobContext) {
              await finishGenerationJob(runContext.admin, {
                jobId: jobContext.job.id,
                runId: runContext.run.id,
                leaseToken: jobContext.leaseToken,
                status: partialSuccess ? "partial_success" : "succeeded",
                failure: partialSuccess
                  ? {
                      code: "generation_failed",
                      message:
                        "Some requested platforms could not be generated; completed outputs were saved.",
                      retryable: false
                    }
                  : undefined
              });
            }
          } catch (runError) {
            // The content kit is already durable and credits were consumed
            // correctly. A tracking write outage must not turn that success
            // into a false user-facing failure or an incorrect refund.
            console.error(
              "[generate] failed to finalize generation run:",
              runError
            );
          }
        }

        // Referral activation is tied to the first kit that actually reached
        // durable storage. The database RPC is idempotent, so later kits and
        // concurrent requests become no-ops instead of double-granting.
        let referralReward: Awaited<ReturnType<typeof completeReferralForKit>> = null;
        try {
          referralReward = await completeReferralForKit(userId, kit.id);
        } catch (referralError) {
          // Referral notifications are a post-persistence side effect. A
          // mail/analytics outage must not hide a successfully generated kit.
          console.error("[generate] referral completion failed:", referralError);
        }

        // 回采本次生成实际注入 prompt 的品牌上下文计数（P0-5：外化"越用越懂你"）。
        // 计数直接取自 buildBrainPromptSection 注入的字段，不得编造。
        // rules 字段额外回传实际命中的规则原文（同样直接取自 input.brandBrain，
        // 零额外查询），用于溯源胶囊展示"这条规则来自你的哪次编辑/反馈"。
        const brain = input.brandBrain;
        const usedContext = {
          hasBrand: Boolean(brain?.brandName || brain?.productDescription),
          toneKeywords: brain?.toneKeywords?.length ?? 0,
          bannedPhrases: brain?.bannedPhrases?.length ?? 0,
          approvedExamples: brain?.approvedExamples?.length ?? 0,
          learnedStyle: brain?.learnedStyle?.length ?? 0,
          learnedNegative: brain?.learnedNegative?.length ?? 0,
          performanceRules: brain?.performanceRules?.length ?? 0,
          customRules: generationInput.customRules?.length ?? 0,
          perfExamples: Object.values(generationInput.perfExamples ?? {}).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
          industryPacks: industryPackIds.length,
          rules: {
            learnedStyle: brain?.learnedStyle ?? [],
            learnedNegative: brain?.learnedNegative ?? [],
            performanceRules: brain?.performanceRules ?? []
          }
        };

        // Both Credits values must come from successful authoritative reads.
        // A missing allowance is safer than turning a transient query failure
        // into a believable 0/0 balance in the terminal SSE payload.
        const allowance = await getTerminalGenerationAllowance(userId, {
          limit,
          plan,
          costThisRun: cost
        });
        logInfo("generation_completed", telemetryContext(), {
          http_request_id: httpRequestId,
          plan,
          model_tier: modelTier,
          platform_count: input.platforms.length,
          output_count: kit.outputs.length,
          credit_cost: cost,
          latency_ms: Date.now() - requestStartedAt
        });
        if (internalExecution) {
          emit("worker", {
            status: partialSuccess ? "partial_success" : "succeeded",
            retryable: false,
            contentKitId: kit.id
          });
        }
        emit("done", {
          kit,
          generationRun: runContext
            ? {
                id: runContext.run.id,
                requestId: runContext.run.request_id,
                traceId: runContext.run.trace_id,
                status: partialSuccess ? "partial_success" : "succeeded",
                currentStep: "finalize",
                contentKitId: kit.id
              }
            : null,
          ...(allowance === undefined ? {} : { allowance }),
          usedContext,
          referralReward: referralReward?.completed
            ? {
                granted: true,
                credits: referralReward.referred_credits ?? 100,
                expiresAt: referralReward.expires_at ?? null
              }
            : null
        });
      } catch (error) {
        if (
          error instanceof StagingConsumerInterruption &&
          runContext &&
          jobContext
        ) {
          logWarn("staging_generation_consumer_interrupted", telemetryContext(), {
            queue_attempt: jobContext.queueAttempt,
            lease_expires_at: jobContext.job.lease_expires_at
          });
          // Do not release or transition the database lease. The Queue retry
          // will arrive after the five-second staging lease expires and must
          // reclaim the same durable job, proving interruption recovery.
          emit("worker", {
            status: "retry",
            retryable: true,
            error: error.message
          });
          return;
        }
        const failure = classifyGenerationFailure(error);
        if (
          runContext &&
          jobContext &&
          failure.retryable &&
          jobContext.queueAttempt < 5
        ) {
          try {
            await retryGenerationJob(runContext.admin, {
              jobId: jobContext.job.id,
              runId: runContext.run.id,
              leaseToken: jobContext.leaseToken,
              failure,
              delaySeconds: Math.min(
                30 * 2 ** Math.max(jobContext.queueAttempt - 1, 0),
                900
              )
            });
            logWarn("generation_retry_scheduled", telemetryContext(), {
              error_code: failure.code,
              queue_attempt: jobContext.queueAttempt,
              latency_ms: Date.now() - requestStartedAt
            });
            emit("worker", {
              status: "retry",
              retryable: true,
              error: failure.message
            });
            return;
          } catch (retryError) {
            console.error(
              "[generate] failed to schedule durable retry:",
              retryError
            );
          }
        }

        let reconciledSuccess = false;
        if (runContext) {
          try {
            const result = await failGenerationRun(runContext.admin, {
              runId: runContext.run.id,
              userId: runContext.run.user_id,
              leaseToken: runContext.run.lease_token,
              failure
            });
            creditsRefunded = result.creditsRefunded;
            reconciledSuccess = result.outcome === "succeeded";
            await capturePersistedGenerationOutcome(runContext.admin, runContext.run.id, runContext.run.user_id, analyticsContext);
            if (jobContext) {
              await finishGenerationJob(runContext.admin, {
                jobId: jobContext.job.id,
                runId: runContext.run.id,
                leaseToken: jobContext.leaseToken,
                status: reconciledSuccess ? "succeeded" : "failed",
                failure: reconciledSuccess ? undefined : failure
              });
            }
          } catch (runError) {
            console.error(
              "[generate] failed to persist generation failure:",
              runError
            );
          }
        } else if (reservation) {
          await refundCredits(reservation.userId, reservation.cost, "refund", {
            reason: "generation_failed",
            generationRunId: null,
            requestId: null
          });
          creditsRefunded = true;
        }
        if (agentContentWorkflowGeneration && !reconciledSuccess) {
          try {
            await releaseAgentContentWorkflowGeneration(
              agentContentWorkflowGeneration.admin,
              agentContentWorkflowGeneration.userId,
              agentContentWorkflowGeneration.workflowId,
              agentContentWorkflowGeneration.requestId
            );
          } catch (workflowError) {
            console.error("[generate] failed to release Agent content workflow after terminal failure:", workflowError);
          }
        }
        if (topicOpportunityId && telemetryUserId && !reconciledSuccess) {
          const opportunityAdmin = createSupabaseAdminClient();
          if (opportunityAdmin) {
            const { error: opportunityError } = await opportunityAdmin
              .from("topic_opportunities")
              .update({ preparation_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", topicOpportunityId)
              .eq("user_id", telemetryUserId)
              .neq("preparation_status", "ready");
            if (opportunityError) {
              console.error("[generate] failed to mark Topic Opportunity after terminal failure:", opportunityError);
            }
          }
        }

        logError("generation_failed", telemetryContext(), {
          http_request_id: httpRequestId,
          error_code: failure.code,
          retryable: failure.retryable,
          credits_refunded: creditsRefunded,
          latency_ms: Date.now() - requestStartedAt
        });
        if (internalExecution) {
          emit("worker", {
            status: reconciledSuccess ? "terminal" : "failed",
            retryable: false,
            error: reconciledSuccess ? undefined : failure.message,
            creditsRefunded
          });
        }
        emit("error", {
          error: failure.message,
          code: failure.code,
          retryable: failure.retryable,
          generationRunId: runContext?.run.id ?? null,
          traceId: runContext?.run.trace_id ?? null,
          creditsRefunded
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function getPlanLimit(userId: string): Promise<{ limit: number; plan: PlanId | "free"; platformLimit: number; modelTier: ModelTier }> {
  if (!hasSupabaseConfig()) {
    if (isLocalMockMode()) return { limit: 1500, plan: "free", platformLimit: 13, modelTier: "haiku" };
    throw new Error(persistenceUnavailableMessage("Plan enforcement"));
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return { limit: 1500, plan: "free", platformLimit: 13, modelTier: "haiku" };
    throw new Error(persistenceUnavailableMessage("Plan enforcement"));
  }

  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false })
  ]);

  const activeSubscription = getActiveSubscription(
    (subscriptions ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end
    }))
  );
  const effectivePlan = resolveEffectivePlan(profile?.plan, activeSubscription);

  return {
    // Credits allowance for the cycle — the new primary billing unit.
    // The legacy profiles.monthly_limit (kit count) is intentionally ignored.
    limit: PLAN_CREDITS[effectivePlan],
    plan: effectivePlan,
    platformLimit: getPlanPlatformLimit(effectivePlan),
    modelTier: getPlanModelTier(effectivePlan)
  };
}

/**
 * Reads which industry compliance packs (medical/legal/advertising/finance —
 * see lib/industry-rules/) this user has opted into. Resolved server-side so
 * a client can't spoof or drop compliance rules by editing the request body.
 * Fails open to no packs so a lookup error degrades to today's behavior
 * (no industry section) instead of blocking generation.
 */
async function resolveEnabledIndustryPacks(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
): Promise<IndustryPackId[]> {
  try {
    const { data, error } = await supabase
      .from("custom_guardrails")
      .select("enabled_packs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return z.array(industryPackIdSchema).catch([]).parse(data?.enabled_packs ?? []);
  } catch (error) {
    console.error("[generate] resolveEnabledIndustryPacks failed:", error);
    return [];
  }
}

function defaultAttachmentBrief(names: string[]): string {
  const visibleNames = names.slice(0, 6).join("、");
  return `请基于上传资料（${visibleNames}）识别产品信息、目标用户、核心卖点、证据与限制，并生成具体、可核验的多平台内容。`;
}

/**
 * Resolve the Letta agent ID for a user.
 * Checks the user_agents table first, then user_metadata.
 * If an agent ID is found but is stale (Letta 404/429), clears it and
 * creates a fresh agent so the generate call never hits a dead agent.
 * Returns null if Letta is not configured.
 */
async function resolveLettaAgentId(userId: string): Promise<string | null> {
  if (!isLettaConfigured()) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  // Collect candidate agent ID from DB or metadata
  let agentId: string | null = null;

  if (admin) {
    const { data: mapping } = await admin
      .from("user_agents")
      .select("letta_agent_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (mapping?.letta_agent_id) {
      agentId = mapping.letta_agent_id;
    }
  }

  if (!agentId && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.letta_agent_id) {
      agentId = user.user_metadata.letta_agent_id as string;
    }
  }

  // Validate the agent is still live on Letta
  if (agentId) {
    try {
      await getLettaAgent(agentId);
      return agentId; // still valid
    } catch {
      // Stale / deleted agent — clear mapping and fall through to recreate
      if (admin) {
        await admin.from("user_agents").delete().eq("user_id", userId);
      }
      if (supabase) {
        await supabase.auth.updateUser({ data: { letta_agent_id: null } });
      }
      agentId = null;
    }
  }

  // No valid agent — create a fresh one
  try {
    let userEmail = "";
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email ?? "";
    }
    const newAgent = await createLettaAgent(userId, userEmail);

    if (admin) {
      await admin.from("user_agents").upsert(
        { user_id: userId, letta_agent_id: newAgent.id, letta_agent_name: newAgent.name },
        { onConflict: "user_id" }
      );
    }
    if (supabase) {
      await supabase.auth.updateUser({ data: { letta_agent_id: newAgent.id } });
    }

    return newAgent.id;
  } catch {
    // Letta unavailable — return null so generateKitOutputs skips Letta path
    return null;
  }
}
