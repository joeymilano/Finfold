import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBusinessMissionPlan: vi.fn(),
  getCreditSpendSummary: vi.fn(),
  getCreditAllowanceSnapshot: vi.fn()
}));

vi.mock("@/lib/business-mission-entitlements", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/business-mission-entitlements")>();
  return { ...original, resolveBusinessMissionPlan: mocks.resolveBusinessMissionPlan };
});

vi.mock("@/lib/payment", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/payment")>();
  return {
    ...original,
    getCreditSpendSummary: mocks.getCreditSpendSummary,
    getCreditAllowanceSnapshot: mocks.getCreditAllowanceSnapshot
  };
});

import { loadBusinessAccountabilityReview } from "@/lib/operations/business-review";

function query(result: { data: unknown; error: unknown; count?: number }) {
  const builder: Record<string, ReturnType<typeof vi.fn> | ((resolve: (value: unknown) => unknown) => Promise<unknown>)> = {};
  for (const method of ["select", "eq", "in", "gte", "lt", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("loadBusinessAccountabilityReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBusinessMissionPlan.mockResolvedValue("starter_v2");
    mocks.getCreditSpendSummary.mockResolvedValue(null);
    mocks.getCreditAllowanceSnapshot.mockResolvedValue(null);
  });

  it("keeps every database read tenant-scoped and paginates outcome evidence", async () => {
    const reviewed = query({ data: [{
      id: "mission-revenue",
      title: "Verify paid revenue",
      platform: "xiaohongshu",
      objective_type: "revenue",
      primary_metric: "成交收入",
      primary_metric_key: "revenue",
      target_value: 1000,
      execution_state: "completed",
      status: "completed",
      review_decision: "goal_achieved",
      review_bottleneck: null,
      review_evidence_note: null,
      reviewed_at: "2026-08-24T08:00:00.000Z",
      measurement_due_at: "2026-08-23T08:00:00.000Z",
      outcome: { actualValue: 840 }
    }], error: null });
    const due = query({ data: [], error: null });
    const missionCount = query({ data: null, error: null, count: 2 });
    const outcomeBuilder = query({ data: [], error: null });
    const outcomeRow = {
      mission_id: "mission-1",
      event_type: "lead",
      quantity: 1,
      value: 0,
      currency: "CNY",
      source: "typeform",
      occurred_at: "2026-08-24T08:00:00.000Z"
    };
    outcomeBuilder.range = vi.fn((from: number) => Promise.resolve({
      data: from === 0 ? Array.from({ length: 500 }, () => outcomeRow) : [outcomeRow],
      error: null
    }));
    const missionRevenueBuilder = query({ data: [], error: null });
    missionRevenueBuilder.range = vi.fn(() => Promise.resolve({
      data: [
        { mission_id: "mission-revenue", currency: "CNY", value: 800 },
        { mission_id: "mission-revenue", currency: "USD", value: 40 }
      ],
      error: null
    }));

    let growthReads = 0;
    let outcomeReads = 0;
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "outcome_events") {
          outcomeReads += 1;
          return outcomeReads <= 2 ? outcomeBuilder : missionRevenueBuilder;
        }
        growthReads += 1;
        if (growthReads === 1) return reviewed;
        if (growthReads === 2) return due;
        return missionCount;
      })
    };

    const review = await loadBusinessAccountabilityReview(
      admin as never,
      "tenant-user",
      new Date("2026-08-25T08:00:00.000Z")
    );

    expect(review.outcomes.leads).toBe(501);
    expect(review.resources.businessMissions).toEqual({ used: 2, limit: 4 });
    expect(outcomeBuilder.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(outcomeBuilder.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(review.decisions.replicate[0]).toMatchObject({
      actualValue: null,
      currency: null,
      revenueByCurrency: [
        { currency: "CNY", value: 800 },
        { currency: "USD", value: 40 }
      ]
    });
    expect(missionRevenueBuilder.in).toHaveBeenCalledWith("mission_id", ["mission-revenue"]);
    for (const scoped of [reviewed, due, missionCount, outcomeBuilder, missionRevenueBuilder]) {
      expect(scoped.eq).toHaveBeenCalledWith("user_id", "tenant-user");
    }
  });
});
