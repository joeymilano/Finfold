import { beforeEach, describe, expect, it, vi } from "vitest";
import { signHmacSHA256 } from "@/lib/payment/hmac";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  resolveBusinessMissionPlan: vi.fn(),
  canUseAutomaticOutcomeBackflow: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  decryptSecret: vi.fn(),
  claimOutcomeWebhookDelivery: vi.fn(),
  markOutcomeWebhookDeliverySucceeded: vi.fn(),
  markOutcomeWebhookDeliveryFailed: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/business-mission-entitlements", () => ({
  resolveBusinessMissionPlan: mocks.resolveBusinessMissionPlan,
  canUseAutomaticOutcomeBackflow: mocks.canUseAutomaticOutcomeBackflow
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/secret-encryption", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.captureServerEvent }));
vi.mock("@/lib/outcome-webhook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/outcome-webhook")>();
  return {
    ...actual,
    claimOutcomeWebhookDelivery: mocks.claimOutcomeWebhookDelivery,
    markOutcomeWebhookDeliverySucceeded: mocks.markOutcomeWebhookDeliverySucceeded,
    markOutcomeWebhookDeliveryFailed: mocks.markOutcomeWebhookDeliveryFailed
  };
});

import { POST } from "@/app/api/v1/outcomes/[endpointId]/route";

const endpointId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const missionId = "33333333-3333-4333-8333-333333333333";
const deliveryId = "44444444-4444-4444-8444-444444444444";
const secret = "ff_out_test-secret-with-enough-entropy";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "lead_00000001",
    type: "lead",
    missionId,
    source: "website-form",
    count: 1,
    ...overrides
  };
}

async function request(body: unknown, valid = true) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = valid
    ? await signHmacSHA256(`${timestamp}.${raw}`, secret)
    : "0".repeat(64);
  return new Request(`https://www.finfold.app/api/v1/outcomes/${endpointId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Finfold-Timestamp": timestamp,
      "X-Finfold-Signature": `v1=${signature}`
    },
    body: raw
  });
}

describe("POST /api/v1/outcomes/[endpointId]", () => {
  const maybeSingle = vi.fn();
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.resolveBusinessMissionPlan.mockResolvedValue("growth_v2");
    mocks.canUseAutomaticOutcomeBackflow.mockReturnValue(true);
    mocks.decryptSecret.mockResolvedValue(secret);
    maybeSingle.mockResolvedValue({
      data: { id: endpointId, user_id: userId, status: "active", encrypted_secret: "enc:v1:fixture" },
      error: null
    });
    const secondEq = vi.fn(() => ({ maybeSingle }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
      rpc
    });
    mocks.claimOutcomeWebhookDelivery.mockResolvedValue({ outcome: "claimed", deliveryId, lease: "2026-08-24T12:00:00.000Z" });
    mocks.markOutcomeWebhookDeliverySucceeded.mockResolvedValue(undefined);
    mocks.markOutcomeWebhookDeliveryFailed.mockResolvedValue(undefined);
    mocks.captureServerEvent.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: { replayed: false, missionId, actualValue: 1 }, error: null });
  });

  it("accepts a signed event and passes the endpoint tenant into the atomic RPC", async () => {
    const response = await POST(await request(payload()), { params: Promise.resolve({ endpointId }) });

    expect(response.status).toBe(200);
    expect(mocks.enforceApiRateLimit).toHaveBeenNthCalledWith(1, expect.any(Request), expect.objectContaining({
      scope: "outcome-webhook-global",
      limit: 600
    }));
    expect(mocks.enforceApiRateLimit).toHaveBeenNthCalledWith(2, expect.any(Request), expect.objectContaining({
      scope: `outcome-webhook:${endpointId}`,
      limit: 120
    }));
    expect(rpc).toHaveBeenCalledWith("ingest_mission_outcome_webhook", expect.objectContaining({
      p_user_id: userId,
      p_endpoint_id: endpointId,
      p_mission_id: missionId,
      p_event_type: "lead",
      p_source: "website-form"
    }));
    expect(mocks.markOutcomeWebhookDeliverySucceeded).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      deliveryId,
      endpointId,
      missionId
    }));
    await expect(response.json()).resolves.toMatchObject({ accepted: true, missionId, replayed: false });
  });

  it("rejects an invalid signature before claiming or mutating an outcome", async () => {
    const response = await POST(await request(payload(), false), { params: Promise.resolve({ endpointId }) });

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_signature");
    expect(mocks.claimOutcomeWebhookDelivery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an idempotent replay without calling the mission mutation twice", async () => {
    mocks.claimOutcomeWebhookDelivery.mockResolvedValue({
      outcome: "duplicate",
      response: { accepted: true, missionId, eventType: "lead", actualValue: 1 }
    });

    const response = await POST(await request(payload()), { params: Promise.resolve({ endpointId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-finfold-idempotent-replay")).toBe("true");
    expect(rpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ accepted: true, replayed: true });
  });

  it("rejects event ID reuse with a changed payload", async () => {
    mocks.claimOutcomeWebhookDelivery.mockResolvedValue({ outcome: "conflict" });

    const response = await POST(await request(payload()), { params: Promise.resolve({ endpointId }) });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("idempotency_conflict");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps automatic backflow behind an active accountability plan", async () => {
    mocks.canUseAutomaticOutcomeBackflow.mockReturnValue(false);

    const response = await POST(await request(payload()), { params: Promise.resolve({ endpointId }) });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("plan_required");
    expect(mocks.claimOutcomeWebhookDelivery).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
