import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  admin: null as unknown,
  consoleError: vi.fn(),
  consoleInfo: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => mock.admin }));

import { maybeRecordActivationOutcome, recordActivationOutcome } from "@/lib/growth-loop/attribution";

const userId = "11111111-1111-4111-8111-111111111111";

function makeAdmin(rpcResult: { data?: unknown; error?: unknown } = { data: { attributed: true } }) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    admin: {
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        return rpcResult;
      }
    },
    rpcCalls
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("activation outcome wiring (spec §7: analytics must never break the save)", () => {
  it("records through the frozen-attribution RPC with the subject id", async () => {
    const { admin, rpcCalls } = makeAdmin();
    mock.admin = admin;
    const result = await recordActivationOutcome(userId);
    expect(result).toMatchObject({ attributed: true });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ name: "record_native_activation_outcome" });
    expect(rpcCalls[0].args.p_subject_user_id).toBe(userId);
    expect(rpcCalls[0].args.p_is_test).toBe(false);
  });

  it("passes the test marker explicitly for live-test callers", async () => {
    const { admin, rpcCalls } = makeAdmin({ data: { attributed: true, replayed: false } });
    mock.admin = admin;
    await recordActivationOutcome(userId, { isTest: true });
    expect(rpcCalls[0].args.p_is_test).toBe(true);
  });

  it("short-circuits the local mock user without touching the database", async () => {
    const { admin, rpcCalls } = makeAdmin();
    mock.admin = admin;
    const result = await recordActivationOutcome("local-preview-user");
    expect(result.attributed).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("never throws from the non-blocking wrapper, even on RPC failure", async () => {
    const { admin } = makeAdmin({ data: null, error: { message: "database exploded" } });
    mock.admin = admin;
    await expect(maybeRecordActivationOutcome(userId)).resolves.toBeUndefined();
    // The error is logged for reconciliation, not surfaced to the save path.
    expect(console.error).toHaveBeenCalled();
  });

  it("treats a missing admin client as a skip, not a failure", async () => {
    mock.admin = null;
    await expect(maybeRecordActivationOutcome(userId)).resolves.toBeUndefined();
  });
});
