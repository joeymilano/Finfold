import { describe, expect, it } from "vitest";
import { buildFounderEvidence, type FounderEvidenceRows } from "@/lib/founder-evidence";

describe("founder evidence", () => {
  it("derives the activation funnel and flywheel lift from real rows", () => {
    const rows: FounderEvidenceRows = {
      profiles: [
        { id: "u1", plan: "growth", founding_member: true, created_at: "2026-07-01T00:00:00Z" },
        { id: "u2", plan: "free", founding_member: false, created_at: "2026-07-02T00:00:00Z" }
      ],
      kits: [
        { id: "k1", user_id: "u1", created_at: "2026-07-02T00:00:00Z", experiment_bucket: "treatment" },
        { id: "k2", user_id: "u2", created_at: "2026-07-03T00:00:00Z", experiment_bucket: "control" }
      ],
      outputs: [
        { id: "o1", kit_id: "k1", user_id: "u1", publish_status: "measured", user_edited: true, created_at: "2026-07-02T00:00:00Z", published_at: "2026-07-03T00:00:00Z" },
        { id: "o2", kit_id: "k2", user_id: "u2", publish_status: "posted", user_edited: false, created_at: "2026-07-03T00:00:00Z", published_at: "2026-07-04T00:00:00Z" }
      ],
      performance: [
        { kit_id: "k1", user_id: "u1", likes: 20, comments: 0, saves: 0, shares: 0, leads: 0, signups: 0, revenue: 0 },
        { kit_id: "k1", user_id: "u1", likes: 10, comments: 0, saves: 0, shares: 0, leads: 0, signups: 0, revenue: 9999 },
        { kit_id: "k2", user_id: "u2", likes: 10, comments: 0, saves: 0, shares: 0, leads: 0, signups: 0, revenue: 0 }
      ],
      subscriptions: [],
      activationCodes: [
        { batch_label: "July founders", plan: "pro", duration_days: 30, redeemed_by: "u1", redeemed_at: "2026-07-02T00:00:00Z", created_at: "2026-07-01T00:00:00Z" },
        { batch_label: "July founders", plan: "pro", duration_days: 30, redeemed_by: null, redeemed_at: null, created_at: "2026-07-01T00:00:00Z" }
      ],
      feedback: [
        { user_id: "u1", rating: "helpful", reason_codes: [], created_at: "2026-07-03T00:00:00Z" }
      ],
      brains: [
        { user_id: "u1", learned_style: ["short hooks"], learned_negative: [], performance_rules: [], approved_examples: [] }
      ],
      referrals: [
        {
          referrer_user_id: "u1",
          status: "completed",
          risk_flag: false,
          attributed_at: "2026-07-02T00:00:00Z",
          rewarded_at: "2026-07-03T00:00:00Z",
          referrer_reward_credits: 300,
          referred_reward_credits: 300
        },
        {
          referrer_user_id: "u1",
          status: "pending",
          risk_flag: true,
          attributed_at: "2026-07-04T00:00:00Z",
          rewarded_at: null,
          referrer_reward_credits: 300,
          referred_reward_credits: 300
        }
      ]
    };

    const evidence = buildFounderEvidence(rows, new Date("2026-07-10T00:00:00Z"));
    expect(evidence.acquisition.activationRate).toBe(100);
    expect(evidence.commercial.paidAccounts).toBe(1);
    expect(evidence.flywheel.helpfulRate).toBe(100);
    expect(evidence.flywheel.experiment.liftPercent).toBeNull();
    expect(evidence.flywheel.experiment.ready).toBe(false);
    expect(evidence.flywheel.experiment.treatment).toEqual({ samples: 1, averageScore: 15 });
    expect(evidence.funnel.map((stage) => stage.value)).toEqual([2, 2, 2, 2, 1]);
    expect(evidence.seedCohorts[0]).toMatchObject({ invited: 2, redeemed: 1, activated: 1, published: 1, measured: 1 });
    expect(evidence.referrals).toMatchObject({
      attributed: 2,
      completed: 1,
      activationRate: 50,
      uniqueReferrers: 1,
      completedPerReferrer: 1,
      rewardCreditsGranted: 600,
      riskFlagged: 1
    });
  });

  it("does not count activation-code trials as paid conversion", () => {
    const evidence = buildFounderEvidence({
      profiles: [{ id: "u1", plan: "pro", founding_member: false, created_at: "2026-07-01T00:00:00Z" }],
      kits: [], outputs: [], performance: [], feedback: [], brains: [], activationCodes: [],
      subscriptions: [{ user_id: "u1", status: "active", provider_customer_id: "activation_code", current_period_end: "2026-08-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z" }]
    }, new Date("2026-07-10T00:00:00Z"));
    expect(evidence.commercial.paidAccounts).toBe(0);
  });
});
