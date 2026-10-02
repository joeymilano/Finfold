import { z } from "zod";
import type { createSupabaseAdminClient } from "@/lib/supabase";
import { GROWTH_LOOP_MISSION_KIND } from "@/lib/growth-loop/contracts";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/**
 * Growth publish-assist tasks for the Chrome extension (R2).
 *
 * The extension never receives authority — it lists the actions the user
 * already approved in the web app, helps carry the approved draft to the
 * Xiaohongshu publish page, and reports back a user-reported evidence URL.
 * The payload hash used for confirmation is always the one stored on the
 * approved action row, never a value the extension sends.
 */

export const extensionGrowthTaskOutcomeSchema = z.strictObject({
  outcome: z.enum(["completed", "failed"]),
  evidenceUrl: z.string().trim().max(2048).optional(),
  note: z.string().trim().max(300).optional()
}).superRefine((input, context) => {
  if (input.outcome === "completed" && !input.evidenceUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceUrl"],
      message: "A publication link is required to complete the task."
    });
  }
  if (input.outcome === "failed" && input.evidenceUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceUrl"],
      message: "Failed outcomes cannot carry a publication link."
    });
  }
});

export type ExtensionGrowthTask = {
  taskId: string;
  missionId: string;
  variantKey: string;
  status: "ready" | "completed";
  draft: { title: string; body: string; cta: string } | null;
  trackingUrl: string | null;
  evidenceUrl: string | null;
  approvedAt: string | null;
};

export async function listExtensionGrowthTasks(
  admin: AdminClient,
  userId: string,
  options: { appUrl: string }
): Promise<ExtensionGrowthTask[]> {
  const { data: actions, error } = await admin
    .from("mission_actions")
    .select(
      "id, mission_id, status, input, payload_hash, approved_at, evidence_url, growth_missions!inner(id, user_id, mission_kind, status, goal_id)"
    )
    .eq("user_id", userId)
    .eq("kind", "review_and_publish")
    .eq("growth_missions.user_id", userId)
    .eq("growth_missions.mission_kind", GROWTH_LOOP_MISSION_KIND)
    .in("status", ["running", "succeeded"])
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw error;

  const tasks: ExtensionGrowthTask[] = [];
  for (const action of actions ?? []) {
    const mission = Array.isArray(action.growth_missions)
      ? action.growth_missions[0]
      : action.growth_missions;
    if (!mission) continue;
    const variantKey = typeof action.input?.variantKey === "string" ? action.input.variantKey : "";
    const kitId = typeof action.input?.kitId === "string" ? action.input.kitId : null;

    let draft: ExtensionGrowthTask["draft"] = null;
    if (kitId) {
      const { data: outputs } = await admin
        .from("kit_outputs")
        .select("title, body, cta")
        .eq("kit_id", kitId)
        .eq("user_id", userId)
        .eq("platform", "xiaohongshu")
        .limit(1);
      const output = outputs?.[0];
      if (output) draft = { title: output.title, body: output.body, cta: output.cta };
    }

    const { data: link } = await admin
      .from("tracking_links")
      .select("code")
      .eq("mission_id", action.mission_id)
      .eq("user_id", userId)
      .eq("variant_key", variantKey)
      .maybeSingle();

    tasks.push({
      taskId: action.id,
      missionId: action.mission_id,
      variantKey,
      status: action.status === "succeeded" ? "completed" : "ready",
      draft,
      trackingUrl: link ? `${options.appUrl.replace(/\/$/, "")}/go/${link.code}` : null,
      evidenceUrl: action.evidence_url,
      approvedAt: action.approved_at
    });
  }
  return tasks;
}

export async function reportExtensionGrowthTaskOutcome(
  admin: AdminClient,
  userId: string,
  actionId: string,
  input: z.infer<typeof extensionGrowthTaskOutcomeSchema>
): Promise<
  | { outcome: "confirmed"; replayed: boolean }
  | { outcome: "reset_to_approval" }
  | { outcome: "not_found" }
  | { outcome: "rejected"; reason: string }
> {
  const { data: action } = await admin
    .from("mission_actions")
    .select("id, mission_id, kind, status, input, payload_hash, growth_missions!inner(id, user_id, mission_kind, goal_id)")
    .eq("id", actionId)
    .eq("user_id", userId)
    .eq("kind", "review_and_publish")
    .maybeSingle();
  const mission = Array.isArray(action?.growth_missions)
    ? action?.growth_missions[0]
    : action?.growth_missions;
  if (!action || !mission || mission.mission_kind !== GROWTH_LOOP_MISSION_KIND) {
    return { outcome: "not_found" };
  }

  if (input.outcome === "failed") {
    if (action.status !== "running") return { outcome: "rejected", reason: "Only running tasks can be reported as failed." };
    const now = new Date().toISOString();
    const { error } = await admin
      .from("mission_actions")
      .update({ status: "awaiting_approval", completed_at: null, updated_at: now })
      .eq("id", actionId)
      .eq("user_id", userId)
      .eq("status", "running");
    if (error) throw error;
    await admin.from("mission_events").insert({
      mission_id: action.mission_id,
      user_id: userId,
      event_type: "extension_publish_failed",
      payload: { actionId, note: input.note ?? "", source: "chrome_extension" },
      occurred_at: now
    });
    return { outcome: "reset_to_approval" };
  }

  if (action.status === "succeeded") {
    return { outcome: "confirmed", replayed: true };
  }
  if (action.status !== "running") {
    return { outcome: "rejected", reason: "This task is not in an approvable state." };
  }
  if (!action.payload_hash) {
    return { outcome: "rejected", reason: "The approved content version is missing." };
  }

  const variantKey = typeof action.input?.variantKey === "string" ? action.input.variantKey : "";
  const { data, error } = await admin.rpc("confirm_mission_publication", {
    p_user_id: userId,
    p_mission_id: action.mission_id,
    p_action_id: actionId,
    p_variant_key: variantKey,
    p_payload_hash: action.payload_hash,
    p_evidence_url: input.evidenceUrl,
    p_execution_mode: "assisted"
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("stale")) {
      return { outcome: "rejected", reason: "The approved content version has changed. Re-approve it in the web app." };
    }
    throw new Error(message);
  }
  return { outcome: "confirmed", replayed: false };
}
