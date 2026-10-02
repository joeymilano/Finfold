import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: supabaseMock.rpc })
}));

// supabase-js rpc() returns a thenable builder; consume_* callers chain
// .single() on it, so the mock must mirror that shape.
function mockRpcOnce(value: unknown) {
  supabaseMock.rpc.mockImplementationOnce(() => ({
    single: () => Promise.resolve(value)
  }));
}

import {
  budgetedProviderNames,
  currentBudgetMonth,
  estimateModelCostCny,
  llmBudgetReserveCny,
  reserveLLMBudget,
  settleLLMBudget
} from "@/lib/llm-budget";
import { withProviderFailover } from "@/lib/llm-providers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LLM monthly CNY budget", () => {
  it("keys the calendar month by Asia/Shanghai", () => {
    // 2026-08-31 16:05 UTC is already 2026-09-01 in Shanghai.
    expect(currentBudgetMonth(new Date("2026-08-31T16:05:00Z"))).toBe("2026-09");
    expect(currentBudgetMonth(new Date("2026-08-31T15:05:00Z"))).toBe("2026-08");
  });

  it("estimates qwen3.8-flash cost from the built-in DashScope list prices", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
    expect(estimateModelCostCny("qwen-token-plan", "qwen3.8-flash", usage)).toBeCloseTo(0.8 + 2.7, 6);
    expect(estimateModelCostCny("other", "unpriced-model", usage)).toBeNull();
  });

  it("honours LLM_PRICING_CNY_PER_1M overrides", () => {
    const usage = { inputTokens: 500_000, outputTokens: 0, totalTokens: 500_000 };
    const custom = JSON.stringify({ "qwen-token-plan:qwen3.8-flash": { input: 2, output: 8 } });
    expect(estimateModelCostCny("qwen-token-plan", "qwen3.8-flash", usage, custom)).toBeCloseTo(1, 6);
  });

  it("collects only providers that declare monthlyBudgetCny", () => {
    const raw = JSON.stringify([
      { name: "qwen-free-latest", base: "https://a", keyEnv: "K1" },
      { name: "qwen-token-plan", base: "https://b", keyEnv: "K2", monthlyBudgetCny: 10 }
    ]);
    expect(budgetedProviderNames(raw)).toEqual(new Map([["qwen-token-plan", 10]]));
    expect(budgetedProviderNames("not json")).toEqual(new Map());
  });

  it("fails closed when the ledger is unreachable", async () => {
    supabaseMock.rpc.mockImplementationOnce(() => ({
      single: () => Promise.reject(new Error("ledger down"))
    }));
    expect(await reserveLLMBudget("qwen-token-plan", 10)).toBe(false);
  });

  it("reserves through the atomic consume RPC and reports the verdict", async () => {
    mockRpcOnce({ data: { allowed: true }, error: null });
    expect(await reserveLLMBudget("qwen-token-plan", 10)).toBe(true);
    const [fn, args] = supabaseMock.rpc.mock.calls.at(-1)!;
    expect(fn).toBe("consume_llm_monthly_budget");
    expect(args.p_provider).toBe("qwen-token-plan");
    expect(args.p_budget_cny).toBe(10);
    expect(args.p_amount_cny).toBe(llmBudgetReserveCny());
    expect(args.p_month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("settlement refunds the unused difference and ignores unbudgeted providers", async () => {
    supabaseMock.rpc.mockClear();
    vi.stubEnv("LLM_PROVIDERS", JSON.stringify([{ name: "qwen-token-plan", base: "https://b", keyEnv: "K2", monthlyBudgetCny: 10 }]));
    await settleLLMBudget("some-free-pool", "qwen3.8-flash", { inputTokens: 1, outputTokens: 1, totalTokens: 2 });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    // 1k in + 1k out costs ≈¥0.0035; most of the ¥0.05 reserve refunds.
    await settleLLMBudget("qwen-token-plan", "qwen3.8-flash", { inputTokens: 1_000, outputTokens: 1_000, totalTokens: 2_000 });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("release_llm_monthly_budget", expect.objectContaining({
      p_provider: "qwen-token-plan"
    }));
  });
});

describe("withProviderFailover monthly budget gate", () => {
  it("skips a budget-exhausted provider and uses the next one in the chain", async () => {
    const chain = [
      { name: "qwen-token-plan", monthlyBudgetCny: 10 },
      { name: "deepseek" }
    ];
    mockRpcOnce({ data: { allowed: false }, error: null });
    const send = vi.fn().mockImplementation(async (provider: { name: string }) => `ok:${provider.name}`);
    expect(await withProviderFailover(chain, send)).toBe("ok:deepseek");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].name).toBe("deepseek");
  });

  it("attempts a budgeted provider while the reserve is allowed", async () => {
    mockRpcOnce({ data: { allowed: true }, error: null });
    const send = vi.fn().mockResolvedValue("ok");
    expect(await withProviderFailover([{ name: "qwen-token-plan", monthlyBudgetCny: 10 }], send)).toBe("ok");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refunds the reserve when the budgeted attempt fails", async () => {
    supabaseMock.rpc.mockReset();
    vi.stubEnv("LLM_PROVIDERS", JSON.stringify([{ name: "qwen-token-plan", base: "https://b", keyEnv: "K2", monthlyBudgetCny: 10 }]));
    mockRpcOnce({ data: { allowed: true }, error: null });
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      withProviderFailover([{ name: "qwen-token-plan", monthlyBudgetCny: 10 }], send)
    ).rejects.toThrow("boom");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const release = supabaseMock.rpc.mock.calls.find(([fn]) => fn === "release_llm_monthly_budget");
    expect(release).toBeTruthy();
  });
});
