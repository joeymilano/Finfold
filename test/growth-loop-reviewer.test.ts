import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  sendRawPrompt: vi.fn()
}));

vi.mock("@/lib/llm", () => ({ sendRawPrompt: mock.sendRawPrompt }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mock.from }) }));

import {
  computeMissionReviewSnapshot,
  runMissionReview,
  MissionReviewError
} from "@/lib/growth-loop/reviewer";

const userId = "11111111-1111-4111-8111-111111111111";
const missionId = "77777777-7777-4777-8777-777777777777";
const goalId = "55555555-5555-4555-8555-555555555555";
const linkA = "aaaaaaaa-0000-4000-8000-00000000000a";
const linkB = "aaaaaaaa-0000-4000-8000-00000000000b";

type ReviewFilter = { column: string; value: unknown; op: "eq" | "in" | "or" | "lte" | "gte" };
type ReviewQueryRecord = {
  table: string;
  filters: ReviewFilter[];
  insert?: unknown;
  update?: unknown;
  fromInsert?: boolean;
};
type TableState = { data?: unknown; error?: unknown; count?: number | null; insertData?: unknown };

function makeAdmin(tables: Record<string, TableState> = {}) {
  const queries: ReviewQueryRecord[] = [];
  const admin = {
    from(table: string) {
      const state = tables[table] ?? {};
      const record: ReviewQueryRecord = { table, filters: [] };
      queries.push(record);
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value, op: "eq" });
          return q;
        },
        in: (column: string, value: unknown) => {
          record.filters.push({ column, value, op: "in" });
          return q;
        },
        or: (clause: string) => {
          record.filters.push({ column: "or", value: clause, op: "or" });
          return q;
        },
        lte: (column: string, value: unknown) => {
          record.filters.push({ column, value, op: "lte" });
          return q;
        },
        gte: (column: string, value: unknown) => {
          record.filters.push({ column, value, op: "gte" });
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
        update: (value: unknown) => {
          record.update = value;
          return q;
        },
        // The mock applies the semantics the production query encodes: eq/in
        // equality, occurred_at window bounds, and the isTest exclusion.
        then: (resolve: (value: unknown) => unknown) => {
          let rows = Array.isArray(state.data) ? [...(state.data as Array<Record<string, unknown>>)] : [];
          for (const filter of record.filters) {
            if (filter.op === "or" && typeof filter.value === "string" && filter.value.includes("metadata->>isTest")) {
              rows = rows.filter((row) => {
                const metadata = row.metadata as Record<string, unknown> | null | undefined;
                return !metadata || metadata.isTest !== true;
              });
            } else if (filter.op === "eq") {
              if (filter.column.includes("->>")) {
                const [holder, key] = filter.column.split("->>");
                rows = rows.filter((row) => {
                  const holderValue = row[holder] as Record<string, unknown> | null | undefined;
                  return holderValue?.[key] === filter.value;
                });
              } else {
                rows = rows.filter((row) => row[filter.column] === filter.value);
              }
            } else if (filter.op === "in") {
              const allowed = filter.value as unknown[];
              rows = rows.filter((row) => allowed.includes(row[filter.column] as unknown));
            } else if (filter.op === "lte") {
              rows = rows.filter((row) => String(row[filter.column]) <= String(filter.value));
            } else if (filter.op === "gte") {
              rows = rows.filter((row) => String(row[filter.column]) >= String(filter.value));
            }
          }
          return Promise.resolve({
            data: Array.isArray(state.data) ? rows : state.data ?? null,
            error: state.error ?? null,
            count: state.count ?? rows.length
          }).then(resolve);
        }
      };
      return q;
    }
  };
  return { admin, queries };
}

function measuringMissionTables(events: unknown[], options: { sitewide?: number; startedAt?: string | null } = {}) {
  return {
    growth_missions: {
      data: {
        id: missionId,
        user_id: userId,
        goal_id: goalId,
        status: "posted",
        execution_state: "measuring",
        measurement_started_at: options.startedAt ?? "2026-09-01T00:00:00.000Z",
        measurement_due_at: "2026-09-15T00:00:00.000Z",
        measurement_window_days: 14,
        plan: {},
        variants: [{ key: "A" }, { key: "B" }]
      }
    },
    tracking_links: {
      data: [
        { id: linkA, mission_id: missionId, user_id: userId, variant_key: "A" },
        { id: linkB, mission_id: missionId, user_id: userId, variant_key: "B" }
      ]
    },
    outcome_events: { data: events },
    profiles: { count: options.sitewide ?? null, data: [] },
    ai_usage_operations: {
      data: [
        { user_id: userId, source: "growth_loop", status: "settled", cost: 2, detail: { goalId } },
        { user_id: userId, source: "growth_loop", status: "started", cost: 1, detail: { goalId } }
      ]
    }
  };
}

const validNarrativeJson = JSON.stringify({
  conclusion: "insufficient_data",
  narrative: "目前样本量太小，两个变体的观察都还在早期。建议继续观察一段时间，等待更多可归因注册与激活后再比较两个角度的方向。不据此判断因果关系。",
  suggestedLearning: {
    statement: "在本次品牌、渠道和窗口内，成品展示角度值得下一轮继续检验",
    applicableConditions: "小红书渠道、内容获客场景",
    limitations: "非随机曝光且样本很少"
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeMissionReviewSnapshot (T10/T12: dedupe by subject, null ratios)", () => {
  it("counts per variant, excludes test events, and nulls zero-denominator ratios", async () => {
    const events = [
      // Variant A: 2 distinct click visitors, 1 signup, 1 activation
      { event_type: "click", mission_id: missionId, user_id: userId, source: "xiaohongshu", tracking_link_id: linkA, visitor_id: "v1", occurred_at: "2026-09-02T00:00:00.000Z", metadata: null },
      { event_type: "click", mission_id: missionId, user_id: userId, source: "xiaohongshu", tracking_link_id: linkA, visitor_id: "v2", occurred_at: "2026-09-02T01:00:00.000Z", metadata: null },
      { event_type: "click", mission_id: missionId, user_id: userId, source: "xiaohongshu", tracking_link_id: linkA, visitor_id: "v1", occurred_at: "2026-09-02T02:00:00.000Z", metadata: null },
      { event_type: "signup", mission_id: missionId, user_id: userId, source: "finfold-native-signup", tracking_link_id: linkA, visitor_id: "v1", occurred_at: "2026-09-03T00:00:00.000Z", metadata: null },
      { event_type: "activation", mission_id: missionId, user_id: userId, source: "finfold-first-save", tracking_link_id: linkA, visitor_id: "v1", occurred_at: "2026-09-04T00:00:00.000Z", metadata: null },
      // Variant B: 1 click, nothing else → ratios null
      { event_type: "click", mission_id: missionId, user_id: userId, source: "xiaohongshu", tracking_link_id: linkB, visitor_id: "v3", occurred_at: "2026-09-02T03:00:00.000Z", metadata: null },
      // Test events must never reach real counts (T10)
      { event_type: "signup", mission_id: missionId, user_id: userId, source: "finfold-native-signup", tracking_link_id: linkB, visitor_id: "v-test", occurred_at: "2026-09-03T00:00:00.000Z", metadata: { isTest: true } },
      { event_type: "activation", mission_id: missionId, user_id: userId, source: "finfold-first-save", tracking_link_id: linkB, visitor_id: "v-test", occurred_at: "2026-09-03T01:00:00.000Z", metadata: { isTest: true } },
      // Events after asOf are excluded (frozen snapshot)
      { event_type: "signup", mission_id: missionId, user_id: userId, source: "finfold-native-signup", tracking_link_id: linkB, visitor_id: "v4", occurred_at: "2026-09-20T00:00:00.000Z", metadata: null }
    ];
    const { admin } = makeAdmin(measuringMissionTables(events, { sitewide: 5 }));
    const { snapshot } = await computeMissionReviewSnapshot(admin as never, userId, missionId, new Date("2026-09-10T00:00:00.000Z"));
    const variantA = snapshot.variants.find((variant) => variant.key === "A");
    const variantB = snapshot.variants.find((variant) => variant.key === "B");
    expect(variantA).toMatchObject({ distinctClickVisitors: 2, attributedSignups: 1, activations: 1 });
    expect(variantB).toMatchObject({ distinctClickVisitors: 1, attributedSignups: 0, activations: 0 });
    expect(snapshot.totals).toMatchObject({ distinctClickVisitors: 3, attributedSignups: 1, activations: 1, sitewideSignupsInWindow: 5, unattributedSignups: 4 });
    // 1 signup / 3 click visitors is computable; activation ratio 1/1 is fine;
    // cost per activation = 3 credits / 1 activation.
    expect(snapshot.ratios.clickToSignup).toBeCloseTo(1 / 3);
    expect(snapshot.ratios.costPerActivationCredits).toBe(3);
    expect(snapshot.limitations.join(" ")).toContain("非随机曝光");
  });

  it("returns null ratios when denominators are zero (T12)", async () => {
    const { admin } = makeAdmin(measuringMissionTables([], { sitewide: 0 }));
    const { snapshot } = await computeMissionReviewSnapshot(admin as never, userId, missionId);
    expect(snapshot.ratios).toEqual({ clickToSignup: null, signupToActivation: null, costPerActivationCredits: null });
    expect(snapshot.totals.sitewideSignupsInWindow).toBe(0);
  });
});

describe("runMissionReview (T13/T14 source, model explains only)", () => {
  it("appends versioned review history and creates a candidate learning with evidence", async () => {
    mock.sendRawPrompt.mockResolvedValue(validNarrativeJson);
    const events = [
      { event_type: "click", mission_id: missionId, user_id: userId, source: "xiaohongshu", tracking_link_id: linkA, visitor_id: "v1", occurred_at: "2026-09-02T00:00:00.000Z", metadata: null }
    ];
    const { admin, queries } = makeAdmin({
      ...measuringMissionTables(events, { sitewide: 2 }),
      growth_learnings: { count: 0, data: [], insertData: { id: "learn-1" } }
    });
    const result = await runMissionReview(admin as never, userId, missionId);

    expect(result.conclusion).toBe("insufficient_data");
    expect(result.reviewVersion).toBe(1);
    const missionUpdate = queries
      .filter((query) => query.table === "growth_missions")
      .find((query) => query.update !== undefined)?.update as Record<string, unknown>;
    const history = (missionUpdate.plan as Record<string, unknown>).reviewHistory as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ reviewVersion: 1, conclusion: "insufficient_data" });
    expect(history[0].asOf).toBe(result.snapshot.asOf);

    const learningInsert = queries
      .filter((query) => query.table === "growth_learnings")
      .find((query) => query.insert !== undefined)?.insert as Record<string, unknown>;
    expect(learningInsert.status).toBe("candidate");
    expect(learningInsert.user_id).toBe(userId);
    expect((learningInsert.evidence as Record<string, unknown>).attributionRuleVersion).toBe("last-click-90d-frozen-v1");

    // The prompt injects server-computed numbers and forbids model arithmetic.
    const prompt = mock.sendRawPrompt.mock.calls[0][0] as string;
    expect(prompt).toContain("不得计算新数字");
    expect(prompt).toContain("独立点击访客 1");
  });

  it("replaces narratives that invent percentages with a factual fallback (T13)", async () => {
    const inventing = JSON.parse(validNarrativeJson);
    inventing.narrative = "变体 B 的激活提升了 37%，证明假设成立";
    mock.sendRawPrompt.mockResolvedValue(JSON.stringify(inventing));
    const { admin } = makeAdmin({
      ...measuringMissionTables([], { sitewide: 0 }),
      growth_learnings: { count: 0, data: [], insertData: { id: "learn-1" } }
    });
    const result = await runMissionReview(admin as never, userId, missionId);
    expect(result.narrative).not.toContain("37%");
    expect(result.narrative).toContain("已替换为事实摘要");
  });

  it("fails closed after two invalid model outputs instead of inventing a review", async () => {
    mock.sendRawPrompt.mockResolvedValue("garbage");
    const { admin } = makeAdmin(measuringMissionTables([]));
    await expect(runMissionReview(admin as never, userId, missionId)).rejects.toBeInstanceOf(MissionReviewError);
    expect(mock.sendRawPrompt).toHaveBeenCalledTimes(2);
  });
});
