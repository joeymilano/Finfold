import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadMissionControlDetail: vi.fn(),
  refreshUserPatrol: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/mission-control", () => ({ loadMissionControlDetail: mocks.loadMissionControlDetail }));
vi.mock("@/lib/agent/patrol", () => ({ refreshUserPatrol: mocks.refreshUserPatrol }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.captureServerEvent }));

import { POST } from "@/app/api/agent/missions/[missionId]/measurement-window/route";

const userId = "11111111-1111-4111-8111-111111111111";
const missionId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn();

describe("POST /api/agent/missions/[missionId]/measurement-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });
    mocks.loadMissionControlDetail.mockResolvedValue({ mission: { id: missionId, measurementWindowDays: 14 } });
    mocks.refreshUserPatrol.mockResolvedValue(null);
    mocks.captureServerEvent.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: { replayed: false }, error: null });
  });

  it("sets the tenant-scoped window through the atomic RPC", async () => {
    const response = await POST(new Request(`https://finfold.test/api/agent/missions/${missionId}/measurement-window`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowDays: 14, idempotencyKey })
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("set_business_mission_measurement_window", {
      p_user_id: userId,
      p_mission_id: missionId,
      p_window_days: 14,
      p_idempotency_key: idempotencyKey
    });
    expect(mocks.refreshUserPatrol).toHaveBeenCalledWith(expect.anything(), userId);
  });

  it("replays a duplicate without double-counting analytics", async () => {
    rpc.mockResolvedValue({ data: { replayed: true }, error: null });
    const response = await POST(new Request(`https://finfold.test/api/agent/missions/${missionId}/measurement-window`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowDays: 14, idempotencyKey })
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(200);
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });

  it("does not turn analytics failure into a false measurement failure", async () => {
    mocks.captureServerEvent.mockRejectedValueOnce(new Error("analytics unavailable"));
    const response = await POST(new Request(`https://finfold.test/api/agent/missions/${missionId}/measurement-window`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowDays: 14, idempotencyKey })
    }), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(201);
  });
});
