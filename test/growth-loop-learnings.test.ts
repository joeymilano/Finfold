import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mock.from }) }));

import { LearningDecisionError, decideGrowthLearning } from "@/lib/growth-loop/learnings";
import type { GrowthLearningRow } from "@/lib/growth-loop/contracts";

const userId = "11111111-1111-4111-8111-111111111111";
const learningId = "44444444-4444-4444-8444-444444444444";
const missionId = "77777777-7777-4777-8777-777777777777";

function baseLearning(status: GrowthLearningRow["status"]): GrowthLearningRow {
  return {
    id: learningId,
    user_id: userId,
    goal_id: null,
    mission_id: missionId,
    statement: "在本次品牌、渠道和窗口内，成品展示角度值得下一轮继续检验",
    applicable_conditions: "小红书",
    limitations: "样本少",
    evidence: {},
    status,
    accepted_at: null,
    revoked_at: null,
    version: 1,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z"
  };
}

type QueryRecord = {
  table: string;
  filters: Array<[string, unknown]>;
  update?: Record<string, unknown>;
  insert?: Record<string, unknown>;
};

function makeAdmin(
  row: GrowthLearningRow | null,
  updateResult: { data?: unknown; error?: unknown } | null = null
) {
  const queries: QueryRecord[] = [];
  const admin = {
    from(table: string) {
      const record: QueryRecord = { table, filters: [] };
      queries.push(record);
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          record.filters.push([column, value]);
          return q;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        update: (value: Record<string, unknown>) => {
          record.update = value;
          return q;
        },
        insert: async (value: Record<string, unknown>) => {
          record.insert = value;
          return { data: null, error: null };
        },
        single: async () =>
          // Default: the update "returns" the row with the patch applied.
          updateResult ?? (row ? { data: { ...row, ...record.update }, error: null } : { data: null, error: null })
      };
      return q;
    }
  };
  return { admin, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("learning lifecycle (T14: accept → inject; revoke → stop injecting)", () => {
  it("accepts a candidate with an optimistic version guard and logs the decision on the mission", async () => {
    const { admin, queries } = makeAdmin(baseLearning("candidate"));
    const learning = await decideGrowthLearning(admin as never, userId, learningId, "accept");

    expect(learning.status).toBe("accepted");
    const update = queries
      .filter((query) => query.table === "growth_learnings")
      .find((query) => query.update !== undefined)?.update;
    expect(update?.status).toBe("accepted");
    expect(update?.version).toBe(2);
    expect(queries.filter((query) => query.table === "growth_learnings")[1]?.filters).toContainEqual(["user_id", userId]);
    expect(queries.filter((query) => query.table === "growth_learnings")[1]?.filters).toContainEqual(["version", 1]);

    const eventInsert = queries.find((query) => query.table === "mission_events")?.insert;
    expect(eventInsert).toMatchObject({
      mission_id: missionId,
      user_id: userId,
      event_type: "learning_decision"
    });
  });

  it("revokes an accepted learning (used ids must stop being injected afterwards)", async () => {
    const accepted = { ...baseLearning("accepted"), accepted_at: "2026-09-17T01:00:00.000Z" };
    const { admin, queries } = makeAdmin(accepted);
    const learning = await decideGrowthLearning(admin as never, userId, learningId, "revoke");
    expect(learning.status).toBe("revoked");
    expect(
      queries
        .filter((query) => query.table === "growth_learnings")
        .find((query) => query.update !== undefined)?.update?.revoked_at
    ).toBeDefined();
  });

  it("rejects impossible transitions instead of silently rewriting history", async () => {
    const rejected = { ...baseLearning("rejected") };
    const { admin } = makeAdmin(rejected);
    await expect(decideGrowthLearning(admin as never, userId, learningId, "accept")).rejects.toMatchObject({
      name: "LearningDecisionError",
      code: "invalid_transition"
    });

    const revoked = { ...baseLearning("revoked"), accepted_at: "2026-09-17T01:00:00.000Z", revoked_at: "2026-09-18T01:00:00.000Z" };
    const revokedAdmin = makeAdmin(revoked).admin;
    await expect(decideGrowthLearning(revokedAdmin as never, userId, learningId, "revoke")).rejects.toMatchObject({
      code: "invalid_transition"
    });
  });

  it("reports not-found for missing or other-user learnings", async () => {
    const { admin } = makeAdmin(null);
    await expect(decideGrowthLearning(admin as never, userId, learningId, "accept")).rejects.toMatchObject({
      code: "not_found"
    });
  });

  it("surfaces an optimistic-concurrency loss instead of retrying blindly", async () => {
    const { admin } = makeAdmin(baseLearning("candidate"), { data: null, error: { message: "version conflict" } });
    await expect(decideGrowthLearning(admin as never, userId, learningId, "accept")).rejects.toMatchObject({
      code: "invalid_transition"
    });
  });
});
