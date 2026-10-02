import { describe, expect, it } from "vitest";
import { businessMissionLimitForPlan } from "@/lib/business-mission-entitlements";
import { buildBusinessAccountabilityReview } from "@/lib/operations/business-review";

const now = new Date("2026-08-25T08:00:00.000Z");

function mission(overrides: Record<string, unknown>) {
  return {
    id: "mission-base",
    title: "Get qualified consulting leads",
    platform: "xiaohongshu",
    objective_type: "leads",
    primary_metric: "有效线索",
    primary_metric_key: "leads",
    target_value: 3,
    execution_state: "completed",
    status: "completed",
    review_decision: "goal_achieved",
    review_bottleneck: null,
    review_evidence_note: null,
    reviewed_at: "2026-08-24T08:00:00.000Z",
    measurement_due_at: "2026-08-23T08:00:00.000Z",
    outcome: { actualValue: 4, targetValue: 3 },
    ...overrides
  };
}

describe("business accountability review", () => {
  it("separates recorded outcomes, user decisions, currencies, and paid resources", () => {
    const review = buildBusinessAccountabilityReview({
      now,
      periodKey: "2026-08",
      periodStart: "2026-08-01T00:00:00Z",
      periodEnd: "2026-09-01T00:00:00Z",
      reviewedMissions: [
        mission({ id: "repeat" }),
        mission({
          id: "repair",
          title: "Repair landing-page conversion",
          review_decision: "fix_bottleneck",
          review_bottleneck: "landing_page",
          review_evidence_note: "CRM and the form recorded no qualified leads.",
          outcome: { actualValue: 0, targetValue: 3 }
        }),
        mission({
          id: "evidence",
          title: "Wait for payment evidence",
          primary_metric: "成交收入",
          primary_metric_key: "revenue",
          review_decision: "collect_more_evidence",
          review_evidence_note: "Payment reconciliation is not complete yet.",
          execution_state: "measuring",
          status: "posted",
          outcome: { actualValue: 800, targetValue: 1000 }
        })
      ] as never,
      dueMissions: [mission({ id: "due", review_decision: null, reviewed_at: null, execution_state: "review_due", status: "posted" })] as never,
      outcomes: [
        { mission_id: "repeat", event_type: "lead", quantity: 4, value: 0, currency: "CNY", source: "typeform", occurred_at: "2026-08-24T07:00:00.000Z" },
        { mission_id: "repeat", event_type: "signup", quantity: 2, value: 0, currency: "CNY", source: "manual", occurred_at: "2026-08-24T06:00:00.000Z" },
        { mission_id: "evidence", event_type: "revenue", quantity: 1, value: 800, currency: "CNY", source: "stripe", occurred_at: "2026-08-24T05:00:00.000Z" },
        { mission_id: "usd", event_type: "revenue", quantity: 1, value: 40, currency: "USD", source: "stripe", occurred_at: "2026-08-24T04:00:00.000Z" }
      ],
      plan: "growth_v2",
      businessMissionsUsed: 5,
      creditSpend: {
        items: [{ action: "agentStep", credits: 80 }],
        grossReserved: 100,
        refunded: 20,
        netCharged: 80,
        manualCredits: 0,
        manualDebits: 0,
        expiredCredits: 0
      },
      creditAllowance: { used: 100, available: 7420 }
    });

    expect(review.outcomes).toMatchObject({
      leads: 4,
      signups: 2,
      purchases: 0,
      recordedEvents: 4,
      automaticEvents: 3,
      manualEvents: 1
    });
    expect(review.outcomes.revenueByCurrency).toEqual([
      { currency: "CNY", value: 800 },
      { currency: "USD", value: 40 }
    ]);
    expect(review.decisions.replicate.map((item) => item.id)).toEqual(["repeat"]);
    expect(review.decisions.repair[0]).toMatchObject({ id: "repair", bottleneck: "landing_page" });
    expect(review.decisions.collectEvidence[0]).toMatchObject({ id: "evidence", currency: "CNY" });
    expect(review.decisions.collectEvidence[0].revenueByCurrency).toEqual([{ currency: "CNY", value: 800 }]);
    expect(review.decisions.reviewDue.map((item) => item.id)).toEqual(["due"]);
    expect(review.resources).toMatchObject({
      plan: "growth_v2",
      businessMissions: { used: 5, limit: 12 },
      credits: { planAllowance: 7500, planUsed: 100, netCharged: 80, refunded: 20 }
    });
  });

  it("leaves unavailable credit evidence null instead of inventing zero usage", () => {
    const review = buildBusinessAccountabilityReview({
      now,
      periodKey: "2026-08",
      periodStart: "2026-08-01T00:00:00Z",
      periodEnd: "2026-09-01T00:00:00Z",
      reviewedMissions: [],
      dueMissions: [],
      outcomes: [],
      plan: "free",
      businessMissionsUsed: 0,
      creditSpend: null,
      creditAllowance: null
    });

    expect(review.outcomes.recordedEvents).toBe(0);
    expect(review.resources.credits).toBeNull();
    expect(review.resources.businessMissions).toEqual({ used: 0, limit: 1 });
  });

  it("uses one shared mission-cap policy for reporting and enforcement", () => {
    expect(businessMissionLimitForPlan("free")).toBe(1);
    expect(businessMissionLimitForPlan("starter_v2")).toBe(4);
    expect(businessMissionLimitForPlan("creator_v2")).toBe(12);
    expect(businessMissionLimitForPlan("digital_employee_v2")).toBe(12);
  });

  it("never turns multiple mission currencies into one comparable amount", () => {
    const review = buildBusinessAccountabilityReview({
      now,
      periodKey: "2026-08",
      periodStart: "2026-08-01T00:00:00Z",
      periodEnd: "2026-09-01T00:00:00Z",
      reviewedMissions: [mission({
        id: "mixed-revenue",
        primary_metric: "成交收入",
        primary_metric_key: "revenue",
        target_value: 1_000,
        outcome: { actualValue: 840, targetValue: 1_000 }
      })] as never,
      dueMissions: [],
      outcomes: [
        { mission_id: "mixed-revenue", event_type: "revenue", quantity: 1, value: 800, currency: "CNY", source: "stripe", occurred_at: "2026-08-24T05:00:00.000Z" },
        { mission_id: "mixed-revenue", event_type: "revenue", quantity: 1, value: 40, currency: "USD", source: "stripe", occurred_at: "2026-08-24T04:00:00.000Z" }
      ],
      plan: "growth_v2",
      businessMissionsUsed: 1,
      creditSpend: null,
      creditAllowance: null
    });

    expect(review.decisions.replicate[0]).toMatchObject({
      actualValue: null,
      currency: null,
      revenueByCurrency: [
        { currency: "CNY", value: 800 },
        { currency: "USD", value: 40 }
      ]
    });
  });
});
