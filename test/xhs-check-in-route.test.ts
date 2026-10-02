import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  refreshUserPatrol: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

vi.mock("@/lib/agent/patrol", () => ({
  refreshUserPatrol: mocks.refreshUserPatrol
}));

import { POST } from "@/app/api/agent/xhs/tasks/[taskId]/check-ins/route";

const taskId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function query(data: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data, error: null })
  };
  return builder;
}

function request(body: unknown) {
  return new Request(`https://finfold.test/api/agent/xhs/tasks/${taskId}/check-ins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/agent/xhs/tasks/[taskId]/check-ins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({
      from(table: string) {
        if (table === "xhs_coaching_tasks") {
          return query({
            id: taskId,
            program_id: programId,
            status: "completed",
            day_number: 7,
            task_kind: "review",
            target_metric: "relative_ctr"
          });
        }
        if (table === "xhs_coaching_check_ins") {
          return query({
            proof: { type: "note_url", value: "https://www.xiaohongshu.com/explore/original" },
            observed_metrics: { relative_ctr: 3.2 },
            reflection: "保留第一轮变量，继续复现。",
            created_at: "2026-08-13T01:00:00.000Z"
          });
        }
        if (table === "xhs_coaching_programs") {
          return query({
            id: programId,
            start_date: "2026-08-06",
            timezone: "Asia/Shanghai",
            baseline_diagnosis_id: "44444444-4444-4444-8444-444444444444",
            latest_diagnosis_id: null,
            status: "active",
            baseline: {
              primaryProblem: { stage: "click" },
              topActions: [{ singleVariable: "标题与封面承诺" }],
              distributions: {
                impressions: { median: 100 },
                coverClickRate: { median: 2.4 },
                averageViewSeconds: { median: 8 },
                saveSharePerThousand: { median: 3 },
                followersPerThousand: { median: 1 }
              },
              sample: { mature: 5 },
              platformNotifications: []
            }
          });
        }
        throw new Error(`Unexpected table: ${table}`);
      }
    });
  });

  it("replays the durable result when a completed check-in request is retried", async () => {
    const response = await POST(request({
      proof: { type: "text", value: "a different retry payload" },
      observedMetrics: { relative_ctr: 99 },
      reflection: "retry"
    }), { params: Promise.resolve({ taskId }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replayed: true,
      checkIn: {
        id: taskId,
        proof: { type: "note_url", value: "https://www.xiaohongshu.com/explore/original" },
        observedMetrics: { relative_ctr: 3.2 },
        reflection: "保留第一轮变量，继续复现。"
      },
      task: { id: taskId, status: "completed" },
      roundTwoPlan: {
        decision: "replicate_winner",
        stage: "click",
        variable: "标题与封面承诺",
        targetMetric: "相对自身基准的封面点击率"
      }
    });
    expect(mocks.refreshUserPatrol).not.toHaveBeenCalled();
  });
});
