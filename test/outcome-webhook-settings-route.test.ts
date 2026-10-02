import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  resolveBusinessMissionPlan: vi.fn(),
  canUseAutomaticOutcomeBackflow: vi.fn(),
  encryptSecret: vi.fn(),
  captureServerEvent: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/business-mission-entitlements", () => ({
  resolveBusinessMissionPlan: mocks.resolveBusinessMissionPlan,
  canUseAutomaticOutcomeBackflow: mocks.canUseAutomaticOutcomeBackflow
}));
vi.mock("@/lib/secret-encryption", () => ({ encryptSecret: mocks.encryptSecret }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.captureServerEvent }));

import { DELETE, GET, POST } from "@/app/api/settings/outcome-webhook/route";

const userId = "11111111-1111-4111-8111-111111111111";
const endpointId = "22222222-2222-4222-8222-222222222222";
const endpointRow = {
  id: endpointId,
  status: "active",
  secret_prefix: "ff_out_12345678",
  secret_version: 1,
  last_received_at: null,
  rotated_at: null,
  created_at: "2026-08-24T12:00:00.000Z",
  updated_at: "2026-08-24T12:00:00.000Z"
};

describe("business result connection settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.finfold.app");
    mocks.getCurrentUserId.mockResolvedValue(userId);
    mocks.resolveBusinessMissionPlan.mockResolvedValue("growth_v2");
    mocks.canUseAutomaticOutcomeBackflow.mockReturnValue(true);
    mocks.encryptSecret.mockResolvedValue("enc:v1:encrypted-secret");
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows only a safe prefix and recent delivery receipts", async () => {
    const endpointTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: endpointRow, error: null }) }))
      }))
    };
    const deliveryTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: "33333333-3333-4333-8333-333333333333",
                  status: "succeeded",
                  event_type: "lead",
                  source: "website-form",
                  mission_id: "44444444-4444-4444-8444-444444444444",
                  attempt_count: 1,
                  error_code: null,
                  received_at: "2026-08-24T12:05:00.000Z",
                  processed_at: "2026-08-24T12:05:01.000Z"
                }],
                error: null
              })
            }))
          }))
        }))
      }))
    };
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => table === "outcome_webhook_endpoints" ? endpointTable : deliveryTable)
    });

    const response = await GET(new Request("https://www.finfold.app/api/settings/outcome-webhook"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.endpoint).toMatchObject({
      id: endpointId,
      secretPrefix: "ff_out_12345678",
      url: `https://www.finfold.app/api/v1/outcomes/${endpointId}`
    });
    expect(JSON.stringify(body)).not.toContain("encrypted-secret");
    expect(body.deliveries).toHaveLength(1);
  });

  it("creates a one-time secret but persists only its encrypted form", async () => {
    const insert = vi.fn((_value: Record<string, unknown>) => {
      return ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: endpointRow, error: null }) }))
      });
    });
    const endpointTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }))
      })),
      insert
    };
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => endpointTable) });

    const response = await POST(new Request("https://www.finfold.app/api/settings/outcome-webhook", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.secret).toMatch(/^ff_out_[a-f0-9]{64}$/);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      encrypted_secret: "enc:v1:encrypted-secret"
    }));
    const stored = insert.mock.calls[0]?.[0];
    expect(stored?.encrypted_secret).not.toBe(body.secret);
  });

  it("does not create an endpoint for a plan without automatic backflow", async () => {
    mocks.canUseAutomaticOutcomeBackflow.mockReturnValue(false);
    const from = vi.fn();
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    const response = await POST(new Request("https://www.finfold.app/api/settings/outcome-webhook", { method: "POST" }));

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("upgrade_required");
    expect(from).not.toHaveBeenCalled();
  });

  it("clears the encrypted secret when a user disables the connection", async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: endpointId }, error: null }) }))
      }))
    }));
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ update })) });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "disabled",
      encrypted_secret: null,
      secret_prefix: null
    }));
  });
});
