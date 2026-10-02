import type { createSupabaseAdminClient } from "@/lib/supabase";
import type { GrowthLearningRow } from "@/lib/growth-loop/contracts";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class LearningDecisionError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_transition"
  ) {
    super(message);
    this.name = "LearningDecisionError";
  }
}

const TRANSITIONS: Record<GrowthLearningRow["status"], Record<string, GrowthLearningRow["status"]>> = {
  candidate: { accept: "accepted", reject: "rejected" },
  accepted: { revoke: "revoked" },
  rejected: {},
  revoked: {}
};

export async function decideGrowthLearning(
  admin: AdminClient,
  userId: string,
  learningId: string,
  decision: "accept" | "reject" | "revoke"
): Promise<GrowthLearningRow> {
  const { data: existing, error } = await admin
    .from("growth_learnings")
    .select("*")
    .eq("id", learningId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) throw new LearningDecisionError("Learning not found.", "not_found");

  const row = existing as GrowthLearningRow;
  const nextStatus = TRANSITIONS[row.status][decision];
  if (!nextStatus) {
    throw new LearningDecisionError(
      `A ${row.status} learning cannot be ${decision}ed.`,
      "invalid_transition"
    );
  }

  const now = new Date().toISOString();
  const patch: Partial<GrowthLearningRow> = {
    status: nextStatus,
    updated_at: now,
    version: row.version + 1
  };
  if (nextStatus === "accepted") patch.accepted_at = now;
  if (nextStatus === "revoked") patch.revoked_at = now;

  const { data: updated, error: updateError } = await admin
    .from("growth_learnings")
    .update(patch)
    .eq("id", learningId)
    .eq("user_id", userId)
    .eq("version", row.version)
    .select("*")
    .single();
  if (updateError || !updated) {
    // Lost the optimistic-version race; report current state instead of retrying.
    throw new LearningDecisionError(
      "This learning was just changed. Refresh and try again.",
      "invalid_transition"
    );
  }

  if (row.mission_id) {
    await admin.from("mission_events").insert({
      mission_id: row.mission_id,
      user_id: userId,
      event_type: "learning_decision",
      payload: {
        learningId,
        decision,
        fromStatus: row.status,
        toStatus: nextStatus,
        version: row.version + 1
      },
      occurred_at: now
    });
  }
  return updated as GrowthLearningRow;
}

export async function listGrowthLearnings(
  admin: AdminClient,
  userId: string,
  options: { goalId?: string; statuses?: GrowthLearningRow["status"][] } = {}
): Promise<GrowthLearningRow[]> {
  let query = admin
    .from("growth_learnings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (options.goalId) {
    query = query.or(`goal_id.is.null,goal_id.eq.${options.goalId}`);
  }
  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GrowthLearningRow[];
}
