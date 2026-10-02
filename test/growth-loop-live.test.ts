// @vitest-environment node
// Opt-in live verification of the growth-loop R1 SQL chain against the real
// database. Always costs 1 Credit (the plan route bills its idempotent
// operation); the planner model output is stubbed deterministically unless
// FINFOLD_GROWTH_LOOP_LIVE_MODEL=1 (then the real model is called too).
//
// Required env:
//   FINFOLD_GROWTH_LOOP_LIVE=1
//   FINFOLD_GROWTH_LOOP_TEST_USER_ID=<owner account uuid>
//   FINFOLD_GROWTH_LOOP_TEST_VISITOR_USER_ID=<second account uuid for signup/activation>
//   FINFOLD_GROWTH_LOOP_ENV_FILE=<optional path to env with SUPABASE_SERVICE_ROLE_KEY>
// Preconditions: migration 107 applied to the target database.
import { expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";

const live = process.env.FINFOLD_GROWTH_LOOP_LIVE === "1";

vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    // Only the session identity is pinned to the named test account; the
    // admin client stays real so every RPC runs against the actual database.
    getCurrentUserId: async () => {
      const userId = process.env.FINFOLD_GROWTH_LOOP_TEST_USER_ID;
      if (!userId) throw new Error("FINFOLD_GROWTH_LOOP_TEST_USER_ID is required");
      return userId;
    }
  };
});

const stubbedPlan = JSON.stringify({
  hypothesis: "展示可查看的成品案例，比只介绍功能更可能吸引目标用户完成首次保存（live 校验用固定假设）",
  primaryVariable: "message_angle",
  designType: "exploratory",
  variants: [
    { key: "A", angle: "功能介绍", workbenchIdea: "写一篇介绍产品能力清单的笔记，突出三个核心场景（live 校验固定文案）" },
    { key: "B", angle: "成品展示", workbenchIdea: "写一篇展示真实成品案例的笔记，引导读者查看可交互样例（live 校验固定文案）" }
  ],
  actions: [
    { variantKey: "A", type: "publish_post", channelRef: "selected_channel" },
    { variantKey: "B", type: "publish_post", channelRef: "selected_channel" }
  ],
  missingInputs: [],
  usedLearningIds: []
});

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  const useRealModel = process.env.FINFOLD_GROWTH_LOOP_LIVE_MODEL === "1";
  return {
    ...actual,
    sendRawPrompt: useRealModel
      ? actual.sendRawPrompt
      : vi.fn(async () => stubbedPlan)
  };
});

it.skipIf(!live)("runs goal → plan → approve → evidence → attribution → activation → review against the real database", async () => {
  if (process.env.FINFOLD_GROWTH_LOOP_ENV_FILE) process.loadEnvFile(process.env.FINFOLD_GROWTH_LOOP_ENV_FILE);
  const userId = process.env.FINFOLD_GROWTH_LOOP_TEST_USER_ID;
  const visitorUserId = process.env.FINFOLD_GROWTH_LOOP_TEST_VISITOR_USER_ID;
  if (!userId) throw new Error("FINFOLD_GROWTH_LOOP_TEST_USER_ID is required");

  const { createSupabaseAdminClient } = await import("@/lib/supabase");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the live check");

  // The evidence file proves what actually ran; per spec, missing pieces are
  // reported as blocked instead of being silently skipped.
  const evidence: Record<string, unknown> = {
    testedAt: new Date().toISOString(),
    mode: "local route handlers + RPCs against the real database",
    model: process.env.FINFOLD_GROWTH_LOOP_LIVE_MODEL === "1" ? "real" : "stubbed",
    migration107Applied: true,
    syntheticTestInputs: true
  };

  // Precondition: migration 107 objects exist (the db:check probe equivalent).
  const probe = await admin.from("growth_loop_goals").select("id").limit(1);
  if (probe.error && /PGRST205|42P01|42703/.test(probe.error.message ?? "")) {
    throw new Error(`Migration 107 is not applied to the target database yet: ${probe.error.message}`);
  }

  const created: { goalId?: string; missionId?: string; kitIds: string[]; visitorId?: string } = { kitIds: [] };
  const stage = (name: string) => console.info("[growth-loop-live]", name);

  try {
    stage("create goal");
    const { POST: createGoal } = await import("@/app/api/growth-loop/goals/route");
    const goalResponse = await createGoal(
      new Request("https://www.finfold.app/api/growth-loop/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `live 校验目标 ${new Date().toISOString().slice(0, 16)}`,
          landingUrl: "https://www.finfold.app/",
          targetValue: 3,
          endAt: new Date(Date.now() + 21 * 86400000).toISOString(),
          timezone: "Asia/Shanghai"
        })
      })
    );
    expect(goalResponse.status).toBe(201);
    const goal = (await goalResponse.json()).goal;
    created.goalId = goal.id;
    evidence.goal = { id: goal.id, status: goal.status };

    stage("plan experiment round");
    const { POST: planRound } = await import("@/app/api/growth-loop/goals/[goalId]/plan/route");
    const planRequest = () =>
      planRound(
        new Request(`https://www.finfold.app/api/growth-loop/goals/${goal.id}/plan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        }),
        { params: Promise.resolve({ goalId: goal.id }) }
      );
    // Local→Supabase keep-alive sockets die intermittently ("fetch failed").
    // The route refunds its billing reservation on failure, but the refund
    // rides the same flaky network, so the recovery path below clears a stuck
    // reservation, retries once, and finally resolves whatever actually got
    // persisted — it never weakens an assertion.
    let planBody: { missionId?: string } | null = null;
    let planResponse = await planRequest().catch(async (cause: unknown) => {
      console.log("[growth-loop-live] plan fetch threw, retrying:", cause instanceof Error ? cause.message : cause);
      return planRequest();
    });
    if (planResponse.status === 201) {
      planBody = await planResponse.json();
    } else {
      console.log("PLAN_FAIL_BODY", JSON.stringify(await planResponse.json()));
      const operationKey = `growth-plan:${goal.id}:1`;
      const { data: stuckOperation } = await admin
        .from("ai_usage_operations")
        .select("id, status")
        .eq("operation_key", operationKey)
        .maybeSingle();
      if (stuckOperation && ["reserved", "started"].includes(stuckOperation.status)) {
        const { refundAiUsageOperation } = await import("@/lib/payment");
        await refundAiUsageOperation(userId, stuckOperation.id, "live_check_retry").catch(() => undefined);
      }
      planResponse = await planRequest();
      if (planResponse.status === 201) {
        planBody = await planResponse.json();
      }
    }
    if (!planBody?.missionId) {
      // A half-finished attempt may already have created the mission.
      const { data: existingMission } = await admin
        .from("growth_missions")
        .select("id")
        .eq("goal_id", goal.id)
        .eq("user_id", userId)
        .eq("mission_kind", "growth_loop")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingMission) planBody = { missionId: existingMission.id };
    }
    expect(planBody?.missionId).toBeTruthy();
    created.missionId = planBody!.missionId;
    const { data: missionLinks } = await admin
      .from("tracking_links")
      .select("code, variant_key")
      .eq("mission_id", created.missionId)
      .eq("user_id", userId);
    expect(missionLinks).toHaveLength(2);
    evidence.mission = { id: created.missionId, trackingLinks: missionLinks };

    stage("approve variant A prepare action");
    const { data: actions } = await admin
      .from("mission_actions")
      .select("id, kind, status, input")
      .eq("mission_id", created.missionId)
      .eq("user_id", userId);
    const prepareA = actions?.find(
      (action: Record<string, unknown>) => action.kind === "prepare_execution_draft" && (action.input as Record<string, unknown>)?.variantKey === "A"
    );
    expect(prepareA).toBeDefined();
    const { POST: decideAction } = await import("@/app/api/growth-loop/missions/[missionId]/actions/[actionId]/decision/route");
    const approveResponse = await decideAction(
      new Request(`https://www.finfold.app/api/growth-loop/missions/${created.missionId}/actions/${prepareA!.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" })
      }),
      { params: Promise.resolve({ missionId: created.missionId as string, actionId: prepareA!.id }) }
    );
    expect(approveResponse.status).toBe(200);

    stage("bind synthetic drafts to both variants");
    const { POST: bindDraft } = await import("@/app/api/growth-loop/missions/[missionId]/variants/[variantKey]/draft/route");
    for (const variantKey of ["A", "B"]) {
      const kitId = crypto.randomUUID();
      const { error: kitError } = await admin.from("content_kits").insert({
        id: kitId,
        user_id: userId,
        idea_text: `live 校验草稿 ${variantKey}`,
        goal: "lead-gen",
        persona: "ai-saas",
        platforms: ["xiaohongshu"],
        media_assets: [],
        status: "saved",
        growth_mission_id: created.missionId
      });
      if (kitError) throw kitError;
      const { error: outputError } = await admin.from("kit_outputs").insert({
        id: crypto.randomUUID(),
        kit_id: kitId,
        user_id: userId,
        platform: "xiaohongshu",
        title: `live 校验标题 ${variantKey}`,
        body: "live 校验正文，用于哈希钉定验证",
        cta: "去看看",
        notes: "",
        strategy: "",
        locked: false,
        publish_status: "draft"
      });
      if (outputError) throw outputError;
      created.kitIds.push(kitId);
      const bindResponse = await bindDraft(
        new Request(`https://www.finfold.app/api/growth-loop/missions/${created.missionId}/variants/${variantKey}/draft`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kitId })
        }),
        { params: Promise.resolve({ missionId: created.missionId as string, variantKey }) }
      );
      expect(bindResponse.status).toBe(200);
    }

    stage("approve publish A and confirm publication evidence");
    const { data: publishActions } = await admin
      .from("mission_actions")
      .select("id, kind, status, input, payload_hash")
      .eq("mission_id", created.missionId)
      .eq("user_id", userId)
      .eq("kind", "review_and_publish");
    expect(publishActions).toHaveLength(2);
    const publishA = publishActions?.find(
      (action: Record<string, unknown>) => (action.input as Record<string, unknown>)?.variantKey === "A"
    );
    expect(publishA?.payload_hash).toMatch(/^[a-f0-9]{64}$/);

    const approvePublish = await decideAction(
      new Request(`https://www.finfold.app/api/growth-loop/missions/${created.missionId}/actions/${publishA!.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", payloadHash: publishA!.payload_hash })
      }),
      { params: Promise.resolve({ missionId: created.missionId as string, actionId: publishA!.id }) }
    );
    expect(approvePublish.status).toBe(200);

    const { POST: submitEvidence } = await import("@/app/api/growth-loop/missions/[missionId]/actions/[actionId]/evidence/route");
    const evidenceRequest = (payloadHash: string, url: string) =>
      submitEvidence(
        new Request(`https://www.finfold.app/api/growth-loop/missions/${created.missionId}/actions/${publishA!.id}/evidence`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variantKey: "A", evidenceUrl: url, executionMode: "manual", payloadHash })
        }),
        { params: Promise.resolve({ missionId: created.missionId as string, actionId: publishA!.id }) }
      );

    // T04: a stale hash must be rejected before any state change.
    const stale = await evidenceRequest("f".repeat(64), "https://www.xiaohongshu.com/explore/live-stale");
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Record<string, unknown>).code).toBe("APPROVAL_STALE");

    // Non-Xiaohongshu evidence is rejected by the schema layer.
    const wrongHost = await evidenceRequest(publishA!.payload_hash, "https://example.com/post");
    expect(wrongHost.status).toBe(400);

    const confirmed = await evidenceRequest(publishA!.payload_hash, "https://www.xiaohongshu.com/explore/live-check");
    expect(confirmed.status).toBe(200);
    const { data: confirmedAction } = await admin
      .from("mission_actions")
      .select("status, evidence_level, execution_mode, evidence_url")
      .eq("id", publishA!.id)
      .maybeSingle();
    expect(confirmedAction?.status).toBe("succeeded");
    expect(confirmedAction?.evidence_level).toBe("user_reported");
    expect(confirmedAction?.execution_mode).toBe("manual");
    evidence.publication = confirmedAction;

    const { data: missionRow } = await admin
      .from("growth_missions")
      .select("status, execution_state, measurement_started_at, measurement_due_at")
      .eq("id", created.missionId)
      .maybeSingle();
    expect(missionRow?.status).toBe("posted");
    expect(missionRow?.execution_state).toBe("measuring");
    expect(missionRow?.measurement_started_at).not.toBeNull();

    if (!visitorUserId) {
      evidence.attribution = { status: "blocked", reason: "FINFOLD_GROWTH_LOOP_TEST_VISITOR_USER_ID not provided" };
    } else {
      stage("simulate click → signup → activation through the real RPCs");
      const { data: linkA } = await admin
        .from("tracking_links")
        .select("id, code")
        .eq("mission_id", created.missionId)
        .eq("variant_key", "A")
        .maybeSingle();
      expect(linkA).toBeDefined();
      created.visitorId = crypto.randomUUID();

      const click = await admin.rpc("record_mission_tracking_click", {
        p_tracking_link_id: linkA!.id,
        p_visitor_id: created.visitorId
      });
      expect(click.error).toBeNull();

      const { hashOutcomeWebhookValue } = await import("@/lib/outcome-webhook");
      const subjectHash = await hashOutcomeWebhookValue(`finfold-user:${visitorUserId}`);
      const signup = await admin.rpc("ingest_native_attributed_outcome", {
        p_subject_user_id: visitorUserId,
        p_visitor_id: created.visitorId,
        p_event_type: "signup",
        p_provider_event_hash: subjectHash,
        p_external_ref_hash: null,
        p_value: 0,
        p_currency: "XXX",
        p_occurred_at: new Date().toISOString()
      });
      expect(signup.error).toBeNull();
      expect((signup.data as Record<string, unknown>).attributed).toBe(true);
      evidence.signup = signup.data;

      // T10: five replays must not create five activations.
      const activationResults: Array<Record<string, unknown>> = [];
      for (let index = 0; index < 5; index += 1) {
        const activation = await admin.rpc("record_native_activation_outcome", {
          p_subject_user_id: visitorUserId,
          p_is_test: true
        });
        expect(activation.error).toBeNull();
        activationResults.push(activation.data as Record<string, unknown>);
      }
      expect(activationResults.filter((result) => result.attributed === true)).toHaveLength(5);
      expect(activationResults.filter((result) => result.replayed === true)).toHaveLength(4);
      evidence.activation = { calls: 5, replays: 4 };

      const { data: activationEvents } = await admin
        .from("outcome_events")
        .select("event_type, metadata")
        .eq("mission_id", created.missionId)
        .eq("event_type", "activation");
      expect(activationEvents).toHaveLength(1);
      expect((activationEvents![0].metadata as Record<string, unknown>).isTest).toBe(true);
    }

    stage("review snapshot (test events must stay out of real counts)");
    const { computeMissionReviewSnapshot } = await import("@/lib/growth-loop/reviewer");
    const { snapshot } = await computeMissionReviewSnapshot(admin, userId, created.missionId as string);
    evidence.snapshot = snapshot;
    const variantA = snapshot.variants.find((variant) => variant.key === "A");
    expect(variantA?.distinctClickVisitors).toBe(visitorUserId ? 1 : 0);
    // The activation was written with isTest=true, so the real count is 0 —
    // the live check itself verifies that test isolation holds end to end.
    expect(variantA?.activations).toBe(0);

    stage("evidence file");
    await mkdir("artifacts/growth-loop", { recursive: true });
    await writeFile("artifacts/growth-loop/live-check.json", JSON.stringify(evidence, null, 2), "utf8");
    console.info("[growth-loop-live] evidence written to artifacts/growth-loop/live-check.json");
  } finally {
    stage("cleanup");
    if (created.missionId) {
      await admin.from("growth_missions").delete().eq("id", created.missionId).eq("user_id", userId);
    }
    if (created.goalId) {
      await admin.from("growth_loop_goals").delete().eq("id", created.goalId).eq("user_id", userId);
    }
    for (const kitId of created.kitIds) {
      await admin.from("kit_outputs").delete().eq("kit_id", kitId).eq("user_id", userId);
      await admin.from("content_kits").delete().eq("id", kitId).eq("user_id", userId);
    }
    if (visitorUserId) {
      await admin.from("native_outcome_attributions").delete().eq("subject_user_id", visitorUserId);
    }
    if (created.goalId) {
      await admin.from("growth_learnings").delete().eq("goal_id", created.goalId).eq("user_id", userId);
      await admin
        .from("ai_usage_operations")
        .delete()
        .eq("user_id", userId)
        .like("operation_key", `growth-plan:${created.goalId}%`);
    }
  }
}, 600_000);
