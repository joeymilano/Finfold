import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  userId: "11111111-1111-4111-8111-111111111111" as string | Promise<never>,
  sendRawPrompt: vi.fn(),
  billing: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: () => mock.userId,
  createSupabaseAdminClient: () => ({ from: mock.from, rpc: mock.rpc })
}));
vi.mock("@/lib/llm", () => ({ sendRawPrompt: mock.sendRawPrompt }));
vi.mock("@/lib/payment/ai-usage-billing", () => ({ createAiUsageBilling: mock.billing }));

import { POST as createGoal } from "@/app/api/growth-loop/goals/route";
import { POST as planRound } from "@/app/api/growth-loop/goals/[goalId]/plan/route";
import { POST as decideAction } from "@/app/api/growth-loop/missions/[missionId]/actions/[actionId]/decision/route";
import { POST as submitEvidence } from "@/app/api/growth-loop/missions/[missionId]/actions/[actionId]/evidence/route";
import { POST as bindDraft } from "@/app/api/growth-loop/missions/[missionId]/variants/[variantKey]/draft/route";
import { POST as runReview } from "@/app/api/growth-loop/missions/[missionId]/review/route";

const userId = "11111111-1111-4111-8111-111111111111";
const goalId = "55555555-5555-4555-8555-555555555555";
const missionId = "77777777-7777-4777-8777-777777777777";
const actionId = "88888888-8888-4888-8888-888888888888";

const goalRow = {
  id: goalId,
  user_id: userId,
  title: "为 Finfold 获得新的有效激活用户",
  objective_type: "qualified_activations",
  metric_definition: {},
  metric_definition_version: "activation-v1",
  landing_url: "https://www.finfold.app/",
  channel_platform: "xiaohongshu",
  target_value: 10,
  start_at: "2026-09-17T00:00:00.000Z",
  end_at: new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString(),
  timezone: "Asia/Shanghai",
  status: "active",
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z"
};

type QueryRecord = { table: string; filters: Array<[string, unknown]>; insert?: unknown; update?: unknown };

function makeFrom(tables: Record<string, { data?: unknown; error?: unknown; count?: number; insertData?: unknown }> = {}) {
  const queries: QueryRecord[] = [];
  mock.from.mockImplementation((table: string) => {
    const state = tables[table] ?? {};
    const record: QueryRecord & { fromInsert?: boolean } = { table, filters: [] };
    queries.push(record);
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        record.filters.push([column, value]);
        return q;
      },
      in: (column: string, value: unknown) => {
        record.filters.push([column, value]);
        return q;
      },
      or: (clause: string) => {
        record.filters.push(["or", clause]);
        return q;
      },
      lte: () => q,
      gte: () => q,
      contains: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: state.data ?? null, error: state.error ?? null }),
      single: async () => ({
        data: record.fromInsert ? (state.insertData ?? state.data ?? null) : state.data ?? null,
        error: state.error ?? null
      }),
      insert: (value: unknown) => {
        record.insert = value;
        record.fromInsert = true;
        return q;
      },
      upsert: (value: unknown) => {
        record.insert = value;
        return q;
      },
      update: (value: unknown) => {
        record.update = value;
        return q;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.data ?? null, error: state.error ?? null, count: state.count ?? 0 }).then(resolve)
    };
    return q;
  });
  return queries;
}

function enablePilot() {
  vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
  vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "open");
}

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const validPlanJson = JSON.stringify({
  hypothesis: "展示可查看的成品案例，比只介绍功能更可能吸引目标用户完成首次保存",
  primaryVariable: "message_angle",
  designType: "exploratory",
  variants: [
    { key: "A", angle: "功能介绍", workbenchIdea: "写一篇介绍产品能力清单的笔记，突出三个核心场景" },
    { key: "B", angle: "成品展示", workbenchIdea: "写一篇展示真实成品案例的笔记，引导读者查看可交互样例" }
  ],
  actions: [
    { variantKey: "A", type: "publish_post", channelRef: "selected_channel" },
    { variantKey: "B", type: "publish_post", channelRef: "selected_channel" }
  ],
  missingInputs: [],
  usedLearningIds: []
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mock.userId = userId;
  mock.rpc.mockResolvedValue({ data: { result: "approved" }, error: null });
  mock.sendRawPrompt.mockResolvedValue(validPlanJson);
  mock.billing.mockReturnValue({
    reserveAndStart: async () => ({ outcome: "authorized", operationId: "op", available: 10 }),
    settle: async () => undefined,
    refund: async () => undefined
  });
});

describe("feature gate on routes (T15)", () => {
  it("returns 403 for every growth-loop route while the pilot is off", async () => {
    makeFrom();
    const responses = await Promise.all([
      createGoal(jsonRequest("https://www.finfold.app/api/growth-loop/goals", { title: "增长目标", landingUrl: "https://www.finfold.app/", targetValue: 5, endAt: new Date(Date.now() + 86400000).toISOString() })),
      decideAction(jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/decision`, { decision: "approve" }), { params: Promise.resolve({ missionId, actionId }) }),
      runReview(jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/review`, {}), { params: Promise.resolve({ missionId }) })
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
  });

  it("returns 401 without a session even when the pilot is open", async () => {
    enablePilot();
    makeFrom();
    mock.userId = Promise.reject(new Error("Unauthorized"));
    const response = await createGoal(jsonRequest("https://www.finfold.app/api/growth-loop/goals", { title: "增长目标", landingUrl: "https://www.finfold.app/", targetValue: 5, endAt: new Date(Date.now() + 86400000).toISOString() }));
    expect(response.status).toBe(401);
  });
});

describe("goal creation", () => {
  it("stores the goal under the session user and rejects private-network landing pages", async () => {
    enablePilot();
    const queries = makeFrom({ growth_loop_goals: { data: goalRow } });
    const response = await createGoal(
      jsonRequest("https://www.finfold.app/api/growth-loop/goals", {
        title: "为 Finfold 获得新的有效激活用户",
        landingUrl: "https://www.finfold.app/",
        targetValue: 10,
        endAt: new Date(Date.now() + 28 * 86400000).toISOString()
      })
    );
    expect(response.status).toBe(201);
    const insert = queries.find((query) => query.table === "growth_loop_goals")?.insert as Record<string, unknown>;
    expect(insert.user_id).toBe(userId);
    expect(insert.objective_type).toBe("qualified_activations");

    const privateResponse = await createGoal(
      jsonRequest("https://www.finfold.app/api/growth-loop/goals", {
        title: "内网目标不该被追踪",
        landingUrl: "http://192.168.1.5/",
        targetValue: 10,
        endAt: new Date(Date.now() + 28 * 86400000).toISOString()
      })
    );
    expect(privateResponse.status).toBe(400);
  });
});

describe("experiment planning", () => {
  it("bills one idempotent operation and materializes the round", async () => {
    enablePilot();
    makeFrom({
      growth_loop_goals: { data: goalRow },
      brand_brains: { data: null },
      growth_learnings: { data: [] },
      growth_missions: { data: null, count: 0, insertData: { id: missionId } },
      mission_actions: { data: [] }
    });
    const response = await planRound(jsonRequest(`https://www.finfold.app/api/growth-loop/goals/${goalId}/plan`, {}), {
      params: Promise.resolve({ goalId })
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.trackingLinks).toHaveLength(2);
    expect(mock.billing).toHaveBeenCalledWith(
      expect.objectContaining({ userId, cost: 1, source: "growth_loop", operationKey: `growth-plan:${goalId}:1` })
    );
  });

  it("refunds the reservation when the model fails twice (T03: no unbounded burn)", async () => {
    enablePilot();
    makeFrom({
      growth_loop_goals: { data: goalRow },
      brand_brains: { data: null },
      growth_learnings: { data: [] },
      growth_missions: { data: null, count: 0 }
    });
    mock.sendRawPrompt.mockResolvedValue("不是 JSON");
    const refund = vi.fn().mockResolvedValue(undefined);
    mock.billing.mockReturnValue({
      reserveAndStart: async () => ({ outcome: "authorized", operationId: "op", available: 10 }),
      settle: async () => undefined,
      refund
    });
    const response = await planRound(jsonRequest(`https://www.finfold.app/api/growth-loop/goals/${goalId}/plan`, {}), {
      params: Promise.resolve({ goalId })
    });
    expect(response.status).toBe(502);
    expect(refund).toHaveBeenCalledWith("growth_plan_failed");
  });

  it("returns 402 without spending when credits are insufficient", async () => {
    enablePilot();
    makeFrom({ growth_loop_goals: { data: goalRow } });
    mock.billing.mockReturnValue({
      reserveAndStart: async () => ({ outcome: "insufficient_credits", available: 0 }),
      settle: async () => undefined,
      refund: async () => undefined
    });
    const response = await planRound(jsonRequest(`https://www.finfold.app/api/growth-loop/goals/${goalId}/plan`, {}), {
      params: Promise.resolve({ goalId })
    });
    expect(response.status).toBe(402);
  });
});

describe("approval decisions (T04/T05: hash pinning, RPC-level idempotency)", () => {
  it("pins the payload hash and scopes the RPC to the session user", async () => {
    enablePilot();
    makeFrom({
      mission_actions: {
        data: { id: actionId, kind: "review_and_publish", input: { variantKey: "A" } }
      }
    });
    const payloadHash = "a".repeat(64);
    const response = await decideAction(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/decision`, {
        decision: "approve",
        payloadHash
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(
      "apply_mission_action_decision",
      expect.objectContaining({ p_user_id: userId, p_action_id: actionId, p_payload_hash: payloadHash })
    );
  });

  it("returns 404 before calling the RPC when the action is missing", async () => {
    enablePilot();
    makeFrom();
    const response = await decideAction(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/decision`, {
        decision: "approve"
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(response.status).toBe(404);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed payload hashes at the schema layer", async () => {
    enablePilot();
    makeFrom({ mission_actions: { data: { id: actionId, kind: "review_and_publish", input: {} } } });
    const response = await decideAction(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/decision`, {
        decision: "approve",
        payloadHash: "not-a-hash"
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("publication evidence (T07: user_reported only)", () => {
  const evidenceUrl = "https://www.xiaohongshu.com/explore/abc123";

  it("delegates to the confirm RPC with the session user and mode", async () => {
    enablePilot();
    makeFrom();
    const response = await submitEvidence(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/evidence`, {
        variantKey: "A",
        evidenceUrl,
        executionMode: "manual",
        payloadHash: "b".repeat(64)
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(
      "confirm_mission_publication",
      expect.objectContaining({ p_user_id: userId, p_evidence_url: evidenceUrl, p_execution_mode: "manual" })
    );
  });

  it("maps stale approvals to 409 APPROVAL_STALE", async () => {
    enablePilot();
    makeFrom();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "Approval is stale: the approved content version no longer matches." } });
    const response = await submitEvidence(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/evidence`, {
        variantKey: "A",
        evidenceUrl,
        executionMode: "manual",
        payloadHash: "b".repeat(64)
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "APPROVAL_STALE" });
  });

  it("rejects non-xiaohongshu or non-https evidence URLs and api execution mode at the schema layer", async () => {
    enablePilot();
    makeFrom();
    const wrongHost = await submitEvidence(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/evidence`, {
        variantKey: "A",
        evidenceUrl: "https://example.com/post",
        executionMode: "manual",
        payloadHash: "b".repeat(64)
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(wrongHost.status).toBe(400);

    const apiMode = await submitEvidence(
      jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/actions/${actionId}/evidence`, {
        variantKey: "A",
        evidenceUrl,
        executionMode: "api",
        payloadHash: "b".repeat(64)
      }),
      { params: Promise.resolve({ missionId, actionId }) }
    );
    expect(apiMode.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("variant draft binding (publish actions pin per-variant hashes)", () => {
  const kitB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const kitA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function bindingTables() {
    return {
      growth_missions: {
        data: {
          id: missionId,
          user_id: userId,
          goal_id: null,
          status: "accepted",
          plan: { variants: [{ key: "A", kitId: kitA }, { key: "B" }] }
        }
      },
      content_kits: { data: { id: kitB, user_id: userId, status: "saved" } },
      kit_outputs: {
        data: [{ platform: "xiaohongshu", title: "标题", body: "正文", cta: "去看看" }]
      },
      mission_actions: { data: [] }
    };
  }

  it("creates per-variant publish actions that each carry a content hash", async () => {
    enablePilot();
    const queries = makeFrom(bindingTables());
    const response = await bindDraft(
      new Request(`https://www.finfold.app/api/growth-loop/missions/${missionId}/variants/B/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kitId: kitB })
      }),
      { params: Promise.resolve({ missionId, variantKey: "B" }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.allBound).toBe(true);
    expect(body.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const publishUpsert = queries
      .filter((query) => query.table === "mission_actions")
      .find((query) => Array.isArray(query.insert))?.insert as Array<Record<string, unknown>>;
    expect(publishUpsert).toHaveLength(2);
    for (const action of publishUpsert) {
      expect(action.kind).toBe("review_and_publish");
      expect(action.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    }
    // Both variants get hashes computed from their own current outputs.
    expect(new Set(publishUpsert.map((action) => action.payload_hash)).size).toBe(2);
  });

  it("rejects binding a preview kit that was never saved to the library", async () => {
    enablePilot();
    makeFrom({ ...bindingTables(), content_kits: { data: { id: kitB, user_id: userId, status: "preview" } } });
    const response = await bindDraft(
      new Request(`https://www.finfold.app/api/growth-loop/missions/${missionId}/variants/B/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kitId: kitB })
      }),
      { params: Promise.resolve({ missionId, variantKey: "B" }) }
    );
    expect(response.status).toBe(409);
  });
});

describe("mission review", () => {
  function measuringTables() {
    return {
      growth_missions: {
        data: {
          id: missionId,
          user_id: userId,
          goal_id: goalId,
          status: "posted",
          execution_state: "measuring",
          measurement_started_at: "2026-09-01T00:00:00.000Z",
          measurement_due_at: "2026-09-15T00:00:00.000Z",
          measurement_window_days: 14,
          plan: {},
          variants: [{ key: "A" }, { key: "B" }]
        }
      },
      tracking_links: { data: [] },
      outcome_events: { data: [] },
      profiles: { count: 0, data: [] },
      ai_usage_operations: { data: [] },
      growth_learnings: { count: 0, data: [] }
    };
  }

  it("bills per review version and stores the learning candidate", async () => {
    enablePilot();
    makeFrom(measuringTables());
    mock.sendRawPrompt.mockResolvedValue(
      JSON.stringify({
        conclusion: "insufficient_data",
        narrative: "当前样本还太少，两个变体都处于观察早期，建议继续等待更多可归因注册与激活后再比较方向，不据此判断因果关系。",
        suggestedLearning: {
          statement: "在本次品牌、渠道和窗口内，成品展示角度值得下一轮继续检验",
          applicableConditions: "小红书",
          limitations: "非随机曝光且样本很少"
        }
      })
    );
    const response = await runReview(jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/review`, {}), {
      params: Promise.resolve({ missionId })
    });
    expect(response.status).toBe(200);
    expect(mock.billing).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: `growth-review:${missionId}:1`, cost: 1 })
    );
  });

  it("replays an already-settled review version as 409 instead of re-billing", async () => {
    enablePilot();
    makeFrom(measuringTables());
    mock.billing.mockReturnValue({
      reserveAndStart: async () => ({ outcome: "existing", operationId: "op", status: "settled", available: 10 }),
      settle: async () => undefined,
      refund: async () => undefined
    });
    const response = await runReview(jsonRequest(`https://www.finfold.app/api/growth-loop/missions/${missionId}/review`, {}), {
      params: Promise.resolve({ missionId })
    });
    expect(response.status).toBe(409);
    expect(mock.sendRawPrompt).not.toHaveBeenCalled();
  });
});
