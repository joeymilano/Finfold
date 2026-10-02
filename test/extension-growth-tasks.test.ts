import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/extension/auth", () => ({ authenticateExtensionRequest: mock.auth }));
vi.mock("@/lib/extension/cors", () => ({
  isAllowedExtensionRequestOrigin: mock.origin,
  extensionPreflight: () => new Response(null, { status: 204 }),
  extensionJson: (_: unknown, body: unknown, init?: ResponseInit) => Response.json(body, init)
}));
vi.mock("@/lib/extension/usage", () => ({ extensionAuthEnabled: () => true }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mock.from, rpc: mock.rpc }) }));

import { GET as listTasks } from "@/app/api/extension/v1/growth-tasks/route";
import { POST as reportOutcome } from "@/app/api/extension/v1/growth-tasks/[actionId]/outcome/route";

const userId = "11111111-1111-4111-8111-111111111111";
const missionId = "77777777-7777-4777-8777-777777777777";
const actionId = "88888888-8888-4888-8888-888888888888";
const payloadHash = "a".repeat(64);

const baseAction = {
  id: actionId,
  mission_id: missionId,
  status: "running",
  input: { variantKey: "A", kitId: "kit-1" },
  payload_hash: payloadHash,
  approved_at: "2026-09-17T00:00:00.000Z",
  evidence_url: null,
  growth_missions: [{ id: missionId, user_id: userId, mission_kind: "growth_loop", status: "draft_ready", goal_id: null }]
};

type QueryRecord = { table: string; filters: Array<[string, unknown]>; update?: Record<string, unknown>; insert?: Record<string, unknown> };

function makeFrom(tables: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const queries: QueryRecord[] = [];
  mock.from.mockImplementation((table: string) => {
    const state = tables[table] ?? {};
    const record: QueryRecord = { table, filters: [] };
    queries.push(record);
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        record.filters.push([column, value]);
        return q;
      },
      in: (column: string, value: unknown) => {
        record.filters.push([column, value]);
        return q;
      },
      maybeSingle: async () => ({ data: state.data ?? null, error: state.error ?? null }),
      order: () => q,
      limit: () => q,
      update: (value: Record<string, unknown>) => {
        record.update = value;
        return q;
      },
      insert: async (value: Record<string, unknown>) => {
        record.insert = value;
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.data ?? null, error: state.error ?? null }).then(resolve)
    };
    return q;
  });
  return queries;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
  vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "open");
  mock.origin.mockReturnValue(true);
  mock.auth.mockResolvedValue({ userId, scope: ["extension:generate"] });
  mock.rpc.mockResolvedValue({ data: { confirmed: true, replayed: false }, error: null });
  makeFrom();
});

const listRequest = new Request("https://www.finfold.app/api/extension/v1/growth-tasks");
const outcomeRequest = (body: unknown, action = actionId) =>
  new Request(`https://www.finfold.app/api/extension/v1/growth-tasks/${action}/outcome`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

it("rejects untrusted origins before reading anything", async () => {
  mock.origin.mockReturnValue(false);
  expect((await listTasks(listRequest)).status).toBe(403);
  expect(mock.auth).not.toHaveBeenCalled();
});

it("returns an empty feature-off list instead of an error", async () => {
  vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "false");
  const response = await listTasks(listRequest);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tasks: [], featureEnabled: false });
});

it("lists approved tasks with drafts and variant tracking links", async () => {
  makeFrom({
    mission_actions: { data: [baseAction] },
    kit_outputs: { data: [{ title: "标题", body: "正文", cta: "去看看" }] },
    tracking_links: { data: { code: "abc20hexcode0000000" } }
  });
  const response = await listTasks(listRequest);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.featureEnabled).toBe(true);
  expect(body.tasks).toHaveLength(1);
  expect(body.tasks[0]).toMatchObject({
    taskId: actionId,
    variantKey: "A",
    status: "ready",
    draft: { title: "标题", body: "正文", cta: "去看看" },
    trackingUrl: "https://www.finfold.app/go/abc20hexcode0000000"
  });
});

it("reports completion through the confirm RPC with the stored hash and assisted mode", async () => {
  makeFrom({ mission_actions: { data: baseAction } });
  const response = await reportOutcome(outcomeRequest({ outcome: "completed", evidenceUrl: "https://www.xiaohongshu.com/explore/x" }), {
    params: Promise.resolve({ actionId })
  });
  expect(response.status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith(
    "confirm_mission_publication",
    expect.objectContaining({
      p_user_id: userId,
      p_action_id: actionId,
      p_payload_hash: payloadHash,
      p_evidence_url: "https://www.xiaohongshu.com/explore/x",
      p_execution_mode: "assisted"
    })
  );
});

it("rejects extension-supplied payload hashes outright (strict schema)", async () => {
  makeFrom({ mission_actions: { data: baseAction } });
  const response = await reportOutcome(
    outcomeRequest({ outcome: "completed", evidenceUrl: "https://www.xiaohongshu.com/explore/x", payloadHash: "b".repeat(64) }),
    { params: Promise.resolve({ actionId }) }
  );
  expect(response.status).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});

it("maps stale approvals to 409 TASK_REJECTED", async () => {
  makeFrom({ mission_actions: { data: baseAction } });
  mock.rpc.mockResolvedValue({ data: null, error: { message: "Approval is stale: content changed." } });
  const response = await reportOutcome(outcomeRequest({ outcome: "completed", evidenceUrl: "https://www.xiaohongshu.com/explore/x" }), {
    params: Promise.resolve({ actionId })
  });
  expect(response.status).toBe(409);
  expect(((await response.json()) as Record<string, unknown>).code).toBe("TASK_REJECTED");
});

it("resets failed tasks to awaiting_approval and logs the failure event", async () => {
  const queries = makeFrom({ mission_actions: { data: baseAction } });
  const response = await reportOutcome(outcomeRequest({ outcome: "failed", note: "页面打不开" }), {
    params: Promise.resolve({ actionId })
  });
  expect(response.status).toBe(200);
  const actionUpdate = queries
    .filter((query) => query.table === "mission_actions")
    .find((query) => query.update !== undefined)?.update;
  expect(actionUpdate?.status).toBe("awaiting_approval");
  const eventInsert = queries.find((query) => query.table === "mission_events")?.insert;
  expect(eventInsert).toMatchObject({ mission_id: missionId, user_id: userId, event_type: "extension_publish_failed" });
});

it("rejects completion without a link and failure with a link at the schema layer", async () => {
  makeFrom({ mission_actions: { data: baseAction } });
  expect(
    (await reportOutcome(outcomeRequest({ outcome: "completed" }), { params: Promise.resolve({ actionId }) })).status
  ).toBe(400);
  expect(
    (
      await reportOutcome(outcomeRequest({ outcome: "failed", evidenceUrl: "https://www.xiaohongshu.com/explore/x" }), {
        params: Promise.resolve({ actionId })
      })
    ).status
  ).toBe(400);
});

it("returns 404 for unknown tasks", async () => {
  makeFrom({ mission_actions: { data: null } });
  const response = await reportOutcome(outcomeRequest({ outcome: "completed", evidenceUrl: "https://www.xiaohongshu.com/explore/x" }), {
    params: Promise.resolve({ actionId })
  });
  expect(response.status).toBe(404);
});
