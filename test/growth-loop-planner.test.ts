import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  sendRawPrompt: vi.fn()
}));

vi.mock("@/lib/llm", () => ({ sendRawPrompt: mock.sendRawPrompt }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mock.from, rpc: mock.rpc }) }));

import {
  ExperimentPlanError,
  generateExperimentPlan,
  materializeExperiment
} from "@/lib/growth-loop/planner";
import { computeKitPayloadHash } from "@/lib/growth-loop/policy";
import type { GrowthLoopGoalRow } from "@/lib/growth-loop/contracts";

const userId = "11111111-1111-4111-8111-111111111111";
const learningId = "44444444-4444-4444-8444-444444444444";

const goal: GrowthLoopGoalRow = {
  id: "55555555-5555-4555-8555-555555555555",
  user_id: userId,
  title: "为 Finfold 获得新的有效激活用户",
  objective_type: "qualified_activations",
  metric_definition: {},
  metric_definition_version: "activation-v1",
  landing_url: "https://www.finfold.app/",
  channel_platform: "xiaohongshu",
  target_value: 10,
  start_at: "2026-09-17T00:00:00.000Z",
  end_at: "2026-10-15T00:00:00.000Z",
  timezone: "Asia/Shanghai",
  status: "active",
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z"
};

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

type TableState = { data?: unknown; error?: unknown; count?: number; insertData?: unknown };

type QueryRecord = {
  table: string;
  filters: Array<[string, unknown]>;
  insert?: unknown;
  update?: unknown;
  fromInsert?: boolean;
};

function makeAdmin(tables: Record<string, TableState> = {}) {
  const queries: QueryRecord[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const admin = {
    from(table: string) {
      const state = tables[table] ?? {};
      const record: QueryRecord = { table, filters: [] };
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
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { data: tables.__rpc?.data ?? null, error: tables.__rpc?.error ?? null };
    }
  };
  return { admin, queries, rpcCalls };
}

function planningTables() {
  return {
    brand_brains: { data: { brand_name: "Finfold", product_description: "增长工具", target_audience: "AI 团队", positioning_statement: null, tone_keywords: ["务实"] } },
    growth_learnings: { data: [{ id: learningId, statement: "成品展示角度更值得继续检验", applicable_conditions: "小红书", limitations: "样本少" }] },
    growth_missions: { data: null }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockReset();
});

describe("generateExperimentPlan (T03)", () => {
  it("parses a valid plan and injects accepted learnings", async () => {
    mock.sendRawPrompt.mockResolvedValue(validPlanJson);
    const { admin } = makeAdmin(planningTables());
    const result = await generateExperimentPlan(admin as never, userId, goal);

    expect(result.plan.variants).toHaveLength(2);
    expect(result.contextDigest.injectedLearningCount).toBe(1);
    const prompt = mock.sendRawPrompt.mock.calls[0][0] as string;
    expect(prompt).toContain(learningId);
    expect(prompt).toContain("不得虚构客户案例");
  });

  it("repairs an invalid output exactly once, then fails closed", async () => {
    mock.sendRawPrompt
      .mockResolvedValueOnce("这不是 JSON")
      .mockResolvedValueOnce(validPlanJson);
    const { admin } = makeAdmin(planningTables());
    const repaired = await generateExperimentPlan(admin as never, userId, goal);
    expect(repaired.plan.variants).toHaveLength(2);
    expect(mock.sendRawPrompt).toHaveBeenCalledTimes(2);

    mock.sendRawPrompt.mockReset();
    mock.sendRawPrompt
      .mockResolvedValueOnce("still not json")
      .mockResolvedValueOnce("again not json");
    await expect(generateExperimentPlan(admin as never, userId, goal)).rejects.toMatchObject({
      name: "ExperimentPlanError",
      code: "invalid_model_output"
    });
    expect(mock.sendRawPrompt).toHaveBeenCalledTimes(2);
  });

  it("rejects plans referencing learnings the server never supplied", async () => {
    const fabricated = JSON.parse(validPlanJson);
    fabricated.usedLearningIds = ["66666666-6666-4666-8666-666666666666"];
    mock.sendRawPrompt.mockResolvedValue(JSON.stringify(fabricated));
    const { admin } = makeAdmin(planningTables());
    await expect(generateExperimentPlan(admin as never, userId, goal)).rejects.toMatchObject({
      code: "invalid_plan_reference"
    });
  });
});

describe("materializeExperiment", () => {
  it("creates the mission with a plan snapshot, per-variant actions, and variant tracking links", async () => {
    mock.sendRawPrompt.mockResolvedValue(validPlanJson);
    const { admin, queries, rpcCalls } = makeAdmin({
      ...planningTables(),
      growth_missions: { data: null, insertData: { id: "new-mission" } },
      __rpc: { data: false }
    });
    const result = await generateExperimentPlan(admin as never, userId, goal);
    const materialized = await materializeExperiment(admin as never, userId, goal, result, {
      appUrl: "https://www.finfold.app"
    });

    expect(materialized.trackingLinks.map((link) => link.variantKey).sort()).toEqual(["A", "B"]);
    const missionInsert = queries
      .filter((query) => query.table === "growth_missions")
      .find((query) => query.insert !== undefined)?.insert as Record<string, unknown>;
    expect(missionInsert.mission_kind).toBe("growth_loop");
    expect(missionInsert.goal_id).toBe(goal.id);
    expect((missionInsert.plan as Record<string, unknown>).planVersion).toBe(1);
    expect(missionInsert.design_type).toBe("exploratory");

    const actionInsert = queries
      .filter((query) => query.table === "mission_actions")
      .find((query) => query.insert !== undefined)?.insert as Array<Record<string, unknown>>;
    expect(actionInsert).toHaveLength(2);
    expect(actionInsert.map((action) => (action.input as Record<string, unknown>).variantKey).sort()).toEqual(["A", "B"]);

    const linkRpc = rpcCalls.filter((call) => call.name === "upsert_mission_tracking_link");
    expect(linkRpc).toHaveLength(2);
    expect(linkRpc[0].args.p_user_id).toBe(userId);
    expect(["A", "B"]).toContain(linkRpc[0].args.p_variant_key);
  });

  it("refuses to plan while another experiment for the goal is active", async () => {
    const { admin } = makeAdmin({
      ...planningTables(),
      growth_missions: { data: [{ id: "existing-mission" }] }
    });
    mock.sendRawPrompt.mockResolvedValue(validPlanJson);
    const result = await generateExperimentPlan(admin as never, userId, goal);
    await expect(
      materializeExperiment(admin as never, userId, goal, result, { appUrl: "https://www.finfold.app" })
    ).rejects.toMatchObject({ code: "active_mission_exists" });
  });
});

describe("computeKitPayloadHash (T04 pinning primitive)", () => {
  const kit = {
    id: "kit-1",
    outputs: [
      { platform: "xiaohongshu", title: "标题", body: "正文 A", cta: "去看看" }
    ]
  };

  it("is stable across key order and changes when content changes", () => {
    const first = computeKitPayloadHash(kit);
    const reordered = computeKitPayloadHash({
      id: "kit-1",
      outputs: [{ cta: "去看看", body: "正文 A", title: "标题", platform: "xiaohongshu" }]
    });
    expect(reordered).toBe(first);

    const edited = computeKitPayloadHash({
      id: "kit-1",
      outputs: [{ platform: "xiaohongshu", title: "标题", body: "正文 B（已修改）", cta: "去看看" }]
    });
    expect(edited).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
