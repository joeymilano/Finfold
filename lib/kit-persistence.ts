import type { ContentKit } from "@/lib/content-schema";
import { saveMockKit } from "@/lib/mock-store";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { computeQualityScore, QUALITY_SCORE_VERSION } from "@/lib/quality-score";
import { brandBrainSchema, type BrandBrain } from "@/lib/brand-brain";
import { HUMAN_WRITING_VERSION } from "@/lib/human-writing";
import type { ExperimentBucket } from "@/lib/flywheel-experiment";
import type { IndustryPackId } from "@/lib/industry-rules/types";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { linkGrowthMissionToKit } from "@/lib/agent/growth-missions";
import { advancePatrolAfterEvent } from "@/lib/agent/patrol";
import { linkXhsWorkflowToKit } from "@/lib/agent/xhs-workflow";
import { linkAgentContentWorkflowToKit } from "@/lib/agent/content-workflow";
import { maybeRecordActivationOutcome } from "@/lib/growth-loop/attribution";
import { canonicalContentTitle } from "@/lib/content-title";

export type FlywheelPersistenceOptions = {
  /** null when the kit was never a candidate for the backflow experiment
   * (no qualifying history) — must NOT be recorded as 'control'. */
  experimentBucket?: ExperimentBucket | null;
  flywheelMeta?: { injectedPlatforms: string[] } | null;
  growthMissionId?: string;
  /** Attribution only for now: usage_events joins the approved Research
   * mission to the resulting kit without requiring a content_kits migration. */
  researchMissionId?: string;
  researchEvidenceCount?: number;
  researchOpportunityCount?: number;
  xhsWorkflowId?: string;
  xhsArtifactVersionIds?: string[];
  agentContentWorkflowId?: string;
  sourceTopicOpportunityId?: string;
  generationRunId?: string;
  /** SHA-256 of the core generation input (idea/goal/persona/platforms/language).
   *  Powers the "you already generated this combo" pre-check in /api/generate.
   *  Null for callers that don't opt in (e.g. watch-source auto-drafts). See
   *  lib/content-fingerprint.ts. */
  inputFingerprint?: string | null;
};

/**
 * Persists a generated kit + its outputs, shared between the interactive
 * /api/generate route and the watch-source auto-draft path
 * (/api/watch-sources/[id]/check) so both write through the exact same
 * columns instead of two copies drifting apart over time.
 *
 * `brandBrain` is optional because trial generations and some auto-drafts
 * have none — quality scoring degrades gracefully to the empty-brain
 * baseline in that case (see lib/quality-score.ts scoreBrandConsistency).
 */
export async function persistGeneratedKit(
  userId: string,
  kit: ContentKit,
  brandBrain?: BrandBrain,
  flywheel?: FlywheelPersistenceOptions,
  industryPackIds: IndustryPackId[] = []
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) {
      saveMockKit(kit);
      return;
    }
    throw new Error(persistenceUnavailableMessage("Content kit persistence"));
  }

  const kitRow = {
    id: kit.id,
    user_id: userId,
    idea_text: kit.ideaText,
    goal: kit.goal,
    persona: kit.persona,
    platforms: kit.platforms,
    media_assets: kit.mediaAssets,
    visual_source: kit.visualSource ?? null,
    status: kit.status,
    created_at: kit.createdAt,
    experiment_bucket: flywheel?.experimentBucket ?? null,
    flywheel_meta: flywheel?.flywheelMeta ?? null,
    growth_mission_id: flywheel?.growthMissionId ?? null,
    xhs_workflow_id: flywheel?.xhsWorkflowId ?? null,
    xhs_artifact_version_ids: flywheel?.xhsArtifactVersionIds ?? [],
    agent_content_workflow_id: flywheel?.agentContentWorkflowId ?? null,
    source_topic_opportunity_id: flywheel?.sourceTopicOpportunityId ?? null,
    generation_run_id: flywheel?.generationRunId ?? null,
    input_fingerprint: flywheel?.inputFingerprint ?? null,
    human_writing_version: HUMAN_WRITING_VERSION
  };
  let kitResult = await supabase.from("content_kits").insert(kitRow);
  if (kitResult.error && /visual_source|xhs_workflow_id|xhs_artifact_version_ids|agent_content_workflow_id|source_topic_opportunity_id|generation_run_id|input_fingerprint|human_writing_version|schema cache/i.test(kitResult.error.message ?? "")) {
    const legacyKitRow = {
      id: kitRow.id,
      user_id: kitRow.user_id,
      idea_text: kitRow.idea_text,
      goal: kitRow.goal,
      persona: kitRow.persona,
      platforms: kitRow.platforms,
      media_assets: kitRow.media_assets,
      status: kitRow.status,
      created_at: kitRow.created_at,
      experiment_bucket: kitRow.experiment_bucket,
      flywheel_meta: kitRow.flywheel_meta,
      growth_mission_id: kitRow.growth_mission_id
    };
    kitResult = await supabase.from("content_kits").insert(legacyKitRow);
  }
  const kitError = kitResult.error;
  if (kitError) {
    console.error("[kit-persistence] Failed to persist content_kits row:", JSON.stringify(kitError));
    throw new Error("Kit was generated but could not be saved. Please try again.");
  }

  const outputRows = kit.outputs.map((output) => {
    const id = output.id ?? crypto.randomUUID();
    output.id = id;
    return {
      id,
      kit_id: kit.id,
      user_id: userId,
      platform: output.platform,
      title: canonicalContentTitle(output.title),
      body: output.body,
      summary: output.summary || null,
      cta: output.cta,
      notes: output.notes,
      strategy: output.strategy,
      locked: output.locked ?? false,
      publish_status: output.publishStatus ?? "draft",
      image_url: output.imageUrl || null,
      image_prompt: output.imagePrompt || null,
      image_source: output.imageSource ?? null,
      final_body: output.finalBody || null,
      user_edited: output.userEdited ?? false,
      published_url: output.publishedUrl || null,
      published_at: output.publishedAt || null
    };
  });

  let outputsResult = await supabase.from("kit_outputs").insert(outputRows);
  if (outputsResult.error && /image_source|schema cache/i.test(outputsResult.error.message ?? "")) {
    outputsResult = await supabase.from("kit_outputs").insert(
      outputRows.map((row) => {
        const { image_source: imageSource, ...legacyOutput } = row;
        void imageSource;
        return legacyOutput;
      })
    );
  }
  const outputsError = outputsResult.error;
  if (outputsError) {
    console.error("[kit-persistence] Failed to persist kit_outputs rows:", JSON.stringify(outputsError));
    await supabase
      .from("content_kits")
      .delete()
      .eq("id", kit.id)
      .eq("user_id", userId);
    throw new Error("Kit was generated but could not be saved. Please try again.");
  }

  if (flywheel?.growthMissionId) {
    try {
      await linkGrowthMissionToKit(supabase, userId, flywheel.growthMissionId, kit.id);
    } catch (error) {
      // The content is safely persisted even if the mission status update
      // temporarily fails. Keep the mission id on content_kits so the
      // lifecycle can be repaired or evaluated later.
      console.error("[kit-persistence] Failed to link Growth Mission:", error);
    }
  }
  if (flywheel?.xhsWorkflowId) {
    try {
      await linkXhsWorkflowToKit(
        supabase,
        userId,
        flywheel.xhsWorkflowId,
        kit.id,
        flywheel.growthMissionId
      );
    } catch (error) {
      console.error("[kit-persistence] Failed to link Xiaohongshu workflow:", error);
    }
  }
  if (flywheel?.agentContentWorkflowId) {
    try {
      await linkAgentContentWorkflowToKit(
        supabase,
        userId,
        flywheel.agentContentWorkflowId,
        kit.id,
        outputRows.length,
        flywheel.generationRunId
      );
    } catch (error) {
      console.error("[kit-persistence] Failed to link Agent content workflow:", error);
    }
  }
  if (flywheel?.sourceTopicOpportunityId) {
    const { error: opportunityError } = await supabase
      .from("topic_opportunities")
      .update({
        preparation_status: "ready",
        content_kit_id: kit.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", flywheel.sourceTopicOpportunityId)
      .eq("user_id", userId);
    if (opportunityError) {
      console.error("[kit-persistence] Failed to link Topic Opportunity:", opportunityError);
    }
  }

  await persistQualityScores(supabase, userId, kit, outputRows, brandBrain, industryPackIds);

  const { error: usageError } = await supabase.from("usage_events").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    event_name: "kit_generated",
    metadata: {
      kitId: kit.id,
      platformCount: kit.platforms.length,
      growthMissionId: flywheel?.growthMissionId ?? null,
      researchMissionId: flywheel?.researchMissionId ?? null,
      researchEvidenceCount: flywheel?.researchEvidenceCount ?? 0,
      researchOpportunityCount: flywheel?.researchOpportunityCount ?? 0,
      xhsWorkflowId: flywheel?.xhsWorkflowId ?? null,
      agentContentWorkflowId: flywheel?.agentContentWorkflowId ?? null,
      sourceTopicOpportunityId: flywheel?.sourceTopicOpportunityId ?? null,
      humanWritingVersion: HUMAN_WRITING_VERSION,
      visualProvider: kit.visualSource?.provider ?? null,
      visualDomain: kit.visualSource?.domain ?? null,
      visualConfidence: kit.visualSource?.confidence ?? null
    }
  });
  if (usageError) {
    // Non-critical — the kit and its outputs are saved; just log it.
    console.error("[kit-persistence] Failed to persist usage_events row:", JSON.stringify(usageError));
  }

  // First content-library save is the activation moment of the growth loop.
  // Best-effort by contract: a failed attribution write must never fail the
  // save; the SQL dedupe key makes the next save a safe retry.
  await maybeRecordActivationOutcome(userId);

  try {
    await advancePatrolAfterEvent(supabase, userId, {
      type: "kit_generated",
      kitId: kit.id,
      missionId: flywheel?.growthMissionId
    });
  } catch (error) {
    // The generated kit is already durable. A queue refresh must never turn
    // successful generation into a user-visible failure.
    console.error("[kit-persistence] Agent patrol advancement failed:", error);
  }
}

/**
 * Scores every output with the same heuristic the workbench UI shows
 * (lib/quality-score.ts) and persists it, once per output, so a future
 * calibration pass has (score, real engagement) pairs to join against
 * performance_metrics. Non-critical by design — a scoring failure must
 * never roll back a kit that already saved successfully.
 */
async function persistQualityScores(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  kit: ContentKit,
  outputRows: Array<{ id: string; kit_id: string; platform: string }>,
  brandBrain?: BrandBrain,
  industryPackIds: IndustryPackId[] = []
): Promise<void> {
  const brain = brandBrain ?? brandBrainSchema.parse({});

  const scoreRows = kit.outputs.map((output, i) => {
    const { overall, grade, dimensions } = computeQualityScore(output, brain, industryPackIds);
    return {
      output_id: outputRows[i].id,
      kit_id: kit.id,
      user_id: userId,
      platform: output.platform,
      overall,
      grade,
      dimensions: Object.fromEntries(dimensions.map((d) => [d.key, d.score])),
      score_version: QUALITY_SCORE_VERSION
    };
  });

  const { error } = await supabase.from("quality_scores").insert(scoreRows);
  if (error) {
    console.error("[kit-persistence] Failed to persist quality_scores rows:", JSON.stringify(error));
  }
}
