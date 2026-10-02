import { afterEach, describe, expect, it, vi } from "vitest";

const budgetState = vi.hoisted(() => ({
  admin: null as null | { rpc: ReturnType<typeof vi.fn> }
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => budgetState.admin
}));

import {
  estimateImageNeurons,
  FLUX_KLEIN_9B_MODEL,
  reserveNeurons,
  releaseNeurons
} from "@/lib/workers-ai-budget";

const originalBudgetEnv = process.env.WORKERS_AI_DAILY_NEURON_BUDGET;

afterEach(() => {
  vi.restoreAllMocks();
  budgetState.admin = null;
  if (originalBudgetEnv === undefined) {
    delete process.env.WORKERS_AI_DAILY_NEURON_BUDGET;
  } else {
    process.env.WORKERS_AI_DAILY_NEURON_BUDGET = originalBudgetEnv;
  }
});

function makeAdmin(rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn((fn: string, args: unknown) => ({
    single: () => rpcImpl(fn, args)
  })) as unknown as { rpc: ReturnType<typeof vi.fn> }["rpc"];
  return { rpc };
}

describe("estimateImageNeurons", () => {
  it("estimates a single output tile's neurons for a 1024x1024 image", () => {
    // 1024x1024 = 2x2 = 4 output tiles at ~26.05 neurons/tile
    expect(estimateImageNeurons("1024x1024")).toBe(Math.ceil(4 * 26.05));
  });

  it("rounds up partial tiles for non-square, non-tile-aligned sizes", () => {
    // 768x1344 -> ceil(768/512)=2, ceil(1344/512)=3 -> 6 tiles
    expect(estimateImageNeurons("768x1344")).toBe(Math.ceil(6 * 26.05));
  });

  it("uses the higher first-megapixel price for Klein 9B covers", () => {
    expect(estimateImageNeurons("1024x1024", 0, FLUX_KLEIN_9B_MODEL)).toBe(Math.ceil(1363.64));
    expect(estimateImageNeurons("1344x768", 0, FLUX_KLEIN_9B_MODEL)).toBe(Math.ceil(1363.64));
  });

  it("conservatively rounds Klein 9B output and reference usage up", () => {
    expect(estimateImageNeurons("2048x1024", 0, FLUX_KLEIN_9B_MODEL)).toBe(
      Math.ceil(1363.64 + 181.82)
    );
    expect(estimateImageNeurons("1024x1024", 1, FLUX_KLEIN_9B_MODEL)).toBe(
      Math.ceil(1363.64 + 181.82)
    );
  });

  it("refuses to estimate an unapproved Workers AI model", () => {
    expect(estimateImageNeurons("1024x1024", 0, "@cf/example/unpriced-image-model")).toBeNull();
  });
});

describe("reserveNeurons", () => {
  it("fails closed when no Supabase admin client is available", async () => {
    budgetState.admin = null;
    await expect(reserveNeurons(100)).resolves.toEqual({ allowed: false });
  });

  it("fails closed when the RPC returns an error", async () => {
    budgetState.admin = makeAdmin(async () => ({ data: null, error: new Error("db down") }));
    await expect(reserveNeurons(100)).resolves.toEqual({ allowed: false });
  });

  it("fails closed when the RPC throws", async () => {
    budgetState.admin = {
      rpc: vi.fn(() => {
        throw new Error("network error");
      })
    };
    await expect(reserveNeurons(100)).resolves.toEqual({ allowed: false });
  });

  it("allows the request when the RPC reports budget remains", async () => {
    budgetState.admin = makeAdmin(async () => ({ data: { allowed: true, spent_after: 500 }, error: null }));
    await expect(reserveNeurons(100)).resolves.toEqual({ allowed: true });
  });

  it("disallows the request when the RPC reports the budget would be exceeded", async () => {
    budgetState.admin = makeAdmin(async () => ({ data: { allowed: false, spent_after: 9000 }, error: null }));
    await expect(reserveNeurons(100)).resolves.toEqual({ allowed: false });
  });
});

describe("releaseNeurons", () => {
  it("does not throw when no Supabase admin client is available", async () => {
    budgetState.admin = null;
    await expect(releaseNeurons(100)).resolves.toBeUndefined();
  });

  it("does not throw when the RPC call fails", async () => {
    budgetState.admin = {
      rpc: vi.fn(() => Promise.reject(new Error("down")))
    };
    await expect(releaseNeurons(100)).resolves.toBeUndefined();
  });
});
