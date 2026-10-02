import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadMissionControlDetail: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

vi.mock("@/lib/mission-control", () => ({
  loadMissionControlDetail: mocks.loadMissionControlDetail
}));

vi.mock("@/lib/posthog-server", () => ({
  captureServerEvent: mocks.captureServerEvent
}));

import { POST } from "@/app/api/agent/missions/[missionId]/outcomes/route";

const userId = "11111111-1111-4111-8111-111111111111";
const missionId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

function request() {
  return new Request(`https://finfold.test/api/agent/missions/${missionId}/outcomes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "signup",
      count: 3,
      value: 0,
      currency: "CNY",
      note: "",
      idempotencyKey
    })
  });
}

describe("POST /api/agent/missions/[missionId]/outcomes", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.createSupabaseAdminClient.mockReturnValue({ rpc });
    mocks.loadMissionControlDetail.mockResolvedValue({ mission: { id: missionId } });
    mocks.captureServerEvent.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: { replayed: false, actualValue: 3 }, error: null });
  });

  it("passes tenant and idempotency scope into the atomic mutation", async () => {
    const response = await POST(request(), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("record_mission_outcome", expect.objectContaining({
      p_user_id: userId,
      p_mission_id: missionId,
      p_idempotency_key: idempotencyKey,
      p_event_type: "signup",
      p_quantity: 3
    }));
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
  });

  it("replays a duplicate without double-counting analytics", async () => {
    rpc.mockResolvedValue({ data: { replayed: true, actualValue: 3 }, error: null });

    const response = await POST(request(), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(200);
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ replayed: true });
  });

  it("does not report success when the atomic mutation fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("ledger unavailable") });

    const response = await POST(request(), { params: Promise.resolve({ missionId }) });

    expect(response.status).toBe(400);
    expect(mocks.loadMissionControlDetail).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });
});
