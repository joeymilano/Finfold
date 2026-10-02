import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEventUuid, captureServerEvent } from "@/lib/posthog-server";
import { capturePersistedGenerationOutcome, type AnalyticsRun } from "@/lib/generation-analytics";

const run: AnalyticsRun = {
  id: "027171a0-9d2a-4d5a-bc98-13ba03fbbbf4", user_id: "user-1", request_id: "request-1",
  status: "succeeded", platform_count: 2, content_kit_id: "kit-1", credit_cost: 18,
  error_code: null, created_at: "2026-09-09T00:00:00Z", completed_at: "2026-09-09T00:00:12Z"
};
function adminFor(value: AnalyticsRun, context: unknown = { traffic_class: "qa", entry_point: "first_task" }) {
  const from = vi.fn((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: table === "generation_runs" ? value : { analytics: context }, error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    return chain;
  });
  return { from } as unknown as Parameters<typeof capturePersistedGenerationOutcome>[0];
}
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-project-key"); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("durable generation analytics", () => {
  it("retries recovery with exactly the same event UUID, timestamp and identity", async () => {
    const admin = adminFor(run);
    await capturePersistedGenerationOutcome(admin, run.id, run.user_id);
    await capturePersistedGenerationOutcome(admin, run.id, run.user_id);
    const bodies = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({ event: "kit_generation_completed", distinct_id: run.user_id, timestamp: run.completed_at, properties: { traffic_class: "qa", is_test_traffic: "true", durationMs: 12000, kit_id: "kit-1", analytics_version: 2 } });
    expect(bodies[0].uuid).toMatch(/^[a-f0-9-]{36}$/);
  });
  it.each(["partial_success", "failed", "cancelled"] as const)("reports persisted %s without claiming full success", async (status) => {
    await capturePersistedGenerationOutcome(adminFor({ ...run, status }), run.id, run.user_id);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.event).toBe(status === "partial_success" ? "kit_generation_completed" : `kit_generation_${status}`);
    expect(body.properties.status).toBe(status);
  });
  it("does not report an active run or a success without a persisted kit", async () => {
    await capturePersistedGenerationOutcome(adminFor({ ...run, status: "running" }), run.id, run.user_id);
    await capturePersistedGenerationOutcome(adminFor({ ...run, content_kit_id: null }), run.id, run.user_id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not overwrite known event attribution when recovering legacy jobs without metadata", async () => {
    await capturePersistedGenerationOutcome(adminFor(run, null), run.id, run.user_id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not let delivery failure break the generation response", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    await expect(capturePersistedGenerationOutcome(adminFor(run), run.id, run.user_id)).resolves.toBeUndefined();
  });
  it("uses distinct keys for distinct runs", async () => {
    expect(await analyticsEventUuid("run-a")).not.toBe(await analyticsEventUuid("run-b"));
    await captureServerEvent("user", "legacy_event", {});
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).uuid).toBeUndefined();
  });
});
