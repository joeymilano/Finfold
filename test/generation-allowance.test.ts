import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTerminalGenerationAllowance } from "@/lib/generation-allowance";

const { allowanceReadMock, supabaseMock } = vi.hoisted(() => ({
  allowanceReadMock: vi.fn(),
  supabaseMock: {
    rpc: vi.fn()
  }
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => supabaseMock
}));

describe("terminal generation allowance", () => {
  beforeEach(() => {
    allowanceReadMock.mockReset();
    supabaseMock.rpc.mockReset();
    supabaseMock.rpc.mockImplementation(allowanceReadMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves an authoritative true 0/0 snapshot", async () => {
    allowanceReadMock.mockResolvedValue({
      data: { periodKey: "2026-08", used: 0, available: 0 },
      error: null
    });

    const allowance = await getTerminalGenerationAllowance("user-1", {
      limit: 1_500,
      plan: "free",
      costThisRun: 15
    });

    expect(allowance).toEqual({
      used: 0,
      limit: 1_500,
      plan: "free",
      available: 0,
      costThisRun: 15
    });
  });

  it("omits allowance when the authoritative snapshot query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    allowanceReadMock.mockResolvedValue({
      data: null,
      error: { message: "temporary balance query failure" }
    });

    await expect(
      getTerminalGenerationAllowance("user-1", {
        limit: 1_500,
        plan: "free",
        costThisRun: 15
      })
    ).resolves.toBeUndefined();

    const allowance = await getTerminalGenerationAllowance("user-1", {
      limit: 1_500,
      plan: "free",
      costThisRun: 15
    });
    const terminalPayload = {
      status: "done",
      ...(allowance === undefined ? {} : { allowance })
    };

    expect(allowance).toBeUndefined();
    expect(terminalPayload).not.toHaveProperty("allowance");
  });

  it("omits allowance when the snapshot is incomplete without a query error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    allowanceReadMock.mockResolvedValue({ data: null, error: null });

    await expect(
      getTerminalGenerationAllowance("user-1", {
        limit: 1_500,
        plan: "free",
        costThisRun: 15
      })
    ).resolves.toBeUndefined();
  });

  it("derives used and available from one balance statement snapshot", async () => {
    allowanceReadMock.mockResolvedValue({
      data: { periodKey: "2026-08", used: 15, available: 1_500 },
      error: null
    });

    await expect(
      getTerminalGenerationAllowance("user-1", {
        limit: 1_500,
        plan: "free",
        costThisRun: 15
      })
    ).resolves.toEqual({
      used: 15,
      limit: 1_500,
      plan: "free",
      available: 1_500,
      costThisRun: 15
    });
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_credit_allowance_snapshot", {
      p_user_id: "user-1"
    });
  });
});
