import { createHash } from "node:crypto";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { GrowthLoopGoalRow } from "@/lib/growth-loop/contracts";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/**
 * Deterministic content hash for version-pinned approvals. Approval binds the
 * exact payload; any later content change invalidates the approval because the
 * hash stored on the action no longer matches the recomputed one.
 */
export function computeKitPayloadHash(kit: {
  id: string;
  outputs: Array<{ platform: string; title: string; body: string; cta: string }>;
}): string {
  const canonical = JSON.stringify({
    kitId: kit.id,
    outputs: [...kit.outputs]
      .map((output) => ({
        platform: output.platform,
        title: output.title,
        body: output.body,
        cta: output.cta
      }))
      .sort((a, b) => `${a.platform}:${a.title}`.localeCompare(`${b.platform}:${b.title}`))
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export type ApprovalSummary = {
  goalId: string;
  missionId: string;
  actionId: string;
  variantKey: string;
  actionType: "publish_post";
  channel: string;
  contentKitId: string | null;
  payloadHash: string | null;
  executionModes: string[];
  evidenceCeiling: string;
};

/**
 * The approval card shown before any execution. Everything the user sees here
 * is what the hash pins — change any of it and the approval goes stale.
 */
export function buildApprovalSummary(input: {
  goal: Pick<GrowthLoopGoalRow, "id" | "channel_platform">;
  missionId: string;
  actionId: string;
  variantKey: string;
  contentKitId: string | null;
  payloadHash: string | null;
  executionModes: string[];
  evidenceCeiling: string;
}): ApprovalSummary {
  return {
    goalId: input.goal.id,
    missionId: input.missionId,
    actionId: input.actionId,
    variantKey: input.variantKey,
    actionType: "publish_post",
    channel: input.goal.channel_platform,
    contentKitId: input.contentKitId,
    payloadHash: input.payloadHash,
    executionModes: input.executionModes,
    evidenceCeiling: input.evidenceCeiling
  };
}

export async function getGrowthLoopGoal(
  admin: AdminClient,
  userId: string,
  goalId: string
): Promise<GrowthLoopGoalRow | null> {
  const { data, error } = await admin
    .from("growth_loop_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as GrowthLoopGoalRow) ?? null;
}

export function ensureGoalAcceptingWork(goal: GrowthLoopGoalRow): void {
  if (goal.status !== "active") {
    throw new Error("This growth goal is paused or closed.");
  }
}
