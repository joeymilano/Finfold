import { describe, expect, it } from "vitest";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import {
  buildBusinessMissionFollowUp,
  buildBusinessMissionRepairFollowUp
} from "@/lib/business-mission-follow-up";
import { emptyMissionOutcomeSummary } from "@/lib/mission-attribution";

function mission(overrides: Partial<GrowthMission> = {}): GrowthMission {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    platform: "linkedin",
    status: "completed",
    stage: "conversion",
    title: "Get one qualified lead",
    hypothesis: "A concrete offer should create one qualified inquiry.",
    primaryMetric: "有效线索",
    primaryMetricKey: "leads",
    baselineValue: 0,
    targetValue: 1,
    variants: [],
    workbenchIdea: "Use the audited offer and audience.",
    kitId: null,
    missionKind: "growth_opportunity",
    objectiveType: "leads",
    executionState: "completed",
    trackingEnabled: true,
    measurementWindowDays: 14,
    measurementStartedAt: "2026-08-10T02:00:00.000Z",
    measurementDueAt: "2026-08-24T02:00:00.000Z",
    reviewDecision: "goal_achieved",
    reviewBottleneck: null,
    reviewEvidenceNote: null,
    reviewedAt: "2026-08-24T02:00:00.000Z",
    verdict: "won",
    outcome: { actualValue: 3, targetValue: 1 },
    createdAt: "2026-08-20T02:00:00.000Z",
    updatedAt: "2026-08-24T02:00:00.000Z",
    completedAt: "2026-08-24T02:00:00.000Z",
    ...overrides
  };
}

describe("business mission follow-up", () => {
  it("repeats the measured lead result instead of inventing a higher target", () => {
    const summary = { ...emptyMissionOutcomeSummary(), leads: 3 };

    const preview = buildBusinessMissionFollowUp(mission(), summary, "zh");

    expect(preview.title).toBe("复现已达成的获客结果");
    expect(preview.nextMissionTitle).toBe("复现：Get one qualified lead");
    expect(preview.actualValue).toBe(3);
    expect(preview.nextTargetValue).toBe(3);
    expect(preview.hypothesis).toContain("再次达到3 个有效线索");
    expect(preview.workbenchPreamble).toContain("不编造客户、归因、流量、转化或收入");
  });

  it("preserves revenue currency and exact recorded value", () => {
    const summary = { ...emptyMissionOutcomeSummary("USD"), revenue: 1299.5 };

    const preview = buildBusinessMissionFollowUp(mission({
      objectiveType: "purchases",
      primaryMetric: "Revenue",
      primaryMetricKey: "revenue",
      targetValue: 999
    }), summary, "en");

    expect(preview.title).toBe("Repeat the revenue result");
    expect(preview.nextTargetValue).toBe(1299.5);
    expect(preview.hypothesis).toContain("USD 1,299.5");
  });

  it("refuses to repeat a result that no longer reaches the saved target", () => {
    const summary = { ...emptyMissionOutcomeSummary(), signups: 1 };

    expect(() => buildBusinessMissionFollowUp(mission({
      objectiveType: "signups",
      primaryMetricKey: "signups",
      targetValue: 2
    }), summary, "zh")).toThrow("尚未达到");
  });

  it("refuses a corrupted objective-to-metric mapping", () => {
    const summary = { ...emptyMissionOutcomeSummary(), leads: 3 };

    expect(() => buildBusinessMissionFollowUp(mission({ primaryMetricKey: "revenue" }), summary, "zh"))
      .toThrow("目标与已保存指标不一致");
  });

  it("creates a one-breakpoint repair without inventing causality or a higher target", () => {
    const summary = { ...emptyMissionOutcomeSummary(), leads: 0 };
    const preview = buildBusinessMissionRepairFollowUp(mission({
      verdict: "lost",
      reviewDecision: "fix_bottleneck",
      reviewBottleneck: "landing_page",
      reviewEvidenceNote: "CRM 中没有新增有效咨询，落地页也没有表单提交。",
      outcome: { actualValue: 0, targetValue: 1 }
    }), summary, "zh");

    expect(preview.nextMissionTitle).toBe("修复：Get one qualified lead");
    expect(preview.nextTargetValue).toBe(1);
    expect(preview.bottleneckLabel).toBe("落地页承诺与证据");
    expect(preview.hypothesis).toContain("不代表已经证明因果关系");
    expect(preview.workbenchPreamble).toContain("不要把客户隐私写入对外内容");
  });
});
