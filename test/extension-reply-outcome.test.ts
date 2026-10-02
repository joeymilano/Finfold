import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/extension/v1/reply-outcome/route";

const mock = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), from: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/extension/auth", () => ({ authenticateExtensionRequest: mock.auth }));
vi.mock("@/lib/extension/cors", () => ({
  isAllowedExtensionRequestOrigin: mock.origin,
  extensionPreflight: () => new Response(null, { status: 204 }),
  extensionJson: (_: unknown, body: unknown, init?: ResponseInit) => Response.json(body, init)
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mock.from }) }));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mock.event }));

const id = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown = { requestId, platform: "xiaohongshu", outcome: "sent" }) =>
  new Request("https://www.finfold.app/api/extension/v1/reply-outcome", { method: "POST", body: JSON.stringify(body) });

const queries: Array<{ table: string; upsert?: Record<string, unknown> }> = [];
let tables: Record<string, { data?: unknown; error?: unknown }>;
beforeEach(() => {
  vi.clearAllMocks(); queries.length = 0;
  tables = {};
  mock.from.mockImplementation((table: string) => {
    const record: { table: string; upsert?: Record<string, unknown> } = { table };
    queries.push(record);
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: null, error: null, ...tables[table] }),
      upsert: async (value: Record<string, unknown>) => { record.upsert = value; return { error: null, ...tables[table] }; }
    };
    return q;
  });
  vi.stubEnv("FINFOLD_EXTENSION_AUTH_ENABLED", "true");
  vi.stubEnv("FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED", "true");
  vi.stubEnv("FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS", id);
  mock.auth.mockResolvedValue({ userId: id, scope: ["extension:generate"] });
  mock.origin.mockReturnValue(true);
  mock.event.mockResolvedValue(undefined);
});

it("rejects untrusted extension origins before touching user data", async () => {
  mock.origin.mockReturnValue(false);
  expect((await POST(request())).status).toBe(403);
  expect(mock.auth).not.toHaveBeenCalled();
});

it("closes the independent reply gate when the pilot is off", async () => {
  vi.stubEnv("FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED", "false");
  expect((await POST(request())).status).toBe(403);
});

it("rejects unknown outcome values", async () => {
  tables["ai_usage_operations"] = { data: { id: "op" } };
  expect((await POST(request({ requestId, platform: "xiaohongshu", outcome: "posted" }))).status).toBe(400);
});

it("refuses outcomes for requests the user never generated", async () => {
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(queries.find((query) => query.table === "extension_reply_send_outcomes")).toBeUndefined();
});

it("records the outcome once with the authenticated identity and emits analytics", async () => {
  tables["ai_usage_operations"] = { data: { id: "op" } };
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ recorded: true });
  const stored = queries.find((query) => query.table === "extension_reply_send_outcomes")?.upsert;
  expect(stored).toEqual({ user_id: id, request_id: requestId, platform: "xiaohongshu", outcome: "sent" });
  expect(mock.event).toHaveBeenCalledWith(id, "extension_reply_send_outcome",
    expect.objectContaining({ platform: "xiaohongshu", outcome: "sent" }));
});

it("surfaces persistence failures instead of pretending success", async () => {
  tables["ai_usage_operations"] = { data: { id: "op" } };
  tables["extension_reply_send_outcomes"] = { error: { message: "boom" } };
  expect((await POST(request())).status).toBe(503);
  expect(mock.event).not.toHaveBeenCalled();
});
