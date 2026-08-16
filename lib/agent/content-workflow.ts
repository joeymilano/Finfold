import { z } from "zod";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  brandBrainSchema,
  type BrandBrain
} from "@/lib/brand-brain";
import {
  BRAND_BRAIN_COLUMNS,
  mapBrandBrainFromRow
} from "@/lib/brand-brain-persistence";
import {
  goalIdSchema,
  personaIdSchema,
  type GenerateRequest
} from "@/lib/content-schema";

const workflowPlatforms = ["wechat", "x"] as const;
const workflowStages = ["draft", "generating", "ready", "review"] as const;
const workflowStatuses = ["active", "completed", "dismissed", "superseded"] as const;

export const agentContentWorkflowPlatformSchema = z.enum(workflowPlatforms);
export const agentContentWorkflowIdSchema = z.string().uuid();
export const agentContentWorkflowRequestSchema = z.object({
  platform: agentContentWorkflowPlatformSchema,
  ideaText: z.string().min(20).max(4000),
  goal: goalIdSchema,
  persona: personaIdSchema,
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto")
});

export type AgentContentWorkflowPlatform = z.infer<typeof agentContentWorkflowPlatformSchema>;
export type AgentContentWorkflowRequest = z.infer<typeof agentContentWorkflowRequestSchema>;
export type AgentContentWorkflowStage = (typeof workflowStages)[number];
export type AgentContentWorkflowStatus = (typeof workflowStatuses)[number];

export type AgentContentWorkflow = {
  id: string;
  platform: AgentContentWorkflowPlatform;
  status: AgentContentWorkflowStatus;
  stage: AgentContentWorkflowStage;
  request: AgentContentWorkflowRequest;
  kitId: string | null;
  generationRequestId: string | null;
  generationRunId: string | null;
  completionReceipt: ContentWorkflowCompletionReceipt | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentWorkflowCompletionReceipt = {
  title: string;
  summary: string;
  contentKitId: string;
  platform: AgentContentWorkflowPlatform;
  outputCount: number;
  persistedAt: string;
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type WorkflowRow = {
  id: string;
  platform: AgentContentWorkflowPlatform;
  status: AgentContentWorkflowStatus;
  stage: AgentContentWorkflowStage;
  request: unknown;
  kit_id: string | null;
  generation_request_id: string | null;
  generation_run_id: string | null;
  completion_receipt: unknown;
  created_at: string;
  updated_at: string;
};

const WORKFLOW_FIELDS = "id, platform, status, stage, request, kit_id, generation_request_id, generation_run_id, completion_receipt, created_at, updated_at";
const supersedeableWorkflowStages = ["draft", "ready", "review"] as const;
const activeGenerationConflictMessage = "A content package for this platform is already being generated. Wait for it to finish or retry after its failure.";

export async function createAgentContentWorkflow(
  admin: AdminClient,
  userId: string,
  input: AgentContentWorkflowRequest
): Promise<AgentContentWorkflow> {
  const request = agentContentWorkflowRequestSchema.parse(input);
  const now = new Date().toISOString();
  const { data: activeWorkflow, error: activeWorkflowError } = await admin
    .from("agent_content_workflows")
    .select("id, stage")
    .eq("user_id", userId)
    .eq("platform", request.platform)
    .eq("status", "active")
    .maybeSingle();
  if (activeWorkflowError) throw activeWorkflowError;

  if (activeWorkflow?.stage === "generating") {
    throw new Error(activeGenerationConflictMessage);
  }

  if (activeWorkflow) {
    const { data: supersededWorkflow, error: supersedeError } = await admin
    .from("agent_content_workflows")
      .update({ status: "superseded", updated_at: now, completed_at: now })
      .eq("id", activeWorkflow.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .in("stage", supersedeableWorkflowStages)
      .select("id")
      .maybeSingle();
    if (supersedeError) throw supersedeError;
    if (!supersededWorkflow) throw new Error(activeGenerationConflictMessage);
  }

  const { data, error } = await admin
    .from("agent_content_workflows")
    .insert({
      user_id: userId,
      platform: request.platform,
      request,
      stage: "draft"
    })
    .select(WORKFLOW_FIELDS)
    .single();
  if (error?.code === "23505") throw new Error(activeGenerationConflictMessage);
  if (error || !data) throw error ?? new Error("Unable to create the content workflow.");
  return mapAgentContentWorkflow(data as WorkflowRow);
}

/** Lists owner-scoped workflow state so the Agent UI can recover after SSE ends. */
export async function listAgentContentWorkflows(
  admin: AdminClient,
  userId: string,
  limit = 6
): Promise<AgentContentWorkflow[]> {
  const { data, error } = await admin
    .from("agent_content_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapAgentContentWorkflow(row as WorkflowRow));
}

export async function loadAgentContentWorkflowGenerationContext(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  expectedGeneration?: { requestId: string; runId?: string }
): Promise<{
  workflow: AgentContentWorkflow;
  generationRequest: GenerateRequest;
  brandBrain: BrandBrain;
}> {
  const { data, error } = await admin
    .from("agent_content_workflows")
    .select(WORKFLOW_FIELDS)
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This content workflow is no longer active.");

  const workflow = mapAgentContentWorkflow(data as WorkflowRow);
  const isExpectedGeneration = expectedGeneration
    && workflow.stage === "generating"
    && workflow.generationRequestId === expectedGeneration.requestId
    && (!expectedGeneration.runId || workflow.generationRunId === expectedGeneration.runId);
  if ((!isExpectedGeneration && workflow.stage !== "draft") || workflow.kitId) {
    throw new Error("This content workflow already has a saved content package.");
  }

  const { data: brainRow, error: brainError } = await admin
    .from("brand_brains")
    .select(BRAND_BRAIN_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (brainError) throw brainError;
  const brandBrain = brainRow ? mapBrandBrainFromRow(brainRow) : brandBrainSchema.parse({});

  return {
    workflow,
    brandBrain,
    generationRequest: buildAgentContentWorkflowGenerationRequest(workflow, brandBrain)
  };
}

/** Claim a workflow before creating its generation run. The conditional update
 * is the concurrency boundary: a second browser tab cannot begin another run. */
export async function claimAgentContentWorkflowGeneration(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  requestId: string
): Promise<{
  workflow: AgentContentWorkflow;
  generationRequest: GenerateRequest;
  brandBrain: BrandBrain;
}> {
  const { data: claimed, error: claimError } = await admin
    .from("agent_content_workflows")
    .update({
      stage: "generating",
      generation_request_id: requestId,
      generation_run_id: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("stage", "draft")
    .select(WORKFLOW_FIELDS)
    .maybeSingle();
  if (claimError) throw claimError;

  if (!claimed) {
    const { data: existing, error: existingError } = await admin
      .from("agent_content_workflows")
      .select(WORKFLOW_FIELDS)
      .eq("id", workflowId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw existingError;
    const workflow = existing ? mapAgentContentWorkflow(existing as WorkflowRow) : null;
    if (!workflow) throw new Error("This content workflow is no longer active.");
    if (workflow.stage === "generating" && workflow.generationRequestId === requestId) {
      return loadAgentContentWorkflowGenerationContext(admin, userId, workflowId, { requestId });
    }
    throw new Error("This content workflow is already being generated. Wait for it to finish or retry after its failure.");
  }

  const workflow = mapAgentContentWorkflow(claimed as WorkflowRow);
  const { data: brainRow, error: brainError } = await admin
    .from("brand_brains")
    .select(BRAND_BRAIN_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (brainError) throw brainError;
  const brandBrain = brainRow ? mapBrandBrainFromRow(brainRow) : brandBrainSchema.parse({});
  return {
    workflow,
    brandBrain,
    generationRequest: buildAgentContentWorkflowGenerationRequest(workflow, brandBrain)
  };
}

export async function attachAgentContentWorkflowGenerationRun(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  requestId: string,
  runId: string
): Promise<void> {
  const { data, error } = await admin
    .from("agent_content_workflows")
    .update({ generation_run_id: runId, updated_at: new Date().toISOString() })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("stage", "generating")
    .eq("generation_request_id", requestId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This content workflow generation claim was lost.");
}

/** A terminal known failure returns the workflow to draft. Queue retries retain
 * `generating`, so they keep their original idempotent generation run. */
export async function releaseAgentContentWorkflowGeneration(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  requestId: string
): Promise<void> {
  const { error } = await admin
    .from("agent_content_workflows")
    .update({
      stage: "draft",
      generation_request_id: null,
      generation_run_id: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("stage", "generating")
    .eq("generation_request_id", requestId);
  if (error) throw error;
}

export function buildAgentContentWorkflowGenerationRequest(
  workflow: Pick<AgentContentWorkflow, "id" | "platform" | "request">,
  brandBrain?: BrandBrain
): GenerateRequest {
  return {
    ideaText: workflow.request.ideaText,
    goal: workflow.request.goal,
    persona: workflow.request.persona,
    platforms: [workflow.platform],
    mediaAssets: [],
    language: workflow.request.language,
    agentContentWorkflowId: workflow.id,
    ...(brandBrain ? { brandBrain } : {})
  };
}

export async function linkAgentContentWorkflowToKit(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  kitId: string,
  outputCount: number,
  generationRunId?: string
): Promise<ContentWorkflowCompletionReceipt> {
  const { data, error } = await admin
    .from("agent_content_workflows")
    .select("platform")
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data || !agentContentWorkflowPlatformSchema.safeParse(data.platform).success) {
    throw new Error("This content workflow is no longer active.");
  }

  const receipt = buildContentWorkflowCompletionReceipt({
    platform: data.platform,
    contentKitId: kitId,
    outputCount,
    persistedAt: new Date().toISOString()
  });
  const { error: workflowError } = await admin
    .from("agent_content_workflows")
    .update({
      kit_id: kitId,
      generation_request_id: null,
      generation_run_id: generationRunId ?? null,
      stage: "ready",
      completion_receipt: receipt,
      updated_at: receipt.persistedAt
    })
    .eq("id", workflowId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (workflowError) throw workflowError;

  const { error: kitError } = await admin
    .from("content_kits")
    .update({ agent_content_workflow_id: workflowId })
    .eq("id", kitId)
    .eq("user_id", userId);
  if (kitError) throw kitError;
  return receipt;
}

export function buildContentWorkflowCompletionReceipt(input: {
  platform: AgentContentWorkflowPlatform;
  contentKitId: string;
  outputCount: number;
  persistedAt: string;
}): ContentWorkflowCompletionReceipt {
  const platformLabel = input.platform === "wechat" ? "公众号" : "X";
  return {
    title: `${platformLabel} 内容包已保存`,
    summary: `已保存 ${input.outputCount} 个 ${platformLabel} 内容输出，尚未对外发布。`,
    contentKitId: input.contentKitId,
    platform: input.platform,
    outputCount: input.outputCount,
    persistedAt: input.persistedAt
  };
}

export function mapAgentContentWorkflow(row: WorkflowRow): AgentContentWorkflow {
  return {
    id: row.id,
    platform: agentContentWorkflowPlatformSchema.parse(row.platform),
    status: z.enum(workflowStatuses).parse(row.status),
    stage: z.enum(workflowStages).parse(row.stage),
    request: agentContentWorkflowRequestSchema.parse(row.request),
    kitId: row.kit_id,
    generationRequestId: row.generation_request_id,
    generationRunId: row.generation_run_id,
    completionReceipt: completionReceiptValue(row.completion_receipt),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function completionReceiptValue(value: unknown): ContentWorkflowCompletionReceipt | null {
  const parsed = z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    contentKitId: z.string().uuid(),
    platform: agentContentWorkflowPlatformSchema,
    outputCount: z.number().int().nonnegative(),
    persistedAt: z.string().datetime()
  }).safeParse(value);
  return parsed.success ? parsed.data : null;
}