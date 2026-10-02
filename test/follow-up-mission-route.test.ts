import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createGrowthMission: vi.fn(),
  createBusinessGrowthMissionFollowUp: vi.fn(),
  advanceDueBusinessMissionReviews: vi.fn(),
  getGrowthMission: vi.fn(),
  listGrowthMissions: vi.fn(),
  advancePatrolAfterEvent: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

vi.mock("@/lib/agent/growth-missions", () => ({
  advanceDueBusinessMissionReviews: mocks.advanceDueBusinessMissionReviews,
  createBusinessGrowthMissionFollowUp: mocks.createBusinessGrowthMissionFollowUp,
  createGrowthMission: mocks.createGrowthMission,
  getGrowthMission: mocks.getGrowthMission,
  listGrowthMissions: mocks.listGrowthMissions
}));

vi.mock("@/lib/agent/patrol", () => ({ advancePatrolAfterEvent: mocks.advancePatrolAfterEvent }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.captureServerEvent }));

import { POST } from "@/app/api/agent/missions/route";

const userId = "11111111-1111-4111-8111-111111111111";
const sourceMissionId = "22222222-2222-4222-8222-222222222222";
const nextMissionId = "33333333-3333-4333-8333-333333333333";
const admin = {};

const sourceMission = {
  id: sourceMissionId,
  platform: "reddit",
  status: "completed",
  verdict: "lost",
  missionKind: "content_experiment",
  completedAt: "2026-08-24T02:00:00.000Z"
};

function request(body: Record<string, unknown>) {
  return new Request("https://www.finfold.app/api/agent/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": "zh-CN" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/agent/missions follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue(admin);
    mocks.getGrowthMission.mockResolvedValue(sourceMission);
    mocks.createGrowthMission.mockResolvedValue({
      mission: { id: nextMissionId, platform: "reddit" },
      briefing: { sampleSize: 2 },
      existing: false
    });
    mocks.createBusinessGrowthMissionFollowUp.mockResolvedValue({
      mission: { id: nextMissionId, platform: "linkedin", objectiveType: "leads" },
      existing: false
    });
    mocks.advancePatrolAfterEvent.mockResolvedValue(null);
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  it("creates a tenant-owned follow-up with durable source provenance", async () => {
    const response = await POST(request({
      locale: "zh",
      platform: "reddit",
      sourceMissionId
    }));

    expect(response.status).toBe(201);
    expect(mocks.getGrowthMission).toHaveBeenCalledWith(admin, userId, sourceMissionId);
    expect(mocks.createGrowthMission).toHaveBeenCalledWith(admin, userId, "zh", "reddit", {
      missionId: sourceMissionId,
      verdict: "lost",
      completedAt: sourceMission.completedAt
    });
    expect(mocks.advancePatrolAfterEvent).toHaveBeenCalledWith(admin, userId, {
      type: "mission_created",
      missionId: nextMissionId
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(userId, "follow_up_mission_created", expect.objectContaining({
      source_mission_id: sourceMissionId,
      mission_id: nextMissionId
    }));
  });

  it("does not create a follow-up from a missing or foreign source mission", async () => {
    mocks.getGrowthMission.mockResolvedValue(null);

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(404);
    expect(mocks.createGrowthMission).not.toHaveBeenCalled();
  });

  it("waits for a completed verdict before creating the next mission", async () => {
    mocks.getGrowthMission.mockResolvedValue({ ...sourceMission, status: "posted", verdict: null });

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(409);
    expect(mocks.createGrowthMission).not.toHaveBeenCalled();
  });

  it("creates a business-result replication without turning it into a content experiment", async () => {
    mocks.getGrowthMission.mockResolvedValue({
      ...sourceMission,
      platform: "linkedin",
      missionKind: "growth_opportunity",
      objectiveType: "leads",
      verdict: "won"
    });

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(201);
    expect(mocks.createBusinessGrowthMissionFollowUp).toHaveBeenCalledWith(admin, userId, "zh", sourceMissionId);
    expect(mocks.createGrowthMission).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(userId, "business_result_replication_mission_created", expect.objectContaining({
      source_mission_id: sourceMissionId,
      mission_id: nextMissionId,
      objective_type: "leads"
    }));
  });

  it("does not scale a commercial mission that did not reach its target", async () => {
    mocks.getGrowthMission.mockResolvedValue({
      ...sourceMission,
      platform: "linkedin",
      missionKind: "growth_opportunity",
      objectiveType: "leads",
      verdict: "inconclusive"
    });

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(409);
    expect(mocks.createBusinessGrowthMissionFollowUp).not.toHaveBeenCalled();
    expect(mocks.createGrowthMission).not.toHaveBeenCalled();
  });

  it("returns the business mission's monthly-limit response", async () => {
    mocks.getGrowthMission.mockResolvedValue({
      ...sourceMission,
      platform: "linkedin",
      missionKind: "growth_opportunity",
      objectiveType: "leads",
      verdict: "won"
    });
    mocks.createBusinessGrowthMissionFollowUp.mockResolvedValue({
      mission: null,
      existing: false,
      error: "当前套餐本月最多启动 4 个增长任务。",
      errorStatus: 429
    });

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "当前套餐本月最多启动 4 个增长任务。" });
  });

  it("does not turn analytics failure into a false mission-creation failure", async () => {
    mocks.captureServerEvent.mockRejectedValue(new Error("analytics unavailable"));

    const response = await POST(request({ locale: "zh", sourceMissionId }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ mission: { id: nextMissionId } });
  });
});
