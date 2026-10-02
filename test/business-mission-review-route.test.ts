import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createBusinessGrowthMissionFollowUp: vi.fn(),
  loadMissionControlDetail: vi.fn(),
  refreshUserPatrol: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/agent/growth-missions", () => ({
  createBusinessGrowthMissionFollowUp: mocks.createBusinessGrowthMissionFollowUp
}));
vi.mock("@/lib/mission-control", () => ({ loadMissionControlDetail: mocks.loadMissionControlDetail }));
vi.mock("@/lib/agent/patrol", () => ({ refreshUserPatrol: mocks.refreshUserPatrol }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.captureServerEvent }));

import { POST } from "@/app/api/agent/missions/[missionId]/review/route";

const userId = "11111111-1111-4111-8111-111111111111";
const missionId = "22222222-2222-4222-8222-222222222222";
const nextMissionId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const rpc = vi.fn();

function request(body: Record<string, unknown>) {
  return new Request(`https://finfold.test/api/agent/missions/${missionId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/agent/missions/[missionId]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });
    mocks.loadMissionControlDetail.mockResolvedValue({ mission: { id: missionId, status: "completed" } });
    mocks.refreshUserPatrol.mockResolvedValue(null);
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.createBusinessGrowthMissionFollowUp.mockResolvedValue({
      mission: { id: nextMissionId, objectiveType: "leads" },
      existing: false
    });
    rpc.mockResolvedValue({ data: { replayed: false, decision: "fix_bottleneck" }, error: null });
  });

  it("records one breakpoint and creates the corresponding repair mission", async () => {
    const response = await POST(request({
      locale: "zh",
      decision: "fix_bottleneck",
      bottleneck: "landing_page",
      evidenceNote: "已核对 CRM 和表单，本周期没有新增有效咨询。",
      extensionDays: null,
      idempotencyKey
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("review_business_growth_mission", expect.objectContaining({
      p_user_id: userId,
      p_mission_id: missionId,
      p_decision: "fix_bottleneck",
      p_bottleneck: "landing_page",
      p_idempotency_key: idempotencyKey
    }));
    expect(mocks.createBusinessGrowthMissionFollowUp).toHaveBeenCalledWith(expect.anything(), userId, "zh", missionId);
    await expect(response.json()).resolves.toMatchObject({ nextMission: { id: nextMissionId } });
  });

  it("extends evidence collection without creating or declaring a next mission", async () => {
    mocks.loadMissionControlDetail.mockResolvedValue({ mission: { id: missionId, status: "posted", executionState: "measuring" } });
    rpc.mockResolvedValue({ data: { replayed: false, decision: "collect_more_evidence" }, error: null });

    const response = await POST(request({
      locale: "zh",
      decision: "collect_more_evidence",
      bottleneck: null,
      evidenceNote: "支付后台归因仍在延迟，目前不能确认收入结果。",
      extensionDays: 7,
      idempotencyKey
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(200);
    expect(mocks.createBusinessGrowthMissionFollowUp).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ nextMission: null });
  });

  it("does not report a persisted review as failed when analytics is unavailable", async () => {
    mocks.captureServerEvent.mockRejectedValue(new Error("analytics unavailable"));
    const response = await POST(request({
      locale: "zh",
      decision: "fix_bottleneck",
      bottleneck: "landing_page",
      evidenceNote: "已核对 CRM 和表单，本周期没有新增有效咨询。",
      extensionDays: null,
      idempotencyKey
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ nextMission: { id: nextMissionId } });
  });
});
