import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * Activation outcome: the first time a signed-up user saves generated content
 * to the library. Reuses the frozen signup attribution (migration 091/107) and
 * is deduplicated per subject in SQL, so replays and concurrent saves count
 * exactly once.
 *
 * Failure contract (spec §7): analytics must never break the product action.
 * Callers should still prefer the non-blocking wrapper below.
 */
export async function recordActivationOutcome(
  userId: string,
  options: { isTest?: boolean } = {}
): Promise<{ attributed: boolean; reason?: string; replayed?: boolean; missionId?: string }> {
  if (userId === "local-preview-user") {
    return { attributed: false, reason: "local_mock_user" };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { attributed: false, reason: "persistence_unavailable" };
  }
  const { data, error } = await admin.rpc("record_native_activation_outcome", {
    p_subject_user_id: userId,
    p_is_test: options.isTest === true
  });
  if (error) throw error;
  if (!data || typeof data !== "object") {
    return { attributed: false, reason: "invalid_database_response" };
  }
  const row = data as Record<string, unknown>;
  return {
    attributed: row.attributed === true,
    ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    ...(typeof row.replayed === "boolean" ? { replayed: row.replayed } : {}),
    ...(typeof row.missionId === "string" ? { missionId: row.missionId } : {})
  };
}

/**
 * Non-blocking wrapper for product paths. Never throws; a failed write is
 * reconciled by the next save attempt because the dedupe key is stable.
 */
export async function maybeRecordActivationOutcome(
  userId: string,
  options: { isTest?: boolean } = {}
): Promise<void> {
  try {
    const result = await recordActivationOutcome(userId, options);
    if (result.attributed) {
      console.info(
        JSON.stringify({
          event: "growth_loop_activation_attributed",
          user_id: userId,
          mission_id: result.missionId,
          replayed: result.replayed === true
        })
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "growth_loop_activation_failed",
        user_id: userId,
        error: error instanceof Error ? error.message : "unknown"
      })
    );
  }
}
