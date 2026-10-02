import { NextResponse } from "next/server";
import { GROWTH_LOOP_MISSION_KIND, growthVariantDraftSchema, type MissionPlanSnapshot } from "@/lib/growth-loop/contracts";
import { computeKitPayloadHash } from "@/lib/growth-loop/policy";
import { getGrowthLoopGoal, ensureGoalAcceptingWork } from "@/lib/growth-loop/policy";
import { growthLoopErrorResponse, guardGrowthLoopRequest } from "@/lib/growth-loop/http";

/**
 * Binds one generated kit to one experiment variant. When every variant has a
 * kit, the per-variant publish actions are created with the content hash that
 * approvals will pin.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ missionId: string; variantKey: string }> }
) {
  const guard = await guardGrowthLoopRequest();
  if (!guard.ok) return guard.response;
  const { admin, userId } = guard.context;
  try {
    const { missionId, variantKey } = await params;
    const body = await request.json().catch(() => ({}));
    const input = growthVariantDraftSchema.parse({ ...body, variantKey });

    const { data: mission, error: missionError } = await admin
      .from("growth_missions")
      .select("id, user_id, goal_id, status, plan")
      .eq("id", missionId)
      .eq("user_id", userId)
      .eq("mission_kind", GROWTH_LOOP_MISSION_KIND)
      .maybeSingle();
    if (missionError) throw new Error(missionError.message);
    if (!mission) return NextResponse.json({ error: "Growth loop mission not found." }, { status: 404 });
    if (!["accepted", "draft_ready"].includes(mission.status)) {
      return NextResponse.json({ error: "This mission no longer accepts draft binding." }, { status: 409 });
    }
    if (mission.goal_id) {
      const goal = await getGrowthLoopGoal(admin, userId, mission.goal_id);
      if (!goal) return NextResponse.json({ error: "Growth goal not found." }, { status: 404 });
      ensureGoalAcceptingWork(goal);
    }

    const plan = (mission.plan ?? {}) as MissionPlanSnapshot;
    const variant = (plan.variants ?? []).find((item) => item.key === input.variantKey);
    if (!variant) {
      return NextResponse.json({ error: "Unknown experiment variant." }, { status: 404 });
    }

    const { data: kit, error: kitError } = await admin
      .from("content_kits")
      .select("id, user_id, status")
      .eq("id", input.kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (kitError) throw new Error(kitError.message);
    if (!kit) return NextResponse.json({ error: "Content kit not found." }, { status: 404 });
    if (kit.status === "preview") {
      return NextResponse.json({ error: "This kit is still a preview; save it to the library first." }, { status: 409 });
    }

    const { data: outputs, error: outputsError } = await admin
      .from("kit_outputs")
      .select("platform, title, body, cta")
      .eq("kit_id", input.kitId)
      .eq("user_id", userId);
    if (outputsError) throw new Error(outputsError.message);
    if (!outputs || outputs.length === 0) {
      return NextResponse.json({ error: "This kit has no outputs to publish." }, { status: 409 });
    }
    const payloadHash = computeKitPayloadHash({
      id: input.kitId,
      outputs: outputs.map((output) => ({
        platform: output.platform,
        title: output.title,
        body: output.body,
        cta: output.cta
      }))
    });

    const now = new Date().toISOString();
    const nextVariants = (plan.variants ?? []).map((item) =>
      item.key === input.variantKey ? { ...item, kitId: input.kitId } : item
    );
    const allBound = nextVariants.every((item) => typeof item.kitId === "string" && item.kitId.length > 0);

    const { error: missionUpdateError } = await admin
      .from("growth_missions")
      .update({
        plan: { ...plan, variants: nextVariants },
        kit_id: nextVariants.find((item) => item.kitId)?.kitId ?? null,
        status: allBound ? "draft_ready" : mission.status,
        execution_state: "awaiting_decision",
        updated_at: now
      })
      .eq("id", missionId)
      .eq("user_id", userId)
      .in("status", ["accepted", "draft_ready"]);
    if (missionUpdateError) throw new Error(missionUpdateError.message);

    const { error: prepareUpdateError } = await admin
      .from("mission_actions")
      .update({
        status: "succeeded",
        payload_hash: payloadHash,
        output: { kitId: input.kitId, payloadHash },
        completed_at: now,
        updated_at: now
      })
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("kind", "prepare_execution_draft")
      .eq("status", "awaiting_approval")
      .contains("input", { variantKey: input.variantKey });
    if (prepareUpdateError) throw new Error(prepareUpdateError.message);

    if (allBound) {
      // Each publish action pins the exact content version of ITS variant,
      // so every bound kit's hash is (re)computed here from current outputs —
      // a kit edited after binding gets the new hash and must be re-approved.
      const boundVariants = nextVariants.filter(
        (item): item is typeof item & { kitId: string } => typeof item.kitId === "string" && item.kitId.length > 0
      );
      const hashByVariant = new Map<string, string>([[input.variantKey, payloadHash]]);
      for (const variant of boundVariants) {
        if (hashByVariant.has(variant.key)) continue;
        const { data: variantOutputs, error: variantOutputsError } = await admin
          .from("kit_outputs")
          .select("platform, title, body, cta")
          .eq("kit_id", variant.kitId)
          .eq("user_id", userId);
        if (variantOutputsError) throw new Error(variantOutputsError.message);
        if (!variantOutputs || variantOutputs.length === 0) {
          return NextResponse.json({ error: `Variant ${variant.key} has no outputs to publish.` }, { status: 409 });
        }
        hashByVariant.set(
          variant.key,
          computeKitPayloadHash({
            id: variant.kitId,
            outputs: variantOutputs.map((output) => ({
              platform: output.platform,
              title: output.title,
              body: output.body,
              cta: output.cta
            }))
          })
        );
      }
      const publishActions = boundVariants
        .map((item) => ({
          mission_id: missionId,
          user_id: userId,
          kind: "review_and_publish",
          status: "awaiting_approval",
          risk_level: "medium",
          requires_approval: true,
          input: { variantKey: item.key, kitId: item.kitId },
          payload_hash: hashByVariant.get(item.key) ?? null,
          provider: "manual_channel",
          idempotency_key: `growth-loop-publish:${missionId}:${item.key}`
        }));
      const { error: publishError } = await admin
        .from("mission_actions")
        .upsert(publishActions, { onConflict: "mission_id,idempotency_key" });
      if (publishError) throw new Error(publishError.message);
    }

    await admin.from("mission_events").insert({
      mission_id: missionId,
      user_id: userId,
      event_type: "variant_draft_bound",
      payload: { variantKey: input.variantKey, kitId: input.kitId, payloadHash, allBound },
      occurred_at: now
    });

    return NextResponse.json({ bound: true, allBound, payloadHash });
  } catch (error) {
    return growthLoopErrorResponse(error);
  }
}
