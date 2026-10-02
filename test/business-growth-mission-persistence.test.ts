import { beforeEach, describe, expect, it, vi } from "vitest";

const entitlementMocks = vi.hoisted(() => ({
  resolveBusinessMissionPlan: vi.fn(),
  enforceMonthlyBusinessMissionLimit: vi.fn()
}));

vi.mock("@/lib/business-mission-entitlements", () => entitlementMocks);

import { createBusinessGrowthMissionFollowUp } from "@/lib/agent/growth-missions";

const sourceMissionId = "22222222-2222-4222-8222-222222222222";
const nextMissionId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";

const sourceRow = {
  id: sourceMissionId,
  platform: "linkedin",
  status: "completed",
  stage: "conversion",
  title: "Get one qualified lead for the audited offer",
  hypothesis: "Use the observed buyer tension.",
  primary_metric: "有效线索",
  primary_metric_key: "leads",
  baseline_value: 0,
  target_value: 1,
  variants: [{ name: "主任务", angle: "Audited offer", hookInstruction: "Use observed tension", format: "One asset" }],
  workbench_idea: "Use only the audited business, offer, audience, and evidence.",
  kit_id: "44444444-4444-4444-8444-444444444444",
  mission_kind: "growth_opportunity",
  objective_type: "leads",
  execution_state: "completed",
  tracking_enabled: true,
  verdict: "won",
  outcome: { actualValue: 3, targetValue: 1 },
  source_briefing: { auditId: "audit-1", evidence: "Observed offer" },
  source_opportunity_id: "55555555-5555-4555-8555-555555555555",
  created_at: "2026-08-20T02:00:00.000Z",
  updated_at: "2026-08-24T02:00:00.000Z",
  completed_at: "2026-08-24T02:00:00.000Z"
};

describe("business Growth Mission persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementMocks.resolveBusinessMissionPlan.mockResolvedValue("starter");
    entitlementMocks.enforceMonthlyBusinessMissionLimit.mockResolvedValue(null);
  });

  it("creates one tenant-owned replication with evidence, source kit, and the measured target", async () => {
    let growthRead = 0;
    const insertedRows: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        if (table === "outcome_events") {
          return thenableQuery({
            data: [{ event_type: "lead", quantity: 3, value: 0, currency: "CNY" }],
            error: null
          });
        }
        if (table !== "growth_missions") throw new Error(`Unexpected table ${table}`);
        growthRead += 1;
        if (growthRead === 1) return terminalQuery({ data: sourceRow, error: null });
        if (growthRead === 2 || growthRead === 3) return terminalQuery({ data: null, error: null });
        return insertQuery((row) => {
          insertedRows.push(row);
          return {
            data: {
              ...sourceRow,
              ...row,
              id: nextMissionId,
              kit_id: null,
              verdict: null,
              outcome: null,
              completed_at: null
            },
            error: null
          };
        });
      }
    };

    const result = await createBusinessGrowthMissionFollowUp(admin as never, userId, "zh", sourceMissionId);
    const inserted = insertedRows[0];

    expect(result.existing).toBe(false);
    expect(result.mission).toMatchObject({
      id: nextMissionId,
      title: "复现：Get one qualified lead for the audited offer",
      targetValue: 3,
      missionKind: "growth_opportunity",
      objectiveType: "leads"
    });
    expect(inserted).toMatchObject({
      user_id: userId,
      platform: "linkedin",
      target_value: 3,
      mission_kind: "growth_opportunity",
      objective_type: "leads",
      source_opportunity_id: sourceRow.source_opportunity_id,
      source_briefing: {
        auditId: "audit-1",
        evidence: "Observed offer",
        followUpStrategy: "replicate_verified_business_result",
        followUpSource: {
          missionId: sourceMissionId,
          actualValue: 3,
          currency: "CNY",
          sourceKitId: sourceRow.kit_id
        }
      }
    });
    expect(String(inserted.workbench_idea)).toContain("不编造客户、归因、流量、转化或收入");
    expect(entitlementMocks.enforceMonthlyBusinessMissionLimit).toHaveBeenCalledWith(admin, userId, "starter", "zh");
  });

  it("creates one tenant-owned repair mission from the reviewed breakpoint", async () => {
    const repairSource = {
      ...sourceRow,
      verdict: "lost",
      outcome: { actualValue: 0, targetValue: 1 },
      review_decision: "fix_bottleneck",
      review_bottleneck: "landing_page",
      review_evidence_note: "CRM 与落地页表单均未出现新增有效咨询。",
      reviewed_at: "2026-08-24T02:00:00.000Z"
    };
    let growthRead = 0;
    const insertedRows: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        if (table === "outcome_events") return thenableQuery({ data: [], error: null });
        if (table !== "growth_missions") throw new Error(`Unexpected table ${table}`);
        growthRead += 1;
        if (growthRead === 1) return terminalQuery({ data: repairSource, error: null });
        if (growthRead === 2 || growthRead === 3) return terminalQuery({ data: null, error: null });
        return insertQuery((row) => {
          insertedRows.push(row);
          return {
            data: {
              ...repairSource,
              ...row,
              id: nextMissionId,
              kit_id: null,
              verdict: null,
              outcome: null,
              completed_at: null
            },
            error: null
          };
        });
      }
    };

    const result = await createBusinessGrowthMissionFollowUp(admin as never, userId, "zh", sourceMissionId);

    expect(result.mission).toMatchObject({
      id: nextMissionId,
      title: "修复：Get one qualified lead for the audited offer",
      targetValue: 1,
      missionKind: "growth_opportunity"
    });
    expect(insertedRows[0]).toMatchObject({
      target_value: 1,
      source_briefing: {
        followUpStrategy: "repair_one_reviewed_business_bottleneck",
        followUpSource: {
          reviewDecision: "fix_bottleneck",
          reviewBottleneck: "landing_page",
          reviewEvidence: repairSource.review_evidence_note
        }
      }
    });
    expect(String(insertedRows[0].workbench_idea)).toContain("不宣称该断点已经被证明");
  });
});

function terminalQuery(result: { data: unknown; error: unknown }) {
  const query = chainable();
  return Object.assign(query, {
    maybeSingle: vi.fn().mockResolvedValue(result)
  });
}

function thenableQuery(result: { data: unknown; error: unknown }) {
  return Object.assign(chainable(), {
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(result).then(resolve);
    }
  });
}

function insertQuery(resolveInsert: (row: Record<string, unknown>) => { data: unknown; error: unknown }) {
  let result: { data: unknown; error: unknown } = { data: null, error: new Error("Insert was not called") };
  return Object.assign(chainable(), {
    insert: vi.fn((row: Record<string, unknown>) => {
      result = resolveInsert(row);
      return Object.assign(chainable(), { single: vi.fn().mockResolvedValue(result) });
    })
  });
}

function chainable() {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  return query;
}
